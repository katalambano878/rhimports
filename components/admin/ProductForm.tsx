'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { DEFAULT_OPTION_GROUPS } from '@/lib/product-options';

interface ProductFormProps {
    initialData?: any;
    isEditMode?: boolean;
}

export default function ProductForm({ initialData, isEditMode = false }: ProductFormProps) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [categories, setCategories] = useState<any[]>([]);

    const [productName, setProductName] = useState(initialData?.name || '');
    const [categoryId, setCategoryId] = useState(initialData?.category_id || '');
    const [price, setPrice] = useState(initialData?.price || '');
    const [comparePrice, setComparePrice] = useState(initialData?.compare_at_price || '');
    const [sku, setSku] = useState(initialData?.sku || '');
    // Stock as loaded; edit mode writes quantity only when the field was changed,
    // so sales made while the form was open are not overwritten.
    const initialStockValue = String(initialData?.quantity ?? '');
    const [stock, setStock] = useState<string>(initialStockValue);
    const [moq, setMoq] = useState(initialData?.moq || '1');
    const [lowStockThreshold, setLowStockThreshold] = useState(initialData?.metadata?.low_stock_threshold || '5');
    const [description, setDescription] = useState(initialData?.description || '');
    // Database values are lowercase ('active' | 'draft' | 'archived').
    const [status, setStatus] = useState<string>(() => {
        const s = String(initialData?.status || 'active').toLowerCase();
        return ['active', 'draft', 'archived'].includes(s) ? s : 'active';
    });
    const [formError, setFormError] = useState('');
    const [featured, setFeatured] = useState(initialData?.featured || false);
    const [preorderShipping, setPreorderShipping] = useState(initialData?.metadata?.preorder_shipping || '');
    const [isPreorder, setIsPreorder] = useState<boolean>(
        initialData?.metadata?.is_preorder ?? !!initialData?.metadata?.preorder_shipping
    );
    const [activeTab, setActiveTab] = useState('general');

    // Auto-generate SKU function
    const generateSku = () => {
        const prefix = process.env.NEXT_PUBLIC_SKU_PREFIX || 'SKU';
        const timestamp = Date.now().toString(36).toUpperCase().slice(-4);
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `${prefix}-${timestamp}-${random}`;
    };

    const PRESET_COLORS = [
        { name: 'Black',  hex: '#000000' },
        { name: 'White',  hex: '#FFFFFF' },
        { name: 'Red',    hex: '#EF4444' },
        { name: 'Blue',   hex: '#3B82F6' },
        { name: 'Navy',   hex: '#1e3a8a' },
        { name: 'Green',  hex: '#22C55E' },
        { name: 'Yellow', hex: '#EAB308' },
        { name: 'Pink',   hex: '#EC4899' },
        { name: 'Purple', hex: '#A855F7' },
        { name: 'Orange', hex: '#F97316' },
        { name: 'Gray',   hex: '#6B7280' },
        { name: 'Brown',  hex: '#92400E' },
        { name: 'Beige',  hex: '#D4B896' },
        { name: 'Maroon', hex: '#800000' },
        { name: 'Teal',   hex: '#0D9488' },
        { name: 'Cream',  hex: '#FFFDD0' },
        { name: 'Gold',   hex: '#D4AF37' },
        { name: 'Silver', hex: '#C0C0C0' },
    ];
    const PRESET_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];

    // Option group definitions live in `lib/product-options.ts` so the admin
    // form and the customer-facing product page always agree on keys/labels.

    // State: which option groups are enabled + their current values
    type OptionGroupState = {
        enabled: boolean;
        values: string[];
        generatesVariants: boolean;
    };

    const [optionGroupStates, setOptionGroupStates] = useState<Record<string, OptionGroupState>>(() => {
        const stored = initialData?.metadata?.product_options as Record<string, { values: string[]; generatesVariants?: boolean }> | undefined;
        const state: Record<string, OptionGroupState> = {};
        DEFAULT_OPTION_GROUPS.forEach(def => {
            if (stored && stored[def.key]) {
                state[def.key] = {
                    enabled: true,
                    values: stored[def.key].values || def.defaultValues,
                    generatesVariants: stored[def.key].generatesVariants ?? def.generatesVariants,
                };
            } else {
                state[def.key] = {
                    enabled: false,
                    values: def.defaultValues,
                    generatesVariants: def.generatesVariants,
                };
            }
        });
        return state;
    });

    // Custom (non-default) option groups — for other product types
    const [customGroups, setCustomGroups] = useState<{ name: string; values: string[]; generatesVariants: boolean }[]>(() => {
        const storedCustom = initialData?.metadata?.custom_option_groups as { name: string; values: string[]; generatesVariants?: boolean }[] | undefined;
        return (storedCustom || []).map((g) => ({ ...g, generatesVariants: g.generatesVariants ?? true }));
    });
    const [customGroupInput, setCustomGroupInput] = useState('');

    // Color picker state
    const [colorPickerHex, setColorPickerHex] = useState('#000000');
    const [colorPickerName, setColorPickerName] = useState('');

    const [customOptionInput, setCustomOptionInput] = useState<Record<string, string>>({});

    const toggleOptionGroup = (key: string) => {
        setOptionGroupStates(prev => ({
            ...prev,
            [key]: { ...prev[key], enabled: !prev[key].enabled },
        }));
    };

    const toggleGeneratesVariants = (key: string) => {
        setOptionGroupStates(prev => ({
            ...prev,
            [key]: { ...prev[key], generatesVariants: !prev[key].generatesVariants },
        }));
    };

    const addValueToGroup = (key: string, value: string) => {
        if (!value.trim()) return;
        setOptionGroupStates(prev => {
            const g = prev[key];
            if (g.values.includes(value.trim())) return prev;
            return { ...prev, [key]: { ...g, values: [...g.values, value.trim()] } };
        });
        setCustomOptionInput(prev => ({ ...prev, [key]: '' }));
    };

    const removeValueFromGroup = (key: string, value: string) => {
        setOptionGroupStates(prev => ({
            ...prev,
            [key]: { ...prev[key], values: prev[key].values.filter(v => v !== value) },
        }));
    };

    const addColorValue = () => {
        const label = colorPickerName.trim() || colorPickerHex;
        const colorVal = `${label}|${colorPickerHex}`;
        setOptionGroupStates(prev => {
            const g = prev['color'];
            if (g.values.some(v => v.split('|')[1] === colorPickerHex)) return prev;
            return { ...prev, color: { ...g, values: [...g.values, colorVal] } };
        });
        setColorPickerName('');
    };

    const togglePresetColor = (name: string, hex: string) => {
        const existing = optionGroupStates['color']?.values.find(v => v.startsWith(name + '|'));
        if (existing) {
            const newVals = optionGroupStates['color'].values.filter(v => !v.startsWith(name + '|'));
            setOptionGroupStates(prev => ({ ...prev, color: { ...prev['color'], values: newVals, enabled: newVals.length > 0 } }));
        } else {
            setOptionGroupStates(prev => ({ ...prev, color: { ...prev['color'], values: [...prev['color'].values, `${name}|${hex}`], enabled: true } }));
        }
    };

    const togglePresetSize = (size: string) => {
        const grp = optionGroupStates['size'];
        if (!grp) return;
        if (grp.values.includes(size)) {
            const newVals = grp.values.filter(v => v !== size);
            setOptionGroupStates(prev => ({ ...prev, size: { ...prev['size'], values: newVals, enabled: newVals.length > 0 } }));
        } else {
            setOptionGroupStates(prev => ({ ...prev, size: { ...prev['size'], values: [...prev['size'].values, size], enabled: true } }));
        }
    };

    const resetGroupToDefaults = (key: string) => {
        const def = DEFAULT_OPTION_GROUPS.find(d => d.key === key);
        if (!def) return;
        setOptionGroupStates(prev => ({
            ...prev,
            [key]: { ...prev[key], values: def.defaultValues },
        }));
    };

    // Custom group helpers
    const addCustomGroup = () => {
        const name = customGroupInput.trim();
        if (!name || customGroups.some(g => g.name === name)) return;
        setCustomGroups(prev => [...prev, { name, values: [], generatesVariants: false }]);
        setCustomGroupInput('');
    };
    const removeCustomGroup = (idx: number) => setCustomGroups(prev => prev.filter((_, i) => i !== idx));
    const addCustomGroupValue = (idx: number, val: string) => {
        if (!val.trim()) return;
        setCustomGroups(prev => prev.map((g, i) => i === idx && !g.values.includes(val.trim()) ? { ...g, values: [...g.values, val.trim()] } : g));
        setCustomOptionInput(prev => ({ ...prev, [`custom_${idx}`]: '' }));
    };
    const removeCustomGroupValue = (idx: number, val: string) => {
        setCustomGroups(prev => prev.map((g, i) => i === idx ? { ...g, values: g.values.filter(v => v !== val) } : g));
    };

    // Build the variant-generating groups for price/stock table
    const enabledDefaults = DEFAULT_OPTION_GROUPS.filter(d => optionGroupStates[d.key]?.enabled && optionGroupStates[d.key]?.values.length > 0);
    const variantGeneratingGroups = [
        ...enabledDefaults.filter(d => optionGroupStates[d.key].generatesVariants).map(d => ({
            name: d.label,
            values: d.key === 'color' ? optionGroupStates[d.key].values.map(v => v.split('|')[0]) : optionGroupStates[d.key].values,
        })),
        ...customGroups.filter(g => g.generatesVariants && g.values.length > 0).map(g => ({ name: g.name, values: g.values })),
    ];

    // Legacy compat: optionGroups / activeGroups used in handleSubmit
    const activeGroups = variantGeneratingGroups;

    const existingVariants = (initialData?.product_variants || []).map((v: any) => ({
        ...v,
        stock: v.stock ?? v.quantity ?? 0,
    }));

    // Variant data map keyed by joined option values
    const [variantData, setVariantData] = useState<Record<string, { price: string; stock: string; sku: string }>>(() => {
        const data: Record<string, { price: string; stock: string; sku: string }> = {};
        const storedNames: string[] = initialData?.metadata?.option_names || [];
        (initialData?.product_variants || []).forEach((v: any) => {
            const values = storedNames
                .map((_: string, idx: number) => (v[`option${idx + 1}`] as string) || '')
                .filter(Boolean);
            if (values.length > 0) {
                data[values.join('|||')] = {
                    price: v.price?.toString() || '',
                    stock: (v.stock ?? v.quantity ?? 0).toString(),
                    sku: v.sku || '',
                };
            }
        });
        return data;
    });

    // Variant rows whose stock the admin changed in this form (keyed like variantData).
    const [touchedStockKeys, setTouchedStockKeys] = useState<Set<string>>(() => new Set());
    const markStockTouched = (keys: string[]) => {
        setTouchedStockKeys(prev => {
            const next = new Set(prev);
            keys.forEach(k => next.add(k));
            return next;
        });
    };

    const cartesian = (arrays: string[][]): string[][] => {
        if (arrays.length === 0) return [[]];
        const [first, ...rest] = arrays;
        const restProduct = cartesian(rest);
        return first.flatMap(item => restProduct.map(combo => [item, ...combo]));
    };

    const variantCombinations = activeGroups.length > 0
        ? cartesian(activeGroups.map(g => g.values)).map(values => ({
            values,
            key: values.join('|||'),
        }))
        : [];

    const variants = variantCombinations.map(combo => {
        const d = variantData[combo.key] || { price: price?.toString() || '', stock: '0', sku: '' };
        return { key: combo.key, values: combo.values, sku: d.sku, price: d.price || price?.toString() || '', stock: d.stock || '0' };
    });

    const updateVariantField = (key: string, field: string, value: string) => {
        if (field === 'stock') markStockTouched([key]);
        setVariantData(prev => ({
            ...prev,
            [key]: { ...prev[key] || { price: price?.toString() || '', stock: '0', sku: '' }, [field]: value },
        }));
    };

    const bulkSetField = (field: 'price' | 'stock', value: string) => {
        if (field === 'stock') markStockTouched(variantCombinations.map(c => c.key));
        setVariantData(prev => {
            const updated = { ...prev };
            variantCombinations.forEach(combo => {
                updated[combo.key] = { ...updated[combo.key] || { price: price?.toString() || '', stock: '0', sku: '' }, [field]: value };
            });
            return updated;
        });
    };

    // Images
    const [images, setImages] = useState<any[]>(() =>
        [...(initialData?.product_images || [])].sort((a: any, b: any) => (Number(a.position) || 0) - (Number(b.position) || 0))
    );
    const [uploading, setUploading] = useState(false);

    // SEO
    const [seoTitle, setSeoTitle] = useState(initialData?.seo_title || '');
    const [metaDescription, setMetaDescription] = useState(initialData?.seo_description || '');
    const [urlSlug, setUrlSlug] = useState(initialData?.slug || '');
    const [keywords, setKeywords] = useState(initialData?.tags?.join(', ') || '');

    const tabs = [
        { id: 'general', label: 'General', icon: 'ri-information-line' },
        { id: 'pricing', label: 'Pricing & Inventory', icon: 'ri-price-tag-3-line' },
        { id: 'variants', label: 'Variants', icon: 'ri-layout-grid-line' },
        { id: 'images', label: 'Images', icon: 'ri-image-line' },
        { id: 'seo', label: 'SEO', icon: 'ri-search-line' }
    ];

    // Fetch categories on mount
    useEffect(() => {
        async function fetchCategories() {
            const { data } = await supabase.from('categories').select('id, name').eq('status', 'active');
            if (data) {
                setCategories(data);
                if (data.length > 0 && !categoryId) {
                    setCategoryId(data[0].id);
                }
            }
        }
        fetchCategories();
    }, [categoryId]);

    // Auto-generate slug from name if not manually edited
    useEffect(() => {
        if (!isEditMode && productName && !urlSlug) {
            setUrlSlug(productName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, ''));
        }
    }, [productName, isEditMode, urlSlug]);

    // Auto-generate SKU for new products
    useEffect(() => {
        if (!isEditMode && !sku) {
            setSku(generateSku());
        }
    }, [isEditMode]); // eslint-disable-line react-hooks/exhaustive-deps

    const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo'];
    const isVideoFile = (url: string) => /\.(mp4|webm|ogg|mov|avi)$/i.test(url);

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        try {
            if (!e.target.files || e.target.files.length === 0) return;

            setUploading(true);
            const file = e.target.files[0];
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random()}.${fileExt}`;
            const filePath = `${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('products')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('products')
                .getPublicUrl(filePath);

            setImages([...images, { url: publicUrl, position: images.length, is_video: VIDEO_TYPES.includes(file.type) }]);

        } catch (error: any) {
            alert('Error uploading file: ' + error.message);
        } finally {
            setUploading(false);
        }
    };

    const handleRemoveImage = (indexToRemove: number) => {
        setImages(images.filter((_, idx) => idx !== indexToRemove));
    };

    // Variant helpers removed — variants are now auto-generated from selectedColors × selectedSizes

    const validateForm = (): string | null => {
        const name = productName.trim();
        if (!name) return 'Enter a product name.';
        const priceNum = Number(price);
        // A product sold in options is priced per option: its own price may be empty or 0.
        const pricedOptions = variants.filter((v) => Number(v.price) > 0);
        const soldInOptions = variants.length > 0;
        if (soldInOptions) {
            if (!Number.isFinite(priceNum) || priceNum < 0) return 'Enter a valid price (GH₵), or leave it empty and price each option.';
            if (status === 'active' && priceNum <= 0 && pricedOptions.length !== variants.length) {
                return 'Give every option a price above GH₵0 (Variants tab), or set a product price.';
            }
        } else {
            if (price === '' || !Number.isFinite(priceNum) || priceNum < 0) return 'Enter a valid price (GH₵).';
            if (status === 'active' && priceNum <= 0) {
                return 'An active product must have a price above GH₵0. Set a price, or save it as Draft.';
            }
        }
        if (comparePrice !== '' && comparePrice !== null && !Number.isFinite(Number(comparePrice))) {
            return 'Compare-at price must be a number (or leave it empty).';
        }
        const slug = (urlSlug || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
        if (!slug) return 'Enter a URL slug (letters or numbers).';
        if (variants.length === 0) {
            if (stock !== '' && (!Number.isFinite(Number(stock)) || Number(stock) < 0)) return 'Stock cannot be negative.';
        } else {
            for (const v of variants) {
                const label = v.values.join(' / ') || 'Default';
                const vp = Number(v.price);
                if (!Number.isFinite(vp) || vp < 0) return `Variant "${label}" has an invalid price.`;
                if (status === 'active' && vp <= 0) return `Variant "${label}" needs a price above GH₵0 for an active product.`;
                if (!Number.isFinite(Number(v.stock)) || Number(v.stock) < 0) return `Variant "${label}" has invalid stock.`;
            }
        }
        if (activeGroups.length > 3) return 'At most 3 option groups can create variants.';
        return null;
    };

    const handleSubmit = async () => {
        if (loading) return;
        const problem = validateForm();
        if (problem) {
            setFormError(problem);
            alert(problem);
            return;
        }
        setFormError('');
        const notices: string[] = [];
        let createdId: string | null = null;
        try {
            setLoading(true);

            const hasVariants = variants.length > 0;
            const initiallyHadVariants = (initialData?.product_variants || []).length > 0;
            const variantStockTotal = variants.reduce((sum, v) => sum + (parseInt(v.stock) || 0), 0);

            // Re-read metadata right before saving: payment callbacks, the till or other
            // tools may have written keys since the form opened. Only our keys change.
            let currentMetadata: Record<string, any> = initialData?.metadata || {};
            if (isEditMode && initialData?.id) {
                const { data: fresh, error: freshError } = await supabase
                    .from('products')
                    .select('metadata')
                    .eq('id', initialData.id)
                    .maybeSingle();
                if (freshError) throw new Error('Could not re-read the product before saving: ' + freshError.message);
                if (!fresh) throw new Error('This product no longer exists or you cannot edit it.');
                currentMetadata = (fresh.metadata && typeof fresh.metadata === 'object') ? fresh.metadata : {};
            }

            const thresholdNum = parseInt(lowStockThreshold);
            const metadata: Record<string, any> = {
                ...currentMetadata,
                low_stock_threshold: Number.isFinite(thresholdNum) && thresholdNum >= 0 ? thresholdNum : 5,
                is_preorder: isPreorder,
                preorder_shipping: isPreorder ? (preorderShipping.trim() || null) : null,
                option_names: activeGroups.map((g, i) => g.name || `Option ${i + 1}`),
                product_options: Object.fromEntries(
                    enabledDefaults.map(d => [d.key, {
                        // Persist the label alongside the values so the
                        // customer page doesn't have to look it up from
                        // a parallel map. See lib/product-options.ts.
                        label: d.label,
                        values: optionGroupStates[d.key].values,
                        generatesVariants: optionGroupStates[d.key].generatesVariants,
                    }])
                ),
                custom_option_groups: customGroups.filter(g => g.values.length > 0),
            };

            // Stock: new products always; edits only when the stock field was changed
            // (variant products get their total re-summed from the variants after sync).
            const stockFields: Record<string, number> = !isEditMode
                ? { quantity: hasVariants ? variantStockTotal : (parseInt(stock) || 0) }
                : !hasVariants && (String(stock) !== initialStockValue || initiallyHadVariants)
                    ? { quantity: parseInt(stock) || 0 }
                    : {};

            const productData = {
                name: productName.trim(),
                slug: urlSlug || productName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, ''),
                description,
                category_id: categoryId || null,
                price: Number(price) || 0,
                compare_at_price: comparePrice !== '' && comparePrice !== null ? Number(comparePrice) : null,
                sku: sku || generateSku(), // Auto-generate if empty
                ...stockFields,
                moq: parseInt(moq) || 1,
                status,
                featured,
                seo_title: seoTitle,
                seo_description: metaDescription,
                tags: (keywords as string).split(',').map((k: string) => k.trim()).filter(Boolean),
                metadata,
            };

            let productId = initialData?.id;

            if (isEditMode && productId) {
                const { data: saved, error: updateError } = await supabase
                    .from('products')
                    .update(productData)
                    .eq('id', productId)
                    .select('id')
                    .maybeSingle();
                if (updateError) throw new Error('Could not save the product: ' + updateError.message);
                if (!saved) throw new Error('The product was not saved. Sign in with a staff account and try again.');
            } else {
                const { data: newProduct, error: insertError } = await supabase
                    .from('products')
                    .insert([productData])
                    .select('id')
                    .single();
                if (insertError) throw new Error('Could not create the product: ' + insertError.message);
                if (!newProduct) throw new Error('The product was not created.');
                productId = newProduct.id;
                createdId = newProduct.id;
            }

            // ── Images: insert new, re-order kept, delete removed (in that order, so a
            // failure part-way never leaves the product without its images). ──
            {
                let existingImages: any[] = [];
                if (isEditMode) {
                    const { data, error } = await supabase
                        .from('product_images')
                        .select('id, url, position')
                        .eq('product_id', productId);
                    if (error) throw new Error('Product saved, but its images could not be read: ' + error.message);
                    existingImages = data || [];
                }
                const existingById = new Map(existingImages.map((img: any) => [img.id, img]));
                const keptIds = new Set<string>();

                const toInsert = images
                    .map((img, idx) => ({ img, idx }))
                    .filter(({ img }) => !img.id || !existingById.has(img.id));
                if (toInsert.length > 0) {
                    const { error } = await supabase.from('product_images').insert(
                        toInsert.map(({ img, idx }) => ({
                            product_id: productId,
                            url: img.url,
                            position: idx,
                            alt_text: img.alt_text || productName.trim(),
                        }))
                    );
                    if (error) throw new Error('Product saved, but new images were not added: ' + error.message + '. Your existing images were kept.');
                }

                for (const [idx, img] of images.entries()) {
                    if (!img.id || !existingById.has(img.id)) continue;
                    keptIds.add(img.id);
                    if (Number(existingById.get(img.id).position) !== idx) {
                        const { error } = await supabase
                            .from('product_images')
                            .update({ position: idx })
                            .eq('id', img.id);
                        if (error) throw new Error('Product saved, but the image order was not saved: ' + error.message);
                    }
                }

                const removedImageIds = existingImages.map((img: any) => img.id).filter((id: string) => !keptIds.has(id));
                if (removedImageIds.length > 0) {
                    const { error } = await supabase.from('product_images').delete().in('id', removedImageIds);
                    if (error) throw new Error('Product saved, but removed images could not be deleted: ' + error.message);
                }
            }

            // ── Variants: update existing by id, insert new, delete only removed
            // variants that no order references. ──
            {
                type DbVariant = { id: string; option1: string | null; option2: string | null; option3: string | null; name: string; quantity: number | null; metadata: any };
                let dbVariants: DbVariant[] = [];
                if (isEditMode) {
                    const { data, error } = await supabase
                        .from('product_variants')
                        .select('id, name, option1, option2, option3, quantity, metadata')
                        .eq('product_id', productId)
                        .order('created_at', { ascending: true });
                    if (error) throw new Error('Product saved, but its variants could not be read: ' + error.message);
                    dbVariants = (data || []) as DbVariant[];
                }

                const keyOf = (v: DbVariant) => [v.option1, v.option2, v.option3].filter(Boolean).join('|||');
                const dbByKey = new Map<string, DbVariant>();
                dbVariants.forEach(v => {
                    const k = keyOf(v);
                    if (k && !dbByKey.has(k)) dbByKey.set(k, v);
                });

                const matchedIds = new Set<string>();
                const inserts: any[] = [];
                for (const v of variants) {
                    const existing = dbByKey.get(v.key);
                    const fields: Record<string, any> = {
                        name: v.values.join(' / ') || 'Default',
                        sku: v.sku || null,
                        price: Number(v.price) || 0,
                        option1: v.values[0] || null,
                        option2: v.values[1] || null,
                        option3: v.values[2] || null,
                    };
                    if (existing) {
                        matchedIds.add(existing.id);
                        // Only write stock the admin changed here.
                        if (touchedStockKeys.has(v.key)) fields.quantity = parseInt(v.stock) || 0;
                        const { error } = await supabase
                            .from('product_variants')
                            .update(fields)
                            .eq('id', existing.id);
                        if (error) throw new Error(`Product saved, but variant "${fields.name}" was not updated: ${error.message}`);
                    } else {
                        inserts.push({ ...fields, product_id: productId, quantity: parseInt(v.stock) || 0, metadata: {} });
                    }
                }

                if (inserts.length > 0) {
                    const { error } = await supabase.from('product_variants').insert(inserts);
                    if (error) throw new Error('Product saved, but new variants were not added: ' + error.message);
                }

                const removed = dbVariants.filter(v => !matchedIds.has(v.id));
                if (removed.length > 0) {
                    const removedIds = removed.map(v => v.id);
                    const { data: refs, error: refsError } = await supabase
                        .from('order_items')
                        .select('variant_id')
                        .in('variant_id', removedIds);
                    if (refsError) throw new Error('Product saved, but removed variants could not be checked against orders: ' + refsError.message);
                    const referenced = new Set((refs || []).map((r: any) => r.variant_id));
                    const kept: string[] = [];
                    for (const v of removed) {
                        if (referenced.has(v.id)) {
                            kept.push(v.name || keyOf(v));
                            continue;
                        }
                        const { error } = await supabase.from('product_variants').delete().eq('id', v.id);
                        if (error) kept.push(v.name || keyOf(v));
                    }
                    if (kept.length > 0) {
                        notices.push(
                            `${kept.length} removed variant${kept.length === 1 ? ' was' : 's were'} kept because past orders or carts use ${kept.length === 1 ? 'it' : 'them'}: ${kept.join(', ')}. ` +
                            'To stop selling one, add its option back and set its stock to 0.'
                        );
                    }
                }

                // Variant products: product stock = sum of the variants as stored now.
                if (hasVariants) {
                    const { data: current, error } = await supabase
                        .from('product_variants')
                        .select('quantity')
                        .eq('product_id', productId);
                    if (error) throw new Error('Product saved, but its total stock could not be recalculated: ' + error.message);
                    const total = (current || []).reduce((sum: number, r: any) => sum + (Number(r.quantity) || 0), 0);
                    const { error: qtyError } = await supabase.from('products').update({ quantity: total }).eq('id', productId);
                    if (qtyError) throw new Error('Product saved, but its total stock was not updated: ' + qtyError.message);
                }
            }

            alert((isEditMode ? 'Product updated.' : 'Product created.') + (notices.length ? '\n\n' + notices.join('\n\n') : ''));
            router.push('/admin/products');

        } catch (err: any) {
            console.error('Error saving product:', err);
            const message = err?.message || 'Unknown error';
            setFormError(message);
            if (createdId) {
                // The product row exists; continue in the edit form so a retry does not create a duplicate.
                alert(`The product was created, but not everything was saved: ${message}\n\nOpening it for editing so you can finish.`);
                router.push(`/admin/products/${createdId}`);
            } else {
                alert(`Error: ${message}`);
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                    <Link
                        href="/admin/products"
                        className="w-10 h-10 flex items-center justify-center border-2 border-gray-300 rounded-lg hover:border-gray-400 transition-colors"
                    >
                        <i className="ri-arrow-left-line text-xl text-gray-700"></i>
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">
                            {isEditMode ? 'Edit Product' : 'Add New Product'}
                        </h1>
                        <p className="text-gray-600 mt-1">
                            {isEditMode ? 'Update product information and settings' : 'Create a new product for your catalog'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center space-x-3">
                    {isEditMode && (
                        <Link
                            href={`/product/${initialData?.id}`}
                            target="_blank"
                            className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:border-gray-400 transition-colors font-semibold whitespace-nowrap cursor-pointer flex items-center"
                        >
                            <i className="ri-eye-line mr-2"></i>
                            Preview
                        </Link>
                    )}
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className={`px-6 py-3 bg-primary hover:bg-primary text-white rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer flex items-center ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
                    >
                        {loading ? (
                            <>
                                <i className="ri-loader-4-line animate-spin mr-2"></i>
                                Saving...
                            </>
                        ) : (
                            <>
                                <i className="ri-save-line mr-2"></i>
                                {isEditMode ? 'Save Changes' : 'Create Product'}
                            </>
                        )}
                    </button>
                </div>
            </div>

            {formError && (
                <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2">
                    <i className="ri-error-warning-line text-lg leading-none"></i>
                    <span>{formError}</span>
                </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="border-b border-gray-200 overflow-x-auto">
                    <div className="flex">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center space-x-2 px-6 py-4 font-semibold whitespace-nowrap transition-colors border-b-2 cursor-pointer ${activeTab === tab.id
                                    ? 'border-gray-900 text-gray-900 bg-gray-50'
                                    : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                                    }`}
                            >
                                <i className={`${tab.icon} text-xl`}></i>
                                <span>{tab.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="p-8">
                    {activeTab === 'general' && (
                        <div className="space-y-6 max-w-3xl">
                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-2">
                                    Product Name *
                                </label>
                                <input
                                    type="text"
                                    value={productName}
                                    onChange={(e) => setProductName(e.target.value)}
                                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                                    placeholder="Enter product name"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-2">
                                    Description
                                </label>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    rows={6}
                                    maxLength={500}
                                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 resize-none"
                                    placeholder="Describe your product..."
                                />
                                <p className="text-sm text-gray-500 mt-2">{description.length}/500 characters</p>
                            </div>

                            <div className="grid md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                                        Category *
                                    </label>
                                    <select
                                        value={categoryId}
                                        onChange={(e) => setCategoryId(e.target.value)}
                                        className="w-full px-4 py-3 pr-8 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 cursor-pointer"
                                    >
                                        {categories.length === 0 && <option value="">Loading categories...</option>}
                                        {categories.length > 0 && <option value="">Select a category</option>}
                                        {categories.map(cat => (
                                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                                        Status
                                    </label>
                                    <select
                                        value={status}
                                        onChange={(e) => setStatus(e.target.value)}
                                        className="w-full px-4 py-3 pr-8 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 cursor-pointer"
                                    >
                                        <option value="active">Active (shown in shop)</option>
                                        <option value="draft">Draft (hidden)</option>
                                        <option value="archived">Archived (hidden)</option>
                                    </select>
                                </div>
                            </div>

                            <div className="flex items-center space-x-3">
                                <input
                                    type="checkbox"
                                    checked={featured}
                                    onChange={(e) => setFeatured(e.target.checked)}
                                    className="w-5 h-5 text-gray-900 border-gray-300 rounded focus:ring-gray-600 cursor-pointer"
                                />
                                <label className="text-gray-900 font-medium">
                                    Feature this product on homepage
                                </label>
                            </div>

                            <div className="rounded-2xl border border-gray-200 p-4">
                                <div className="flex items-start gap-3">
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={isPreorder}
                                        onClick={() => setIsPreorder(!isPreorder)}
                                        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 ${isPreorder ? 'bg-amber-500' : 'bg-gray-300'}`}
                                    >
                                        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${isPreorder ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                    </button>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-semibold text-gray-900">Pre-order</span>
                                            {isPreorder ? (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5">
                                                    <i className="ri-time-line"></i> Preorder
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5">
                                                    <i className="ri-checkbox-circle-line"></i> Available
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1">
                                            When turned on, this product is marked as a pre-order. A <span className="font-semibold text-amber-600">Preorder</span> badge shows on the product card; otherwise customers see an <span className="font-semibold text-emerald-600">Available</span> badge.
                                        </p>

                                        {isPreorder && (
                                            <div className="mt-4">
                                                <label className="block text-sm font-semibold text-gray-900 mb-2">
                                                    Estimated ship / availability
                                                </label>
                                                <input
                                                    type="text"
                                                    value={preorderShipping}
                                                    onChange={(e) => setPreorderShipping(e.target.value)}
                                                    placeholder="e.g., Ships in 14 days, Available March 15"
                                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-600 focus:border-transparent transition-all"
                                                />
                                                <p className="text-xs text-gray-500 mt-1">Optional. Shown on the product card and order summary so customers know when to expect the item.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'pricing' && (
                        <div className="space-y-6 max-w-3xl">
                            <div className="grid md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                                        Price (GH₵) *
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 font-semibold">GH₵</span>
                                        <input
                                            type="number"
                                            value={price}
                                            onChange={(e) => setPrice(e.target.value)}
                                            className="w-full pl-16 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                                            step="0.01"
                                            placeholder="0.00"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                                        Compare at Price (GH₵)
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 font-semibold">GH₵</span>
                                        <input
                                            type="number"
                                            value={comparePrice}
                                            onChange={(e) => setComparePrice(e.target.value)}
                                            className="w-full pl-16 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                                            step="0.01"
                                            placeholder="0.00"
                                        />
                                    </div>
                                    <p className="text-sm text-gray-500 mt-2">Show original price for comparison</p>
                                </div>
                            </div>

                            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                <p className="text-blue-900 font-semibold mb-1">Discount Calculation</p>
                                {price && comparePrice && parseFloat(comparePrice) > parseFloat(price) ? (
                                    <p className="text-blue-800">
                                        Savings: GH₵ {(parseFloat(comparePrice) - parseFloat(price)).toFixed(2)}
                                        <span className="ml-2">
                                            ({(((parseFloat(comparePrice) - parseFloat(price)) / parseFloat(comparePrice)) * 100).toFixed(0)}% off)
                                        </span>
                                    </p>
                                ) : (
                                    <p className="text-blue-800 text-sm">Enter a valid compare price higher than the price to see discount.</p>
                                )}
                            </div>

                            <div className="pt-6 border-t border-gray-200">
                                <h3 className="text-lg font-bold text-gray-900 mb-4">Inventory</h3>

                                <div className="grid md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                                            SKU (Auto-generated)
                                        </label>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={sku}
                                                onChange={(e) => setSku(e.target.value)}
                                                className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 font-mono bg-gray-50"
                                                placeholder="Auto-generated"
                                                readOnly
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setSku(generateSku())}
                                                className="px-4 py-3 border-2 border-gray-300 rounded-lg hover:border-gray-600 hover:bg-gray-50 transition-colors cursor-pointer"
                                                title="Generate new SKU"
                                            >
                                                <i className="ri-refresh-line text-lg"></i>
                                            </button>
                                        </div>
                                        <p className="text-sm text-gray-500 mt-1">SKU is auto-generated. Click refresh to generate a new one.</p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                                            Stock Quantity *
                                        </label>
                                        {variants.length > 0 ? (
                                            <div>
                                                <input
                                                    type="number"
                                                    value={variants.reduce((sum: number, v: any) => sum + (parseInt(v.stock) || 0), 0)}
                                                    readOnly
                                                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
                                                />
                                                <p className="text-sm text-amber-600 mt-1 flex items-center">
                                                    <i className="ri-information-line mr-1"></i>
                                                    Stock is managed per variant. Edit stock in the Variants tab.
                                                </p>
                                            </div>
                                        ) : (
                                            <input
                                                type="number"
                                                value={stock}
                                                onChange={(e) => setStock(e.target.value)}
                                                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                                                placeholder="0"
                                            />
                                        )}
                                    </div>
                                </div>

                                <div className="grid md:grid-cols-2 gap-6 mt-6">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                                            Minimum Order Quantity (MOQ)
                                        </label>
                                        <input
                                            type="number"
                                            value={moq}
                                            onChange={(e) => setMoq(e.target.value)}
                                            min="1"
                                            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                                            placeholder="1"
                                        />
                                        <p className="text-sm text-gray-500 mt-1">Minimum quantity customers must order</p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                                            Low Stock Threshold
                                        </label>
                                        <input
                                            type="number"
                                            value={lowStockThreshold}
                                            onChange={(e) => setLowStockThreshold(e.target.value)}
                                            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                                        />
                                        <p className="text-sm text-gray-500 mt-1">Get notified when stock falls below this number</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'variants' && (
                        <div className="space-y-6 max-w-3xl">

                            {/* Step 1 — Colors */}
                            <div className="border border-gray-200 rounded-xl p-6">
                                <div className="flex items-center gap-2 mb-1">
                                    <i className="ri-palette-line text-primary text-lg"></i>
                                    <h3 className="font-bold text-gray-900">Step 1: Select Colors</h3>
                                </div>
                                <p className="text-sm text-gray-500 mb-5">Click colors to add/remove. Skip if product has no color options.</p>

                                <div className="flex flex-wrap gap-2 mb-5">
                                    {PRESET_COLORS.map(({ name, hex }) => {
                                        const selected = optionGroupStates['color']?.values.some(v => v.startsWith(name + '|'));
                                        return (
                                            <button
                                                key={name}
                                                type="button"
                                                onClick={() => togglePresetColor(name, hex)}
                                                className={`flex items-center gap-2 px-3 py-1.5 rounded-full border-2 text-sm font-medium transition-all cursor-pointer ${selected ? 'border-gray-900 bg-gray-50 shadow-sm' : 'border-gray-200 hover:border-gray-400'}`}
                                            >
                                                <span className="w-4 h-4 rounded-full border border-gray-300 flex-shrink-0" style={{ backgroundColor: hex }} />
                                                <span className="text-gray-700">{name}</span>
                                                {selected && <i className="ri-check-line text-xs text-gray-700"></i>}
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Custom color */}
                                <div className="flex items-center gap-2">
                                    <input
                                        type="color"
                                        value={colorPickerHex}
                                        onChange={e => setColorPickerHex(e.target.value)}
                                        className="w-10 h-10 rounded-lg border-2 border-gray-300 cursor-pointer p-0.5 flex-shrink-0"
                                    />
                                    <input
                                        type="text"
                                        value={colorPickerName}
                                        onChange={e => setColorPickerName(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && addColorValue()}
                                        placeholder="Custom color name"
                                        className="flex-1 px-4 py-2.5 border-2 border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                                    />
                                    <button
                                        type="button"
                                        onClick={addColorValue}
                                        className="px-4 py-2.5 bg-gray-700 hover:bg-primary text-white rounded-lg text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer"
                                    >
                                        Add Color
                                    </button>
                                </div>

                                {(optionGroupStates['color']?.values.length ?? 0) > 0 && (
                                    <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-100">
                                        {optionGroupStates['color'].values.map(val => {
                                            const [name, hex] = val.split('|');
                                            return (
                                                <span key={val} className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm font-medium shadow-sm">
                                                    <span className="w-3.5 h-3.5 rounded-full border border-gray-300" style={{ backgroundColor: hex || '#000' }} />
                                                    {name}
                                                    <button type="button" onClick={() => removeValueFromGroup('color', val)} className="text-gray-400 hover:text-red-500 ml-1">
                                                        <i className="ri-close-line text-xs"></i>
                                                    </button>
                                                </span>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Step 2 — Sizes */}
                            <div className="border border-gray-200 rounded-xl p-6">
                                <div className="flex items-center gap-2 mb-1">
                                    <i className="ri-ruler-line text-primary text-lg"></i>
                                    <h3 className="font-bold text-gray-900">Step 2: Select Sizes</h3>
                                </div>
                                <p className="text-sm text-gray-500 mb-5">Click sizes to add/remove. Use custom for volumes (100ml), weights, etc.</p>

                                <div className="flex flex-wrap gap-2 mb-5">
                                    {PRESET_SIZES.map(size => {
                                        const selected = optionGroupStates['size']?.values.includes(size);
                                        return (
                                            <button
                                                key={size}
                                                type="button"
                                                onClick={() => togglePresetSize(size)}
                                                className={`px-4 py-2 rounded-lg border-2 text-sm font-semibold transition-all cursor-pointer ${selected ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-700 hover:border-gray-400'}`}
                                            >
                                                {size}
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Custom size */}
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={customOptionInput['size'] || ''}
                                        onChange={e => setCustomOptionInput(prev => ({ ...prev, size: e.target.value }))}
                                        onKeyDown={e => e.key === 'Enter' && addValueToGroup('size', customOptionInput['size'] || '')}
                                        placeholder="Custom size (e.g. 100ml, One Size, 42)"
                                        className="flex-1 px-4 py-2.5 border-2 border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => addValueToGroup('size', customOptionInput['size'] || '')}
                                        className="px-4 py-2.5 bg-gray-700 hover:bg-primary text-white rounded-lg text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer"
                                    >
                                        Add Size
                                    </button>
                                </div>

                                {(optionGroupStates['size']?.values.filter(v => !PRESET_SIZES.includes(v)).length ?? 0) > 0 && (
                                    <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-100">
                                        {optionGroupStates['size'].values.filter(v => !PRESET_SIZES.includes(v)).map(val => (
                                            <span key={val} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm font-medium shadow-sm">
                                                {val}
                                                <button type="button" onClick={() => removeValueFromGroup('size', val)} className="text-gray-400 hover:text-red-500">
                                                    <i className="ri-close-line text-xs"></i>
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Variant Price/Stock Grid */}
                            {variantCombinations.length > 0 && (
                                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                                    <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3">
                                        <h4 className="text-sm font-bold text-gray-900 flex items-center">
                                            <i className="ri-grid-line mr-2 text-lg text-purple-600"></i>
                                            Set Price & Stock — {variantCombinations.length} variant{variantCombinations.length > 1 ? 's' : ''}
                                        </h4>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => { const val = prompt('Set price for ALL variants:', price?.toString() || '0'); if (val !== null) bulkSetField('price', val); }}
                                                className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
                                            >
                                                Bulk Set Price
                                            </button>
                                            <button
                                                onClick={() => { const val = prompt('Set stock for ALL variants:', '0'); if (val !== null) bulkSetField('stock', val); }}
                                                className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
                                            >
                                                Bulk Set Stock
                                            </button>
                                        </div>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead className="bg-gray-50 border-b border-gray-200">
                                                <tr>
                                                    {activeGroups.map((g, i) => (
                                                        <th key={i} className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                                                            {g.name || `Option ${i + 1}`}
                                                        </th>
                                                    ))}
                                                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Price (GH₵)</th>
                                                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Stock</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {variantCombinations.map((combo) => {
                                                    const d = variantData[combo.key] || { price: price?.toString() || '', stock: '0', sku: '' };
                                                    return (
                                                        <tr key={combo.key} className="border-b border-gray-100 hover:bg-gray-50">
                                                            {combo.values.map((val, vi) => (
                                                                <td key={vi} className="py-3 px-4">
                                                                    <span className="text-sm font-semibold text-gray-900 bg-gray-100 px-2.5 py-1 rounded">{val}</span>
                                                                </td>
                                                            ))}
                                                            <td className="py-3 px-4">
                                                                <input
                                                                    type="number"
                                                                    value={d.price}
                                                                    onChange={(e) => updateVariantField(combo.key, 'price', e.target.value)}
                                                                    className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-gray-600 focus:border-gray-600"
                                                                    step="0.01"
                                                                    placeholder={price?.toString() || '0'}
                                                                />
                                                            </td>
                                                            <td className="py-3 px-4">
                                                                <input
                                                                    type="number"
                                                                    value={d.stock}
                                                                    onChange={(e) => updateVariantField(combo.key, 'stock', e.target.value)}
                                                                    className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-gray-600 focus:border-gray-600"
                                                                    placeholder="0"
                                                                />
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="p-3 bg-gray-50 border-t border-gray-100">
                                        <p className="text-xs text-gray-800 flex items-center">
                                            <i className="ri-information-line mr-1.5"></i>
                                            Total stock across all variants: <strong className="ml-1">{variants.reduce((sum, v) => sum + (parseInt(v.stock) || 0), 0)}</strong>
                                        </p>
                                    </div>
                                </div>
                            )}

                            {variantCombinations.length === 0 && (
                                <div className="p-6 text-center text-gray-500 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                                    <i className="ri-list-settings-line text-4xl text-gray-300 mb-3 block"></i>
                                    <p className="font-semibold text-gray-700">No size variants yet</p>
                                    <p className="text-sm mt-1 text-gray-400">Select sizes above to generate a price &amp; stock table per size. Colors are selection-only and won&apos;t generate separate variants.</p>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'images' && (
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900 mb-1">Product Media</h3>
                                <p className="text-gray-600">Add images and/or videos. The first item will be the primary media.</p>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {images.map((img: any, index: number) => {
                                    const isVid = img.is_video || isVideoFile(img.url);
                                    return (
                                        <div key={index} className="relative group">
                                            <div className="aspect-square bg-gray-100 rounded-xl overflow-hidden border-2 border-gray-200">
                                                {isVid ? (
                                                    <video
                                                        src={img.url}
                                                        className="w-full h-full object-cover"
                                                        muted
                                                        playsInline
                                                        loop
                                                        onMouseEnter={e => (e.currentTarget as HTMLVideoElement).play()}
                                                        onMouseLeave={e => { (e.currentTarget as HTMLVideoElement).pause(); (e.currentTarget as HTMLVideoElement).currentTime = 0; }}
                                                    />
                                                ) : (
                                                    <img src={img.url} alt={`Product ${index + 1}`} className="w-full h-full object-cover" />
                                                )}
                                            </div>
                                            <div className="absolute top-2 left-2 flex gap-1">
                                                {index === 0 && (
                                                    <span className="bg-primary text-white px-2 py-1 rounded text-xs font-semibold">Primary</span>
                                                )}
                                                {isVid && (
                                                    <span className="bg-purple-600 text-white px-2 py-1 rounded text-xs font-semibold flex items-center gap-1">
                                                        <i className="ri-video-line text-xs"></i> Video
                                                    </span>
                                                )}
                                            </div>
                                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center space-x-2 rounded-xl">
                                                <a href={img.url} target="_blank" rel="noreferrer" className="w-9 h-9 flex items-center justify-center bg-white text-gray-900 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer">
                                                    <i className="ri-eye-line"></i>
                                                </a>
                                                <button
                                                    onClick={() => handleRemoveImage(index)}
                                                    className="w-9 h-9 flex items-center justify-center bg-white text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                                                >
                                                    <i className="ri-delete-bin-line"></i>
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}

                                <label className={`aspect-square border-2 border-dashed border-gray-300 rounded-xl hover:border-gray-900 hover:bg-gray-50 transition-colors flex flex-col items-center justify-center space-y-2 text-gray-600 hover:text-gray-900 cursor-pointer ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                    {uploading ? (
                                        <i className="ri-loader-4-line animate-spin text-3xl"></i>
                                    ) : (
                                        <i className="ri-add-circle-line text-3xl"></i>
                                    )}
                                    <span className="text-sm font-semibold text-center px-2">{uploading ? 'Uploading...' : 'Image or Video'}</span>
                                    <input
                                        type="file"
                                        accept="image/*,video/mp4,video/webm,video/ogg,video/quicktime,video/x-msvideo"
                                        className="hidden"
                                        onChange={handleImageUpload}
                                        disabled={uploading}
                                    />
                                </label>
                            </div>

                            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                                <p className="text-sm text-gray-700">
                                    <strong>Images:</strong> JPG, PNG, WebP — min 1000×1000px recommended. &nbsp;|&nbsp;
                                    <strong>Videos:</strong> MP4, WebM, MOV, AVI — hover to preview. Videos play automatically on the product page.
                                </p>
                            </div>
                        </div>
                    )}

                    {activeTab === 'seo' && (
                        <div className="space-y-6 max-w-3xl">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900 mb-1">Search Engine Optimization</h3>
                                <p className="text-gray-600">Optimize how this product appears in search results</p>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-2">
                                    Page Title
                                </label>
                                <input
                                    type="text"
                                    value={seoTitle}
                                    onChange={(e) => setSeoTitle(e.target.value)}
                                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                                    placeholder="Seo friendly title"
                                />
                                <p className="text-sm text-gray-500 mt-2">60 characters recommended</p>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-2">
                                    Meta Description
                                </label>
                                <textarea
                                    rows={3}
                                    maxLength={500}
                                    value={metaDescription}
                                    onChange={(e) => setMetaDescription(e.target.value)}
                                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 resize-none"
                                    placeholder="Seo friendly description"
                                />
                                <p className="text-sm text-gray-500 mt-2">160 characters recommended</p>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-2">
                                    URL Slug
                                </label>
                                <div className="flex items-center">
                                    <span className="text-gray-600 bg-gray-100 px-4 py-3 border-2 border-r-0 border-gray-300 rounded-l-lg">
                                        store.com/product/
                                    </span>
                                    <input
                                        type="text"
                                        value={urlSlug}
                                        onChange={(e) => setUrlSlug(e.target.value)}
                                        className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-r-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                                        placeholder="product-slug"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-2">
                                    Keywords
                                </label>
                                <input
                                    type="text"
                                    value={keywords}
                                    onChange={(e) => setKeywords(e.target.value)}
                                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                                    placeholder="keyword1, keyword2"
                                />
                                <p className="text-sm text-gray-500 mt-2">Separate keywords with commas</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
