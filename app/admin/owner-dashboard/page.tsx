'use client'

import { useState, useEffect } from 'react'
import { db } from '@/lib/firebase'
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore'
import { format } from 'date-fns'

export default function BusinessOwnerDashboard() {
  const adminId = 'mo-owner' // could be dynamic later
  const [tasks, setTasks] = useState<{ title: string; completed: boolean }[]>([])
  const [streak, setStreak] = useState(0)
  const [newTask, setNewTask] = useState('')
  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => {
    if (!adminId) return
    const fetchData = async () => {
      const ref = doc(db, 'users', adminId, 'checklists', today)
      const snap = await getDoc(ref)
      if (snap.exists()) {
        setTasks(snap.data().tasks || [])
        setStreak(snap.data().streak || 0)
      } else {
        await setDoc(ref, { tasks: [], streak })
      }
    }
    fetchData()
  }, [adminId, today])

  const saveTasks = async (updatedTasks: typeof tasks, updatedStreak = streak) => {
    setTasks(updatedTasks)
    const ref = doc(db, 'users', adminId, 'checklists', today)
    await updateDoc(ref, { tasks: updatedTasks, streak: updatedStreak })
  }

  const toggleTask = async (index: number) => {
    const updated = [...tasks]
    updated[index].completed = !updated[index].completed
    let newStreak = streak
    if (updated.every(t => t.completed)) {
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
    await saveTasks(tasks.filter((_, i) => i !== index))
  }

  const progressPct = tasks.length
    ? Math.round((tasks.filter(t => t.completed).length / tasks.length) * 100)
    : 0

  return (
    <main className="min-h-screen px-6 py-10 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-4">MO T-SHIRT — Owner Dashboard</h1>
      <p className="text-gray-600 mb-4">Daily checklist to grow your business.</p>

      {/* Progress Bar */}
      <div className="w-full bg-gray-200 rounded-full overflow-hidden mb-4" style={{ height: 20 }}>
        <div style={{ width: `${progressPct}%`, background: 'green' }} className="h-full transition-all" />
      </div>
      <p className="text-sm mb-6">{progressPct}% Complete • Streak: {streak} days</p>

      {/* Add Task */}
      <div className="flex gap-2 mb-6">
        <input
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          placeholder="Add a new task..."
          className="flex-1 border rounded-lg px-3 py-2"
        />
        <button onClick={addTask} className="px-4 py-2 bg-black text-white rounded-lg">Add</button>
      </div>

      {/* Tasks */}
      <ul className="space-y-3 mb-10">
        {tasks.map((task, i) => (
          <li key={i} className="flex items-center gap-3">
            <input type="checkbox" checked={task.completed} onChange={() => toggleTask(i)} className="w-5 h-5" />
            <span className={`flex-1 ${task.completed ? 'line-through text-gray-500' : ''}`}>{task.title}</span>
            <button onClick={() => removeTask(i)} className="text-red-500 text-sm">Remove</button>
          </li>
        ))}
      </ul>
    </main>
  )
}
