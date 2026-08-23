'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
  DEFAULT_CONTACT_ADDRESS,
  DEFAULT_CONTACT_MAP_LINK,
  DEFAULT_CONTACT_PHONE,
  applyCanonicalContact,
} from '@/lib/contact';

// ── Types ──────────────────────────────────────────────────────────
export interface SiteSettings {
    // General
    site_name: string;
    site_tagline: string;
    site_logo: string;
    site_favicon: string;
    contact_email: string;
    contact_phone: string;
    contact_address: string;
    social_facebook: string;
    social_instagram: string;
    social_twitter: string;
    social_tiktok: string;
    social_youtube: string;
    social_snapchat: string;
    social_whatsapp: string;
    currency: string;
    currency_symbol: string;

    // Appearance / Theme
    primary_color: string;
    secondary_color: string;
    accent_color: string;
    header_bg: string;
    header_text: string;
    footer_bg: string;
    footer_text: string;

    // Hero Section
    hero_headline: string;
    hero_subheadline: string;
    hero_image: string;
    hero_video: string;
    hero_badge_label: string;
    hero_badge_text: string;
    hero_badge_subtext: string;
    hero_primary_btn_text: string;
    hero_primary_btn_link: string;
    hero_secondary_btn_text: string;
    hero_secondary_btn_link: string;
    hero_tag_text: string;
    hero_stat1_title: string;
    hero_stat1_desc: string;
    hero_stat2_title: string;
    hero_stat2_desc: string;
    hero_stat3_title: string;
    hero_stat3_desc: string;

    // Trust Features
    feature1_icon: string;
    feature1_title: string;
    feature1_desc: string;
    feature2_icon: string;
    feature2_title: string;
    feature2_desc: string;
    feature3_icon: string;
    feature3_title: string;
    feature3_desc: string;
    feature4_icon: string;
    feature4_title: string;
    feature4_desc: string;

    // About Page
    about_hero_title: string;
    about_hero_subtitle: string;
    about_story_title: string;
    about_story_content: string;
    about_story_image: string;
    about_founder_name: string;
    about_founder_title: string;
    about_mission1_title: string;
    about_mission1_content: string;
    about_mission2_title: string;
    about_mission2_content: string;
    about_values_title: string;
    about_values_subtitle: string;
    about_cta_title: string;
    about_cta_subtitle: string;

    // Contact Page
    contact_hero_title: string;
    contact_hero_subtitle: string;
    contact_hours: string;
    contact_whatsapp_hours: string;
    contact_map_link: string;
    contact_team_json: string;

    // Header
    header_logo_height: string;
    header_nav_links_json: string;
    header_show_search: string;
    header_show_wishlist: string;
    header_show_cart: string;
    header_show_account: string;

    // Footer
    footer_logo: string;
    footer_logo_height: string;
    footer_newsletter_title: string;
    footer_newsletter_subtitle: string;
    footer_show_newsletter: string;
    footer_col1_title: string;
    footer_col1_links_json: string;
    footer_col2_title: string;
    footer_col2_links_json: string;
    footer_col3_title: string;
    footer_col3_links_json: string;
    footer_copyright_text: string;
    footer_powered_by: string;
    footer_powered_by_link: string;

    // SEO
    seo_title: string;
    seo_description: string;
    seo_keywords: string;
    seo_og_image: string;
    seo_google_analytics: string;

    // Integrations
    integration_resend_api_key: string;
    integration_admin_email: string;
    integration_email_from: string;
    integration_moolre_api_user: string;
    integration_moolre_api_pubkey: string;
    integration_moolre_account_number: string;
    integration_moolre_merchant_email: string;
    integration_moolre_sms_api_key: string;
    integration_recaptcha_site_key: string;
    integration_recaptcha_secret_key: string;
    integration_app_url: string;

    [key: string]: string;
}

export interface CMSContent {
    id: string;
    section: string;
    block_key: string;
    title: string | null;
    subtitle: string | null;
    content: string | null;
    image_url: string | null;
    button_text: string | null;
    button_url: string | null;
    metadata: Record<string, any>;
    is_active: boolean;
}

