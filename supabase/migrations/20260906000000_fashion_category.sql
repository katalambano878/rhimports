INSERT INTO public.categories (name, slug, description, image_url, status, position, metadata)
VALUES (
  'Fashion',
  'fashion',
  'Streetwear collection — tops, trousers and everyday style.',
  '/images/fashion/streetwear-hero.png',
  'active',
  0,
  '{"featured": true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  image_url = COALESCE(public.categories.image_url, EXCLUDED.image_url),
  status = 'active';
