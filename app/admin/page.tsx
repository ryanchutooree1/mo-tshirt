import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { isAuthed } from '@/lib/auth';

export default async function AdminPage() {
  const authed = isAuthed(cookies());
  if (!authed) redirect('/login?next=/admin');

  return (
    <main className="min-h-screen px-6 py-10 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-4">MO T-SHIRT — Owner Dashboard</h1>
      <p className="text-gray-600 mb-6">Quick links to run the business.</p>
      <div className="grid sm:grid-cols-2 gap-4">
        <Card title="Daily Progress" href="/progress" desc="Track outreach, proposals, meetings." />
        <Card title="WhatsApp Lead Buttons" href="/" desc="Check homepage CTAs are live." />
      </div>
      <form action="/api/auth/logout" method="post" className="mt-8">
        <button className="px-4 py-2 rounded-xl border">Log out</button>
      </form>
    </main>
  );
}

function Card({ title, desc, href }: { title: string; desc: string; href: string }) {
  return (
    <Link href={href} className="block border rounded-2xl p-5 hover:shadow-sm">
      <div className="text-lg font-semibold">{title}</div>
      <div className="text-sm text-gray-500">{desc}</div>
    </Link>
  );
}