// app/admin/page.tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { isAuthed } from '@/lib/auth';
import BusinessOwnerDashboard from '@/components/BusinessOwnerDashboard';

export default async function AdminPage() {
  const authed = isAuthed(cookies());
  if (!authed) redirect('/login?next=/admin');

  return <BusinessOwnerDashboard adminId="admin" />;
}