export interface Banner {
    id: string;
    name: string;
    type: string;
    title: string | null;
    subtitle: string | null;
    image_url: string | null;
    background_color: string;
    text_color: string;
    button_text: string | null;
    button_url: string | null;
    is_active: boolean;
    position: string;
    start_date: string | null;
    end_date: string | null;
}

export interface CMSContextType {
    settings: SiteSettings;
    content: CMSContent[];
    banners: Banner[];
    loading: boolean;
    getContent: (section: string, blockKey: string) => CMSContent | undefined;
    getSetting: (key: string) => string;
    getSettingJSON: <T = any>(key: string, fallback: T) => T;
    getActiveBanners: (position?: string) => Banner[];
    refreshCMS: () => Promise<void>;
}

// ── Defaults ───────────────────────────────────────────────────────
export const defaultSettings: SiteSettings = {
    // General
    site_name: 'RNH Imports',
    site_tagline: 'Quality yet Affordable',
    site_logo: '/logo.png',
    site_favicon: '/favicon.ico',
    contact_email: 'info@rnhimports.com',
    contact_phone: DEFAULT_CONTACT_PHONE,
    contact_address: DEFAULT_CONTACT_ADDRESS,
    social_facebook: '',
    social_instagram: '',
    social_twitter: '',
    social_tiktok: '',
    social_youtube: '',
    social_snapchat: '',
    social_whatsapp: '233242205331',
    currency: 'GHS',
    currency_symbol: 'GH₵',

    // Appearance — replace with your brand colors
    primary_color: '#1B2A6B',
    secondary_color: '#FFFFFF',
    accent_color: '#25D366',
    header_bg: '#FFFFFF',
    header_text: '#171717',
    footer_bg: '#1B2A6B',
    footer_text: '#FFFFFF',

    // Hero
    hero_headline: 'Quality yet Affordable',
    hero_subheadline: 'The latest laptops, cameras, and gadgets \u2014 sourced globally and delivered straight to you in Ghana.',
    hero_image: '/hero.jpg',
    hero_video: '/hero-video.mp4',
    hero_badge_label: 'Exclusive Offer',
    hero_badge_text: '25% Off',
    hero_badge_subtext: 'On your first dedicated order',
    hero_primary_btn_text: 'Shop Now',
    hero_primary_btn_link: '/shop',
    hero_secondary_btn_text: 'Browse Products',
    hero_secondary_btn_link: '/shop',
    hero_tag_text: 'RNH Imports \u2014 Bridging Ghana to the World',
    hero_stat1_title: 'Direct Import',
    hero_stat1_desc: 'Sourced from manufacturers',
    hero_stat2_title: 'Verified Quality',
    hero_stat2_desc: 'Inspected by hand',
    hero_stat3_title: 'Best Prices',
    hero_stat3_desc: 'Unbeatable value',

    // Trust Features
    feature1_icon: 'ri-shield-check-line',
    feature1_title: 'Genuine Products',
    feature1_desc: 'Every item verified \u2014 zero counterfeits',
    feature2_icon: 'ri-plane-line',
    feature2_title: 'Direct from China',
    feature2_desc: 'Sourced straight from manufacturers',
    feature3_icon: 'ri-truck-line',
    feature3_title: 'Ghana-wide Delivery',
    feature3_desc: 'Accra, Kumasi, Tema and beyond',
    feature4_icon: 'ri-whatsapp-line',
    feature4_title: 'WhatsApp Support',
    feature4_desc: 'Chat us on 024 220 5331',

    // About
    about_hero_title: 'Our Story',
    about_hero_subtitle: 'Ghana\u2019s trusted source for genuine electronics, imported directly and delivered to your door.',
    about_story_title: 'About Us — RNH Imports',
    about_story_content:
      'RNH Imports is a trusted importation and logistics company based in Ghana, committed to making global trade simple, reliable, and accessible for individuals and businesses.\n\n' +
      'Founded with a vision to bridge the gap between international suppliers and the Ghanaian market, we specialize in sourcing high quality products from China and delivering them safely and efficiently to our clients in Ghana.\n\n' +
      'At RNH Imports, we understand that importation can feel overwhelming, from finding the right suppliers to handling shipping, customs clearance, and delivery. That is why we provide a seamless, end to end solution that takes the stress off our clients and guarantees peace of mind.\n\n' +
      'With a strong network of verified suppliers, efficient shipping systems, and a dedicated warehouse presence in Ghana, we ensure that every item entrusted to us is handled with care and delivered on time.\n\n' +
      'Our company is built on trust, transparency, and reliability. Whether you are a small business owner, a growing brand, or an individual looking to import goods, RNH Imports is your dependable partner every step of the way.\n\n' +
      'We do not just move goods, we build lasting relationships and help businesses grow through smart, efficient import solutions.',
    about_story_image: '/about.jpg',
    about_founder_name: 'Randy & Hannah',
    about_founder_title: 'Co-Founders',
    about_mission1_title: 'Our Mission',
    about_mission1_content: 'To bridge Ghana to the world by providing genuine, affordable electronics sourced directly from manufacturers \u2014 with transparency, speed, and personal service at every step.',
    about_mission2_title: 'Our Promise',
    about_mission2_content: 'Zero counterfeits. Every product we sell is verified genuine. We handle customs, shipping, and last-mile delivery so you don\u2019t have to worry about a thing.',
    about_values_title: 'Why Choose Us?',
    about_values_subtitle: 'Direct sourcing, genuine products, and real human support.',
    about_cta_title: 'Ready to Shop?',
    about_cta_subtitle: 'Browse our collection of genuine electronics.',

    // Contact
    contact_hero_title: 'Get In Touch',
    contact_hero_subtitle: 'Questions? We’re here to help.',
    contact_hours: 'Mon–Sat, 9am–6pm',
    contact_whatsapp_hours: 'Chat with us on WhatsApp',
    contact_map_link: DEFAULT_CONTACT_MAP_LINK,
    contact_team_json: '[]',

    // Header
    header_logo_height: '52',
    header_nav_links_json: JSON.stringify([
        { label: 'Shop', href: '/shop' },
        { label: 'Categories', href: '/categories' },
        { label: 'Services', href: '/service' },
        { label: 'About', href: '/about' },
        { label: 'Contact', href: '/contact' }
    ]),
    header_show_search: 'true',
    header_show_wishlist: 'true',
    header_show_cart: 'true',
    header_show_account: 'true',

    // Footer
    footer_logo: '/logo.png',
    footer_logo_height: '40',
    footer_newsletter_title: 'Stay in the Loop',
    footer_newsletter_subtitle: 'Get notified about new arrivals, restocks, and exclusive deals.',
    footer_show_newsletter: 'true',
    footer_col1_title: 'Shop',
    footer_col1_links_json: JSON.stringify([
        { label: 'All Products', href: '/shop' },
        { label: 'Categories', href: '/categories' },
        { label: 'New Arrivals', href: '/shop?sort=newest' },
        { label: 'Best Sellers', href: '/shop?sort=bestsellers' }
    ]),
    footer_col2_title: 'Customer Care',
    footer_col2_links_json: JSON.stringify([
        { label: 'Contact Us', href: '/contact' },
        { label: 'Track My Order', href: '/account?tab=orders' },
        { label: 'Shipping Info', href: '/shipping' },
        { label: 'Returns Policy', href: '/returns' },
        { label: 'Refund Policy', href: '/refund-policy' }
    ]),
    footer_col3_title: 'Company',
    footer_col3_links_json: JSON.stringify([
        { label: 'Our Story', href: '/about' },
        { label: 'Privacy Policy', href: '/privacy' },
        { label: 'Terms of Service', href: '/terms' }
    ]),
    footer_copyright_text: '',
    footer_powered_by: '',
    footer_powered_by_link: '',

    // SEO
    seo_title: 'RNH Imports \u2014 Genuine Electronics, Delivered to Ghana',
    seo_description: 'Trusted importation and logistics company based in Ghana. Sourcing quality laptops, phones, cameras, and more from China, delivered to your door.',
    seo_keywords: 'electronics ghana, import electronics, laptops ghana, phones ghana, genuine electronics accra, RNH imports',
    seo_og_image: '',
    seo_google_analytics: '',

    // Integrations
    integration_resend_api_key: '',
    integration_admin_email: 'info@rnhimports.com',
    integration_email_from: 'RNH Imports <noreply@rnhimports.com>',
    integration_moolre_api_user: '',
    integration_moolre_api_pubkey: '',
    integration_moolre_account_number: '',
    integration_moolre_merchant_email: '',
    integration_moolre_sms_api_key: '',
    integration_recaptcha_site_key: '',
    integration_recaptcha_secret_key: '',
    integration_app_url: 'https://rnhimports.com',
};

