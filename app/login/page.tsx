'use client';
import { useState } from 'react';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        const next = new URLSearchParams(window.location.search).get('next') || '/admin';
        window.location.href = next;
      } else {
        const text = await res.text();
        setError(text || 'Invalid password');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <form onSubmit={submit} className="w-full max-w-sm bg-white border rounded-2xl p-6 shadow-sm">
        <h1 className="text-2xl font-semibold mb-2">Owner Login</h1>
        <p className="text-sm text-gray-500 mb-4">Enter your admin password to continue.</p>
        <input
          type="password"
          className="w-full border rounded-xl px-3 py-2 mb-3"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
        <button
          disabled={loading}
          className="w-full bg-black text-white rounded-xl px-4 py-2 disabled:opacity-60"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
