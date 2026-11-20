-- RNH Imports: security hardening after the November 2026 audit.
-- Safe to run twice. Run as postgres on the store database (tables are owned
-- by store_rhimports, functions by postgres, as before).
--
-- Server code connects as the database owner with no auth.uid() and no
-- request role; the checks below apply to browser callers only.

-- ---------------------------------------------------------------------------
-- 1. Orders: visitors and customers no longer write orders or order lines, or
--    read guest orders, through the data API. Checkout, the pay page and the
--    confirmation page use server routes.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Enable insert for all users" ON public.orders;
DROP POLICY IF EXISTS "Enable select for guest orders" ON public.orders;
DROP POLICY IF EXISTS "Enable insert for order items" ON public.order_items;
DROP POLICY IF EXISTS "Enable select for guest order items" ON public.order_items;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_quantity_positive') THEN
    ALTER TABLE public.order_items ADD CONSTRAINT order_items_quantity_positive CHECK (quantity > 0);
  END IF;
END $$;

-- A retried till sale with the same key can never create a second order.
CREATE UNIQUE INDEX IF NOT EXISTS orders_idempotency_key_uniq
  ON public.orders ((metadata->>'idempotency_key'))
  WHERE metadata ? 'idempotency_key';

-- ---------------------------------------------------------------------------
-- 2. Functions: browsers can no longer overwrite customer records; the server
--    role gets the functions it was missing since the move from Supabase
--    (customer stats and campaign recipient lists were failing silently).
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.upsert_customer_from_order(text, text, text, text, text, uuid, jsonb) FROM PUBLIC, rnh_anon, rnh_authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_customer_from_order(text, text, text, text, text, uuid, jsonb) TO store_rhimports;
GRANT EXECUTE ON FUNCTION public.update_customer_stats(text, numeric) TO store_rhimports;
GRANT EXECUTE ON FUNCTION public.reduce_stock_on_order(uuid) TO store_rhimports;
GRANT EXECUTE ON FUNCTION public.get_all_customer_emails() TO store_rhimports;
GRANT EXECUTE ON FUNCTION public.get_all_customer_phones() TO store_rhimports;
GRANT EXECUTE ON FUNCTION public.mark_order_paid(text, text) TO store_rhimports;

-- ---------------------------------------------------------------------------
-- 3. mark_order_paid: do nothing the second time. Returns the order either
--    way, with "already_paid": true when it was paid before this call. Stock
--    comes off the right variant; a coupon is counted once.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_order_paid(order_ref text, moolre_ref text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  updated_order orders;
  existing_order orders;
BEGIN
  IF auth.role() IS NOT NULL AND auth.role() <> 'service_role' AND NOT public.is_admin_or_staff() THEN
    RAISE EXCEPTION 'Not authorized to mark orders as paid';
  END IF;

  UPDATE orders
  SET payment_status = 'paid',
      status = CASE
        WHEN status = 'pending'          THEN 'processing'::order_status
        WHEN status = 'awaiting_payment' THEN 'processing'::order_status
        ELSE status
      END,
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'moolre_reference',    moolre_ref,
        'payment_verified_at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )
  WHERE order_number = order_ref
    AND payment_status IS DISTINCT FROM 'paid'
  RETURNING * INTO updated_order;

  IF updated_order.id IS NULL THEN
    SELECT * INTO existing_order FROM orders WHERE order_number = order_ref;
    IF existing_order.id IS NULL THEN
      RETURN NULL;
    END IF;
    RETURN to_jsonb(existing_order) || '{"already_paid": true}'::jsonb;
  END IF;

  IF (updated_order.metadata->>'stock_reduced') IS NULL THEN
    -- Variant lines: by variant id, else by variant name.
    UPDATE product_variants pv
    SET    quantity = GREATEST(0, pv.quantity - oi.quantity), updated_at = now()
    FROM   order_items oi
    WHERE  oi.order_id = updated_order.id
      AND  oi.variant_id IS NOT NULL
      AND  oi.variant_id = pv.id;

    UPDATE product_variants pv
    SET    quantity = GREATEST(0, pv.quantity - oi.quantity), updated_at = now()
    FROM   order_items oi
    WHERE  oi.order_id = updated_order.id
      AND  oi.variant_id IS NULL
      AND  oi.product_id = pv.product_id
      AND  oi.variant_name IS NOT NULL
      AND  oi.variant_name = pv.name;

    -- Products without variants: straight off the product.
    UPDATE products p
    SET    quantity = GREATEST(0, p.quantity - oi.quantity), updated_at = now()
    FROM   order_items oi
    WHERE  oi.order_id = updated_order.id
      AND  oi.product_id = p.id
      AND  NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id);

    -- Products with variants: the product total is the sum of its variants.
    UPDATE products p
    SET    quantity = s.total, updated_at = now()
    FROM (
      SELECT v.product_id, COALESCE(SUM(v.quantity), 0)::int AS total
      FROM   product_variants v
      WHERE  v.product_id IN (
        SELECT DISTINCT oi.product_id FROM order_items oi
        WHERE oi.order_id = updated_order.id AND oi.product_id IS NOT NULL
      )
      GROUP BY v.product_id
    ) s
    WHERE p.id = s.product_id;

    UPDATE orders
    SET    metadata = COALESCE(metadata, '{}'::jsonb) || '{"stock_reduced": true}'::jsonb
    WHERE  id = updated_order.id
    RETURNING * INTO updated_order;
  END IF;

  IF COALESCE(updated_order.metadata->>'coupon_code', '') <> '' THEN
    UPDATE coupons SET usage_count = COALESCE(usage_count, 0) + 1, updated_at = now()
    WHERE upper(code) = upper(updated_order.metadata->>'coupon_code');
  END IF;

  RETURN to_jsonb(updated_order);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Coupons: codes are no longer readable by visitors; checkout validates a
