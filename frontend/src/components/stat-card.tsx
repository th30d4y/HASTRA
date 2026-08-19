import { cn, scoreColor } from "@/lib/utils"
import { LucideIcon } from "lucide-react"

interface StatCardProps {
  label: string
  value: string | number | null | undefined
  icon?: LucideIcon
  trend?: { value: number; label: string }
  color?: string
  isScore?: boolean
  suffix?: string
}

export function StatCard({ label, value, icon: Icon, color, isScore, suffix }: StatCardProps) {
  const displayValue = value === null || value === undefined ? "—" : value
  const colorClass = isScore && typeof value === "number" ? scoreColor(value) : (color || "text-white")

  return (
    <div className="border border-white/5 bg-white/[0.02] rounded-xl p-5 hover:border-white/10 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">{label}</span>
        {Icon && <Icon className="w-4 h-4 text-gray-600" />}
      </div>
      <div className={`text-3xl font-black ${colorClass}`}>
        {displayValue}{suffix && <span className="text-lg ml-0.5">{suffix}</span>}
      </div>
    </div>
  )
}
