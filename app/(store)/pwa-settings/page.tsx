import { redirect } from 'next/navigation';

// This site has no offline mode or push notifications to configure; send old links to the account.
export default function PWASettingsPage() {
  redirect('/account');
}