const CMSContext = createContext<CMSContextType>({
    settings: defaultSettings,
    content: [],
    banners: [],
    loading: true,
    getContent: () => undefined,
    getSetting: () => '',
    getSettingJSON: (_key, fallback) => fallback,
    getActiveBanners: () => [],
    refreshCMS: async () => { },
});

// Set to true to fetch settings/content/banners from Supabase.
// When false, the provider uses hardcoded defaultSettings only.
const CMS_ENABLED = false;

// ── Provider ───────────────────────────────────────────────────────
export function CMSProvider({ children }: { children: ReactNode }) {
    const [settings, setSettings] = useState<SiteSettings>(defaultSettings);
    const [content, setContent] = useState<CMSContent[]>([]);
    const [banners, setBanners] = useState<Banner[]>([]);
    const [loading, setLoading] = useState(CMS_ENABLED);

    const fetchCMSData = useCallback(async () => {
        if (!CMS_ENABLED) return;

        try {
            const { data: settingsData, error: settingsError } = await supabase
                .from('store_settings')
                .select('key, value');

            if (!settingsError && settingsData) {
                const merged = { ...defaultSettings };
                settingsData.forEach((row: any) => {
                    if (row.key && row.value !== null && row.value !== undefined) {
                        merged[row.key] = typeof row.value === 'string' ? row.value : JSON.stringify(row.value);
                    }
                });
                applyCanonicalContact(merged as unknown as Record<string, string>);
                setSettings(merged);
            }

            const { data: contentData, error: contentError } = await supabase
                .from('cms_content')
                .select('*')
                .eq('is_active', true);

            if (!contentError && contentData) {
                setContent(contentData);
            }

            const { data: bannersData, error: bannersError } = await supabase
                .from('banners')
                .select('*')
                .eq('is_active', true)
                .order('sort_order');

            if (!bannersError && bannersData) {
                setBanners(bannersData);
            }
        } catch (err) {
            console.warn('CMSProvider: Failed to fetch CMS data', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCMSData();
    }, [fetchCMSData]);

    const getContent = (section: string, blockKey: string): CMSContent | undefined => {
        return content.find(c => c.section === section && c.block_key === blockKey);
    };

    const getSetting = (key: string): string => {
        return settings[key] || defaultSettings[key] || '';
    };

    const getSettingJSON = <T = any,>(key: string, fallback: T): T => {
        const raw = settings[key];
        if (!raw) return fallback;
        try {
            return JSON.parse(raw) as T;
        } catch {
            return fallback;
        }
    };

    const getActiveBanners = (position?: string): Banner[] => {
        const now = new Date();
        return banners.filter(b => {
            if (position && b.position !== position) return false;
            if (b.start_date && new Date(b.start_date) > now) return false;
            if (b.end_date && new Date(b.end_date) < now) return false;
            return b.is_active;
        });
    };

    return (
        <CMSContext.Provider
            value={{
                settings,
                content,
                banners,
                loading,
                getContent,
                getSetting,
                getSettingJSON,
                getActiveBanners,
                refreshCMS: fetchCMSData,
            }}
        >
            {children}
        </CMSContext.Provider>
    );
}

export function useCMS() {
    const context = useContext(CMSContext);
    if (!context) {
        throw new Error('useCMS must be used within a CMSProvider');
    }
    return context;
}

export default CMSContext;
