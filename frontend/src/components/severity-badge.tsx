import { severityBg, riskBg } from "@/lib/utils"

export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${severityBg(severity)}`}>
      {severity}
    </span>
  )
}

export function RiskBadge({ risk }: { risk: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${riskBg(risk)}`}>
      {risk}
    </span>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    passed: "bg-green-500/10 text-green-400 border-green-500/20",
    failed: "bg-red-500/10 text-red-400 border-red-500/20",
    running: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    queued: "bg-gray-500/10 text-gray-400 border-gray-500/20",
    error: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    completed: "bg-green-500/10 text-green-400 border-green-500/20",
    recording: "bg-red-500/10 text-red-400 border-red-500/20 animate-pulse",
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${colors[status.toLowerCase()] || "bg-gray-500/10 text-gray-400 border-gray-500/20"}`}>
      {status}
    </span>
  )
}
