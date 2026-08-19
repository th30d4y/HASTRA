import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "—"
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(date))
}

export function formatDuration(ms: number | null | undefined): string {
  if (!ms) return "—"
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

export function formatTokens(n: number | null | undefined): string {
  if (!n) return "0"
  if (n < 1000) return String(n)
  return `${(n / 1000).toFixed(1)}k`
}

export function severityColor(severity: string): string {
  const map: Record<string, string> = {
    CRITICAL: "text-red-400",
    HIGH: "text-orange-400",
    MEDIUM: "text-yellow-400",
    LOW: "text-blue-400",
    INFO: "text-gray-400",
  }
  return map[severity] || "text-gray-400"
}

export function severityBg(severity: string): string {
  const map: Record<string, string> = {
    CRITICAL: "bg-red-500/10 text-red-400 border-red-500/20",
    HIGH: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    MEDIUM: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    LOW: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    INFO: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  }
  return map[severity] || "bg-gray-500/10 text-gray-400 border-gray-500/20"
}

export function riskBg(risk: string): string {
  const map: Record<string, string> = {
    CRITICAL: "bg-red-500/10 text-red-400 border-red-500/20",
    HIGH: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    MEDIUM: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    LOW: "bg-green-500/10 text-green-400 border-green-500/20",
    SAFE: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  }
  return map[risk] || "bg-gray-500/10 text-gray-400 border-gray-500/20"
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    PASSED: "text-green-400",
    passed: "text-green-400",
    FAILED: "text-red-400",
    failed: "text-red-400",
    RUNNING: "text-blue-400",
    running: "text-blue-400",
    QUEUED: "text-gray-400",
    queued: "text-gray-400",
    ERROR: "text-orange-400",
    error: "text-orange-400",
    TIMEOUT: "text-yellow-400",
    timeout: "text-yellow-400",
  }
  return map[status] || "text-gray-400"
}

export function scoreColor(score: number | null | undefined): string {
  if (!score) return "text-gray-400"
  if (score >= 90) return "text-green-400"
  if (score >= 75) return "text-yellow-400"
  if (score >= 60) return "text-orange-400"
  return "text-red-400"
}
