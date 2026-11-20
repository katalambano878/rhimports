'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import OrderHistory from './OrderHistory';
import AddressBook from './AddressBook';
import { supabase } from '@/lib/supabase';

const TAB_IDS = ['profile', 'orders', 'addresses', 'security'];

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: '', last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

function AccountContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams?.get('tab') || 'profile';

  const [activeTab, setActiveTab] = useState(TAB_IDS.includes(initialTab) ? initialTab : 'profile');
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Update active tab when URL param changes
  useEffect(() => {
    const tab = searchParams?.get('tab');
    setActiveTab(tab && TAB_IDS.includes(tab) ? tab : 'profile');
  }, [searchParams]);

  // Profile Form States
  const [profileData, setProfileData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: ''
  });
  const [profileMessage, setProfileMessage] = useState({ type: '', text: '' });
  const [profileLoading, setProfileLoading] = useState(false);

  // Password Form States
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    password: '',
    confirmPassword: ''
  });
  const [passwordMessage, setPasswordMessage] = useState({ type: '', text: '' });
  const [passwordLoading, setPasswordLoading] = useState(false);

  useEffect(() => {
    async function checkUser() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/auth/login');
        return;
      }

      setUser(session.user);
      const meta = session.user.user_metadata || {};
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, phone')
        .eq('id', session.user.id)
        .maybeSingle();
      const fromProfile = splitName(profile?.full_name || '');
      setProfileData({
        firstName: fromProfile.first || meta.first_name || '',
        lastName: fromProfile.first ? fromProfile.last : (meta.last_name || ''),
        email: session.user.email || '',
        phone: profile?.phone || meta.phone || session.user.phone || ''
      });
      setLoading(false);
    }
    checkUser();
  }, [router]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileLoading(true);
    setProfileMessage({ type: '', text: '' });

    const phone = profileData.phone.trim();
    const phoneDigits = phone.replace(/\D/g, '');
    if (phone && !(/^0\d{9}$/.test(phoneDigits) || /^233\d{9}$/.test(phoneDigits))) {
      setProfileMessage({ type: 'error', text: 'Enter a Ghana phone number, for example 024 220 5331.' });
      setProfileLoading(false);
      return;
    }
    const fullName = `${profileData.firstName.trim()} ${profileData.lastName.trim()}`.trim();

    try {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ full_name: fullName || null, phone: phone || null, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (profileError) throw profileError;

      // Read back what was stored so the form shows the saved values.
      const { data: saved, error: readError } = await supabase
        .from('profiles')
        .select('full_name, phone')
        .eq('id', user.id)
        .maybeSingle();
      if (readError || !saved) throw readError || new Error('not saved');
      const savedName = splitName(saved.full_name || '');
      setProfileData((prev) => ({
        ...prev,
        firstName: savedName.first,
        lastName: savedName.last,
        phone: saved.phone || '',
      }));

      // Keep the sign-in metadata in step (used by the header greeting and checkout prefill).
      await supabase.auth.updateUser({
        data: {
          first_name: savedName.first,
          last_name: savedName.last,
          phone: saved.phone || '',
        }
      });
      setProfileMessage({ type: 'success', text: 'Your details were saved.' });
    } catch {
      setProfileMessage({ type: 'error', text: 'Your details could not be saved. Please try again.' });
    } finally {
      setProfileLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage({ type: '', text: '' });
    if (!passwordData.currentPassword) {
      setPasswordMessage({ type: 'error', text: 'Enter your current password.' });
      return;
    }
    if (passwordData.password.length < 8) {
      setPasswordMessage({ type: 'error', text: 'Your new password must be at least 8 characters.' });
      return;
    }
    if (passwordData.password !== passwordData.confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'The new passwords do not match.' });
      return;
    }
    if (passwordData.password === passwordData.currentPassword) {
      setPasswordMessage({ type: 'error', text: 'Choose a new password that is different from the current one.' });
      return;
    }

    setPasswordLoading(true);
    try {
      // The server only accepts a password change shortly after a sign-in,
      // so confirm the current password first.
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: passwordData.currentPassword,
      });
      if (signInError) {
        const status = (signInError as any).status;
        setPasswordMessage({
          type: 'error',
          text: status === 429
            ? (signInError.message || 'Too many attempts. Please wait and try again.')
            : 'Your current password is not correct.',
        });
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: passwordData.password });
      if (error) {
        const code = (error as any).code;
        const status = (error as any).status;
        if (code === 'reauthentication_needed' || status === 401) {
          setPasswordMessage({ type: 'error', text: 'Please sign in again to change your password.' });
        } else {
          setPasswordMessage({ type: 'error', text: error.message || 'The request could not be completed.' });
        }
        return;
      }

      // The server signs out every session after a password change.
      setPasswordData({ currentPassword: '', password: '', confirmPassword: '' });
      await supabase.auth.signOut({ scope: 'local' });
      router.push('/auth/login?changed=1');
      router.refresh();
    } catch {
      setPasswordMessage({ type: 'error', text: 'The request could not be completed.' });
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/auth/login');
    router.refresh();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <i className="ri-loader-4-line animate-spin text-4xl text-gray-900"></i>
      </div>
    );
  }

  const goToChangePassword = () => {
    setActiveTab('profile');
    router.replace('/account?tab=profile#change-password');
    setTimeout(() => document.getElementById('change-password')?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

  const securityOptions: { icon: string; title: string; description: string; status: string; href: string | null; onClick: null | (() => void) }[] = [
    {
      icon: 'ri-mail-check-line',
      title: 'Email',
      description: user?.email || '',
      status: user?.email_confirmed_at ? 'verified' : 'unverified',
      href: null,
      onClick: null,
    },
    {
      icon: 'ri-lock-password-line',
      title: 'Change password',
      description: 'Confirm your current password, then choose a new one',
      status: '',
      href: null,
      onClick: goToChangePassword,
    },
    {
      icon: 'ri-shield-user-line',
      title: 'Privacy & data',
      description: 'Download your data or ask us to delete your account',
      status: '',
      href: '/account/privacy',
      onClick: null,
    },
  ];

  return (
    <>
      <div className="min-h-screen bg-gray-50 py-8 lg:py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 md:mb-8">
            <div className="flex items-center gap-3 md:gap-4 w-full md:w-auto">
              <div className="w-12 h-12 md:w-16 md:h-16 flex-shrink-0 rounded-full bg-gray-100 flex items-center justify-center text-gray-900 text-xl md:text-2xl font-bold shadow-inner border-2 border-white">
                {profileData.firstName?.[0] || user?.email?.[0]?.toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-xl md:text-2xl font-bold text-gray-900 truncate pr-2">{profileData.firstName ? `Hello, ${profileData.firstName}!` : 'Welcome Back'}</h1>
                <p className="text-gray-500 text-sm font-medium truncate">{user?.email}</p>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 hover:text-red-600 hover:border-red-200 transition-all font-medium shadow-sm w-full md:w-auto justify-center md:justify-start"
            >
              <i className="ri-logout-box-r-line"></i>
              Sign Out
            </button>
          </div>

          <div className="grid lg:grid-cols-4 gap-8">
            {/* Desktop Sidebar Navigation */}
            <div className="hidden lg:block lg:col-span-1">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden sticky top-24">
                <nav className="p-2 space-y-1">
                  {[
                    { id: 'profile', icon: 'ri-user-settings-line', label: 'Profile Settings' },
                    { id: 'orders', icon: 'ri-shopping-bag-3-line', label: 'Order History' },
                    { id: 'addresses', icon: 'ri-map-pin-2-line', label: 'Addresses' },
                    { id: 'security', icon: 'ri-shield-keyhole-line', label: 'Security' }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all text-left group ${activeTab === tab.id
                        ? 'bg-gray-50 text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                        }`}
                    >
                      <i className={`${tab.icon} text-xl transition-colors ${activeTab === tab.id ? 'text-gray-900' : 'text-gray-400 group-hover:text-gray-600'}`}></i>
                      <span>{tab.label}</span>
                    </button>
                  ))}
                </nav>
              </div>
            </div>

            {/* Mobile Horizontal Navigation */}
            <div className="lg:hidden col-span-1 pb-2">
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {[
                  { id: 'profile', icon: 'ri-user-settings-line', label: 'Profile' },
                  { id: 'orders', icon: 'ri-shopping-bag-3-line', label: 'Orders' },
                  { id: 'addresses', icon: 'ri-map-pin-2-line', label: 'Address' },
                  { id: 'security', icon: 'ri-shield-keyhole-line', label: 'Security' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-medium whitespace-nowrap transition-all border shadow-sm ${activeTab === tab.id
                      ? 'bg-primary text-white border-gray-900 ring-2 ring-gray-100'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                      }`}
                  >
                    <i className={tab.icon}></i>
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Main Content Area */}
            <div className="lg:col-span-3">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-6 lg:p-8 min-h-[500px]">
                {activeTab === 'profile' && (
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Profile Information</h2>
                    <p className="text-gray-400 text-xs mt-0.5 mb-5">Update your personal details and contact info.</p>

                    {profileMessage.text && (
                      <div className={`mb-4 p-3 rounded-lg flex items-center gap-2 text-sm ${profileMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
                        <i className={`text-base ${profileMessage.type === 'success' ? 'ri-checkbox-circle-fill' : 'ri-error-warning-fill'}`}></i>
                        <span>{profileMessage.text}</span>
                      </div>
                    )}

                    <form onSubmit={handleUpdateProfile} className="space-y-5">
                      <div>
                        <label htmlFor="first-name" className="block text-sm font-medium text-gray-900 mb-1.5">First Name</label>
                        <input
                          id="first-name"
                          autoComplete="given-name"
                          type="text"
                          value={profileData.firstName}
                          onChange={e => setProfileData({ ...profileData, firstName: e.target.value })}
                          placeholder="Enter your first name"
                          className="w-full h-11 px-3.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all bg-white placeholder:text-gray-300"
                        />
                      </div>

                      <div>
                        <label htmlFor="last-name" className="block text-sm font-medium text-gray-900 mb-1.5">Last Name</label>
                        <input
                          id="last-name"
                          autoComplete="family-name"
                          type="text"
                          value={profileData.lastName}
                          onChange={e => setProfileData({ ...profileData, lastName: e.target.value })}
                          placeholder="Enter your last name"
                          className="w-full h-11 px-3.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all bg-white placeholder:text-gray-300"
                        />
                      </div>

                      <div>
                        <label htmlFor="email-address" className="block text-sm font-medium text-gray-900 mb-1.5">Email Address</label>
                        <div className="relative">
                          <i className="ri-mail-line absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                          <input
                            id="email-address"
                            type="email"
                            value={profileData.email}
                            disabled
                            className="w-full h-11 pl-10 pr-3.5 border border-gray-100 bg-gray-50 rounded-lg text-sm text-gray-500 cursor-not-allowed"
                          />
                        </div>
                      </div>

                      <div>
                        <label htmlFor="phone-number" className="block text-sm font-medium text-gray-900 mb-1.5">Phone Number</label>
                        <div className="relative">
                          <i className="ri-phone-line absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                          <input
                            id="phone-number"
                            type="tel"
                            autoComplete="tel"
                            value={profileData.phone}
                            onChange={e => setProfileData({ ...profileData, phone: e.target.value })}
                            placeholder="e.g. 024 220 5331"
                            className="w-full h-11 pl-10 pr-3.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all bg-white placeholder:text-gray-300"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={profileLoading}
                        className="w-full h-11 bg-primary hover:bg-[#0F1A47] text-white rounded-lg text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-50"
                      >
                        {profileLoading ? 'Saving...' : 'Save Profile'}
                      </button>
                    </form>

                    <div id="change-password" className="mt-10 pt-8 border-t border-gray-100 scroll-mt-24">
                      <h2 className="text-lg font-bold text-gray-900">Change Password</h2>
                      <p className="text-gray-400 text-xs mt-0.5 mb-5">Enter your current password, then choose a new one. You will be signed out on all devices and asked to sign in again.</p>

                      {passwordMessage.text && (
                        <div className={`mb-4 p-3 rounded-lg flex items-center gap-2 text-sm ${passwordMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
                          <i className={`text-base ${passwordMessage.type === 'success' ? 'ri-checkbox-circle-fill' : 'ri-error-warning-fill'}`}></i>
                          <span>{passwordMessage.text}</span>
                        </div>
                      )}

                      <form onSubmit={handleChangePassword} className="space-y-5">
                        <div>
                          <label htmlFor="current-password" className="block text-sm font-medium text-gray-900 mb-1.5">Current Password</label>
                          <div className="relative">
                            <i className="ri-key-2-line absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm" aria-hidden="true"></i>
                            <input
                              id="current-password"
                              type="password"
                              autoComplete="current-password"
                              value={passwordData.currentPassword}
                              onChange={e => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                              className="w-full h-11 pl-10 pr-3.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all bg-white placeholder:text-gray-300"
                            />
                          </div>
                        </div>

                        <div>
                          <label htmlFor="new-password" className="block text-sm font-medium text-gray-900 mb-1.5">New Password</label>
                          <div className="relative">
                            <i className="ri-lock-line absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                            <input
                              id="new-password"
                              type="password"
                              autoComplete="new-password"
                              value={passwordData.password}
                              onChange={e => setPasswordData({ ...passwordData, password: e.target.value })}
                              placeholder="At least 8 characters"
                              className="w-full h-11 pl-10 pr-3.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all bg-white placeholder:text-gray-300"
                            />
                          </div>
                        </div>

                        <div>
                          <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-900 mb-1.5">Confirm New Password</label>
                          <div className="relative">
                            <i className="ri-lock-check-line absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                            <input
                              id="confirm-password"
                              type="password"
                              autoComplete="new-password"
                              value={passwordData.confirmPassword}
                              onChange={e => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                              placeholder="Re-enter your password"
                              className="w-full h-11 pl-10 pr-3.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all bg-white placeholder:text-gray-300"
                            />
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={passwordLoading}
                          className="w-full h-11 bg-primary hover:bg-[#0F1A47] text-white rounded-lg text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-50"
                        >
                          {passwordLoading ? 'Updating...' : 'Update Password'}
                        </button>
                      </form>
                    </div>
                  </div>
                )}

                {activeTab === 'orders' && <OrderHistory />}

                {activeTab === 'addresses' && <AddressBook />}

                {activeTab === 'security' && (
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-6">Security Settings</h2>
                    <div className="grid md:grid-cols-2 gap-4">
                      {securityOptions.map((option) => {
                        const inner = (
                          <>
                            <div className="flex items-center gap-4 min-w-0">
                              <div className="w-12 h-12 flex-shrink-0 bg-gray-50 rounded-full flex items-center justify-center group-hover:bg-gray-100 group-hover:text-gray-900 transition-colors">
                                <i className={`${option.icon} text-xl`} aria-hidden="true"></i>
                              </div>
                              <div className="min-w-0">
                                <h3 className="font-bold text-gray-900">{option.title}</h3>
                                <p className="text-sm text-gray-500 break-words">{option.description}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0">
                              {option.status === 'verified' && (
                                <span className="text-xs font-bold px-3 py-1 bg-gray-100 text-gray-900 rounded-full flex items-center gap-1">
                                  <i className="ri-verified-badge-fill" aria-hidden="true"></i> Verified
                                </span>
                              )}
                              {option.status === 'unverified' && (
                                <span className="text-xs font-bold px-3 py-1 bg-amber-100 text-amber-700 rounded-full flex items-center gap-1">
                                  <i className="ri-error-warning-fill" aria-hidden="true"></i> Not confirmed
                                </span>
                              )}
                              {(option.href || option.onClick) && (
                                <i className="ri-arrow-right-line text-gray-300 group-hover:text-gray-600 transition-colors" aria-hidden="true"></i>
                              )}
                            </div>
                          </>
                        );
                        const cls = 'flex items-center justify-between gap-3 p-5 border border-gray-200 rounded-2xl transition-all group bg-white text-left w-full';
                        if (option.href) {
                          return (
                            <Link key={option.title} href={option.href} className={`${cls} hover:border-gray-600 hover:shadow-md`}>
                              {inner}
                            </Link>
                          );
                        }
                        if (option.onClick) {
                          return (
                            <button key={option.title} type="button" onClick={option.onClick} className={`${cls} hover:border-gray-600 hover:shadow-md`}>
                              {inner}
                            </button>
                          );
                        }
                        return (
                          <div key={option.title} className={cls}>
                            {inner}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <i className="ri-loader-4-line animate-spin text-4xl text-gray-900"></i>
      </div>
    }>
      <AccountContent />
    </Suspense>
  );
}
