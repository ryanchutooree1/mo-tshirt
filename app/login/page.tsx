'use client'

import { useState, useEffect } from 'react'
import { auth, db } from '@/lib/firebase'
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore'
import { useAuthState } from 'react-firebase-hooks/auth'
import { format } from 'date-fns'

export default function AdminPage() {
  const [user, loadingAuth] = useAuthState(auth)
  const [tasks, setTasks] = useState<{ title: string; completed: boolean }[]>([])
  const [streak, setStreak] = useState(0)
  const [newTask, setNewTask] = useState('')
  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => {
    if (!user) return
    const fetchData = async () => {
      const ref = doc(db, 'users', user.uid, 'checklists', today)
      const snap = await getDoc(ref)

      if (snap.exists()) {
        setTasks(snap.data().tasks || [])
        setStreak(snap.data().streak || 0)
      } else {
        await setDoc(ref, { tasks: [], streak })
        setTasks([])
      }
    }
    fetchData()
  }, [user, today])

  const saveTasks = async (updatedTasks: typeof tasks, updatedStreak = streak) => {
    setTasks(updatedTasks)
    if (user) {
      const ref = doc(db, 'users', user.uid, 'checklists', today)
      await updateDoc(ref, { tasks: updatedTasks, streak: updatedStreak })
    }
  }

  const toggleTask = async (index: number) => {
    const updated = [...tasks]
    updated[index].completed = !updated[index].completed

    const completedCount = updated.filter(t => t.completed).length
    let newStreak = streak
    if (completedCount === updated.length) {
      newStreak += 1
      setStreak(newStreak)
    }

    await saveTasks(updated, newStreak)
  }

  const addTask = async () => {
    if (!newTask.trim()) return
    const updated = [...tasks, { title: newTask.trim(), completed: false }]
    setNewTask('')
    await saveTasks(updated)
  }

  const removeTask = async (index: number) => {
    const updated = tasks.filter((_, i) => i !== index)
    await saveTasks(updated)
  }

  const progressPct = tasks.length
    ? Math.round((tasks.filter(t => t.completed).length / tasks.length) * 100)
    : 0

  if (loadingAuth) return <p className="p-6">Loading...</p>
  if (!user) return <p className="p-6">Please log in to view your dashboard.</p>

  return (
    <main className="min-h-screen px-6 py-10 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-4">MO T-SHIRT — Owner Dashboard</h1>
      <p className="text-gray-600 mb-4">Daily checklist to grow your business.</p>

      {/* Progress Bar */}
      <div className="w-full bg-gray-200 rounded-full overflow-hidden mb-4" style={{ height: 20 }}>
        <div
          className="h-full transition-all"
          style={{ width: `${progressPct}%`, background: 'green' }}
        />
      </div>
      <p className="text-sm text-gray-700 mb-6">{progressPct}% Complete • Streak: {streak} days</p>

      {/* Add Task */}
      <div className="flex gap-2 mb-6">
        <input
          type="text"
          placeholder="Add a new task..."
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          className="flex-1 border rounded-lg px-3 py-2"
        />
        <button
          onClick={addTask}
          className="px-4 py-2 bg-black text-white rounded-lg hover:opacity-90"
        >
          Add
        </button>
      </div>

      {/* Checklist */}
      <ul className="space-y-3 mb-10">
        {tasks.map((task, i) => (
          <li key={i} className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={task.completed}
              onChange={() => toggleTask(i)}
              className="w-5 h-5"
            />
            <span className={`flex-1 ${task.completed ? 'line-through text-gray-500' : ''}`}>
              {task.title}
            </span>
            <button
              onClick={() => removeTask(i)}
              className="text-red-500 hover:underline text-sm"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      {/* Quick Links */}
      <div className="grid sm:grid-cols-2 gap-4">
        <Card title="Daily Progress" href="/progress" desc="Track outreach, proposals, meetings." />
        <Card title="WhatsApp Lead Buttons" href="/" desc="Check homepage CTAs are live." />
      </div>

      <form action="/api/auth/logout" method="post" className="mt-8">
        <button className="px-4 py-2 rounded-xl border">Log out</button>
      </form>
    </main>
  )
}

function Card({ title, desc, href }: { title: string; desc: string; href: string }) {
  return (
    <a href={href} className="block border rounded-2xl p-5 hover:shadow-sm">
      <div className="text-lg font-semibold">{title}</div>
      <div className="text-sm text-gray-500">{desc}</div>
    </a>
  )
}