--    code on the server.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow anon read access to coupons" ON public.coupons;
DROP POLICY IF EXISTS "Allow authenticated read access to coupons" ON public.coupons;
DROP POLICY IF EXISTS "Staff read coupons" ON public.coupons;
CREATE POLICY "Staff read coupons" ON public.coupons
  FOR SELECT USING (public.is_admin_or_staff());

-- ---------------------------------------------------------------------------
-- 5. Reviews, returns and support tickets: customers cannot approve their own
--    review, set a refund, read staff-only notes or reassign a ticket.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._reviews_pin_moderation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.is_admin_or_staff() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'pending';
    NEW.helpful_votes := 0;
  ELSE
    NEW.helpful_votes := OLD.helpful_votes;
    NEW.user_id := OLD.user_id;
    NEW.product_id := OLD.product_id;
    IF NEW.rating IS DISTINCT FROM OLD.rating
       OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.content IS DISTINCT FROM OLD.content THEN
      NEW.status := 'pending';
    ELSE
      NEW.status := OLD.status;
    END IF;
  END IF;
  NEW.verified_purchase := EXISTS (
    SELECT 1 FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
    WHERE o.user_id = NEW.user_id
      AND o.payment_status = 'paid'
      AND oi.product_id = NEW.product_id
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_reviews_pin_moderation ON public.reviews;
CREATE TRIGGER trg_reviews_pin_moderation
  BEFORE INSERT OR UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public._reviews_pin_moderation();

CREATE OR REPLACE FUNCTION public._returns_pin_for_customers()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.is_admin_or_staff() THEN
    RETURN NEW;
  END IF;
  NEW.status := 'pending';
  NEW.refund_amount := NULL;
  NEW.refund_method := NULL;
  NEW.admin_notes := NULL;
  IF NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = NEW.order_id AND o.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'That order is not on your account';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_returns_pin_for_customers ON public.return_requests;
CREATE TRIGGER trg_returns_pin_for_customers
  BEFORE INSERT ON public.return_requests
  FOR EACH ROW EXECUTE FUNCTION public._returns_pin_for_customers();

DROP POLICY IF EXISTS "Users view ticket messages" ON public.support_messages;
CREATE POLICY "Users view ticket messages" ON public.support_messages FOR SELECT
  USING (is_internal = false AND EXISTS (
    SELECT 1 FROM public.support_tickets t
    WHERE t.id = support_messages.ticket_id AND t.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users create messages" ON public.support_messages;
CREATE POLICY "Users create messages" ON public.support_messages FOR INSERT
  WITH CHECK (is_internal = false AND user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.support_tickets t
    WHERE t.id = support_messages.ticket_id AND t.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users manage own tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Users view own tickets" ON public.support_tickets;
CREATE POLICY "Users view own tickets" ON public.support_tickets FOR SELECT
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users create own tickets" ON public.support_tickets;
CREATE POLICY "Users create own tickets" ON public.support_tickets FOR INSERT
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users update own tickets" ON public.support_tickets;
CREATE POLICY "Users update own tickets" ON public.support_tickets FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public._tickets_pin_for_customers()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.is_admin_or_staff() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.assigned_to := NULL;
    NEW.priority := 'medium';
    NEW.status := 'open';
  ELSE
    NEW.assigned_to := OLD.assigned_to;
    NEW.priority := OLD.priority;
    NEW.user_id := OLD.user_id;
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status NOT IN ('open', 'closed') THEN
      NEW.status := OLD.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_tickets_pin_for_customers ON public.support_tickets;
CREATE TRIGGER trg_tickets_pin_for_customers
  BEFORE INSERT OR UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public._tickets_pin_for_customers();

-- ---------------------------------------------------------------------------
-- 6. Catalogue: variants of draft or archived products are no longer public.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public view variants" ON public.product_variants;
CREATE POLICY "Public view variants" ON public.product_variants FOR SELECT
  USING (public.is_admin_or_staff() OR EXISTS (
    SELECT 1 FROM public.products p WHERE p.id = product_variants.product_id AND p.status = 'active'));

-- ---------------------------------------------------------------------------
-- 7. Contact form and newsletter: saved by the server only; staff read them
--    in the dashboard and mark a message handled.
-- ---------------------------------------------------------------------------
ALTER TABLE public.contact_submissions ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'new';
DROP POLICY IF EXISTS "Anyone can submit contact form" ON public.contact_submissions;
DROP POLICY IF EXISTS "Staff update contact submissions" ON public.contact_submissions;
CREATE POLICY "Staff update contact submissions" ON public.contact_submissions
  FOR UPDATE USING (public.is_admin_or_staff()) WITH CHECK (public.is_admin_or_staff());

CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  source text,
  unsubscribed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.newsletter_subscribers OWNER TO store_rhimports;
CREATE UNIQUE INDEX IF NOT EXISTS newsletter_subscribers_email_key
  ON public.newsletter_subscribers (lower(email));
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff read newsletter subscribers" ON public.newsletter_subscribers;
CREATE POLICY "Staff read newsletter subscribers" ON public.newsletter_subscribers
  FOR SELECT USING (public.is_admin_or_staff());
GRANT SELECT ON public.newsletter_subscribers TO rnh_authenticated;

-- ---------------------------------------------------------------------------
-- 8. Sessions: a counter that signs out old sessions when a password changes
--    or an account is banned.
-- ---------------------------------------------------------------------------
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 9. New trigger functions are not callable directly.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public._reviews_pin_moderation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public._returns_pin_for_customers() FROM PUBLIC;
REVOKE ALL ON FUNCTION public._tickets_pin_for_customers() FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 10. Customer totals: recalculated from paid orders that are not cancelled
--     or refunded. The stored totals went stale after the move from Supabase
--     and were never reduced by a refund. Server-only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recompute_customer_stats(p_customer_id uuid DEFAULT NULL)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  changed integer;
BEGIN
  WITH s AS (
    SELECT c.id,
           count(o.id)::int            AS n,
           COALESCE(sum(o.total), 0)   AS t,
           max(o.created_at)           AS last_at
    FROM customers c
    LEFT JOIN orders o
      ON o.payment_status = 'paid'
     AND o.status NOT IN ('cancelled', 'refunded')
     AND (
          (c.user_id IS NOT NULL AND o.user_id = c.user_id)
       OR (o.email !~* '@(pos|store)\.local$'
           AND lower(o.email) IN (lower(c.email), lower(c.secondary_email)))
       OR (length(regexp_replace(COALESCE(o.phone, ''), '\D', '', 'g')) >= 9
           AND right(regexp_replace(o.phone, '\D', '', 'g'), 9) IN (
                 right(regexp_replace(COALESCE(c.phone, ''), '\D', '', 'g'), 9),
                 right(regexp_replace(COALESCE(c.secondary_phone, ''), '\D', '', 'g'), 9)))
     )
    WHERE p_customer_id IS NULL OR c.id = p_customer_id
    GROUP BY c.id
  )
  UPDATE customers c
  SET    total_orders = s.n,
         total_spent = s.t,
         last_order_at = COALESCE(s.last_at, c.last_order_at),
         updated_at = now()
  FROM   s
  WHERE  c.id = s.id
    AND (c.total_orders IS DISTINCT FROM s.n OR c.total_spent IS DISTINCT FROM s.t);
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recompute_customer_stats_for_order(p_order_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cid uuid;
  total integer := 0;
BEGIN
  FOR cid IN
    SELECT c.id
    FROM orders o
    JOIN customers c
      ON (c.user_id IS NOT NULL AND o.user_id = c.user_id)
      OR (o.email !~* '@(pos|store)\.local$'
          AND lower(o.email) IN (lower(c.email), lower(c.secondary_email)))
      OR (length(regexp_replace(COALESCE(o.phone, ''), '\D', '', 'g')) >= 9
          AND right(regexp_replace(o.phone, '\D', '', 'g'), 9) IN (
                right(regexp_replace(COALESCE(c.phone, ''), '\D', '', 'g'), 9),
                right(regexp_replace(COALESCE(c.secondary_phone, ''), '\D', '', 'g'), 9)))
    WHERE o.id = p_order_id
  LOOP
    total := total + public.recompute_customer_stats(cid);
  END LOOP;
  RETURN total;
END;
$function$;

REVOKE ALL ON FUNCTION public.recompute_customer_stats(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recompute_customer_stats_for_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recompute_customer_stats(uuid) TO store_rhimports;
GRANT EXECUTE ON FUNCTION public.recompute_customer_stats_for_order(uuid) TO store_rhimports;

SELECT public.recompute_customer_stats();
