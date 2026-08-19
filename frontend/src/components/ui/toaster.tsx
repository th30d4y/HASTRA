"use client"
import { useEffect, useState } from "react"

interface Toast {
  id: string
  message: string
  type: "success" | "error" | "info"
}

let toastHandlers: ((t: Toast) => void)[] = []

export function toast(message: string, type: "success" | "error" | "info" = "info") {
  const t = { id: Math.random().toString(36), message, type }
  toastHandlers.forEach(h => h(t))
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    const handler = (t: Toast) => {
      setToasts(prev => [...prev, t])
      setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), 4000)
    }
    toastHandlers.push(handler)
    return () => { toastHandlers = toastHandlers.filter(h => h !== handler) }
  }, [])

  if (!toasts.length) return null
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map(t => (
        <div key={t.id} className={`px-4 py-3 rounded-lg text-sm font-medium shadow-lg ${t.type === "success" ? "bg-green-500/20 border border-green-500/30 text-green-300" : t.type === "error" ? "bg-red-500/20 border border-red-500/30 text-red-300" : "bg-violet-500/20 border border-violet-500/30 text-violet-300"}`}>
          {t.message}
        </div>
      ))}
    </div>
  )
}
