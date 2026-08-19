"use client"
import { useQuery } from "@tanstack/react-query"
import { reportsApi } from "@/lib/api"
import { LoadingPage } from "@/components/loading"
import { SeverityBadge } from "@/components/severity-badge"
import { StatCard } from "@/components/stat-card"
import { formatDate, scoreColor } from "@/lib/utils"
import { Shield, Zap } from "lucide-react"
import Link from "next/link"
import { use } from "react"

export default function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = use(params)
  const id = Number(idStr)
  const { data: report, isLoading } = useQuery({
    queryKey: ["report", id],
    queryFn: () => reportsApi.get(id).then(r => r.data),
  })
  if (isLoading) return <LoadingPage />
  if (!report) return <div className="p-8 text-gray-400">Report not found</div>
  const content = report.content || {}
  const exec = content.executive_summary || {}
  const findings = content.findings || {}
  const scores = content.scores || {}

  return (
    <div className="p-8 max-w-4xl">
      <div className="text-xs text-gray-500 mb-4"><Link href="/reports" className="hover:text-gray-300">← Reports</Link></div>
      <h1 className="text-2xl font-black mb-1">{report.title}</h1>
      <p className="text-gray-400 text-sm mb-6">{formatDate(report.created_at)}</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Agent" value={exec.agent_name || "—"} />
        <StatCard label="Scenarios" value={exec.total_scenarios} />
        <StatCard label="Reliability" value={scores.reliability} suffix="%" isScore icon={Shield} />
        <StatCard label="Security" value={scores.security} suffix="%" isScore icon={Zap} />
      </div>

      {exec.risk_level && (
        <div className="border border-white/5 bg-white/[0.02] rounded-xl p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-300 mb-3">Executive Summary</h2>
          <div className="flex items-center gap-6">
            <div><div className="text-xs text-gray-500 mb-1">Overall Risk</div><SeverityBadge severity={exec.risk_level} /></div>
            <div><div className="text-xs text-gray-500 mb-1">Pass Rate</div><div className={`text-lg font-bold ${scoreColor(exec.pass_rate)}`}>{exec.pass_rate}%</div></div>
          </div>
        </div>
      )}

      {(["critical", "high", "medium", "low"] as const).map(level => {
        const arr = findings[level] || []
        if (!arr.length) return null
        return (
          <div key={level} className="mb-4">
            <h2 className="text-sm font-semibold text-gray-300 mb-2 capitalize">{level} Findings ({arr.length})</h2>
            <div className="space-y-2">
              {arr.map((f: any, i: number) => (
                <div key={i} className="border border-white/5 bg-white/[0.02] rounded-lg p-4">
                  <div className="flex items-start gap-2 mb-2">
                    <SeverityBadge severity={level.toUpperCase()} />
                    <span className="font-medium text-sm">{f.title}</span>
                  </div>
                  <p className="text-xs text-gray-400 mb-2">{f.description}</p>
                  {f.recommended_fix && (
                    <p className="text-xs text-blue-400"><span className="font-medium">Fix:</span> {f.recommended_fix}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
