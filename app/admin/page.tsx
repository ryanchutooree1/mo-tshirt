'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminLoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || 'mo-owner-2025'

    if (password === ADMIN_PASSWORD) {
      router.push('/owner-dashboard')
    } else {
      setError('Incorrect password')
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
      <form onSubmit={handleLogin} className="bg-white p-8 rounded-lg shadow-md w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-6">Admin Login</h1>
        
        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
        
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter admin password"
          className="border px-3 py-2 rounded-lg w-full mb-4"
        />

        <button
          type="submit"
          className="w-full bg-black text-white py-2 rounded-lg hover:bg-gray-800"
        >
          Login
        </button>
      </form>
    </main>
  )
}
