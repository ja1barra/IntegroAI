import { useState, useEffect, useCallback } from 'react'
import type { Task } from '../types'

const KEY = 'integro-tasks-v1'

const load = (): Task[] => {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') }
  catch { return [] }
}

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>(load)

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(tasks))
  }, [tasks])

  const addTask = useCallback((data: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Task => {
    const now = new Date().toISOString()
    const t: Task = { ...data, id: crypto.randomUUID(), createdAt: now, updatedAt: now }
    setTasks(p => [t, ...p])
    return t
  }, [])

  const updateTask = useCallback((id: string, up: Partial<Omit<Task, 'id' | 'createdAt'>>) => {
    setTasks(p => p.map(t => t.id === id ? { ...t, ...up, updatedAt: new Date().toISOString() } : t))
  }, [])

  const deleteTask = useCallback((id: string) => {
    setTasks(p => p.filter(t => t.id !== id))
  }, [])

  return { tasks, addTask, updateTask, deleteTask }
}
