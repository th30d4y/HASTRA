"use client"
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { findingsApi } from "@/lib/api"
import { PageHeader } from "@/components/page-header"
import { LoadingPage, EmptyState } from "@/components/loading"
import { SeverityBadge } from "@/components/severity-badge"
import { formatDate } from "@/lib/utils"
import { AlertTriangle, ChevronDown, ChevronRight, Shield, Wrench, Eye, CheckCircle, XCircle } from "lucide-react"
import Link from "next/link"

function FindingRow({ finding, expanded, onToggle }: { finding: any; expanded: boolean; onToggle: () => void }) {
  const { data: detail } = useQuery({
    queryKey: ["finding", finding.id],
    queryFn: () => findingsApi.get(finding.id).then(r => r.data),
    enabled: expanded,
  })

  return (
    <div className="border border-white/5 rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 p-4 hover:bg-white/[0.02] transition-colors text-left"
      >
        {expanded ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
        <SeverityBadge severity={finding.severity} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">{finding.title}</div>
          <div className="text-xs text-gray-500 truncate mt-0.5">{finding.description}</div>
        </div>
        <div className="text-xs text-gray-600 flex-shrink-0">{formatDate(finding.created_at)}</div>
      </button>

      {expanded && detail && (
        <div className="border-t border-white/5 bg-white/[0.01] p-5 space-y-4">
          {/* Context */}
          {detail.agent_name && (
            <div className="flex items-center gap-6 text-xs text-gray-400">
              <span>Agent: <Link href={`/agents/${detail.agent_id}`} className="text-violet-400 hover:text-violet-300">{detail.agent_name}</Link></span>
              {detail.scenario_name && <span>Scenario: <span className="text-gray-300">{detail.scenario_name}</span></span>}
              {detail.scenario_category && <span>Category: <span className="text-gray-300 capitalize">{detail.scenario_category}</span></span>}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {/* Expected */}
            <div className="border border-green-500/20 bg-green-500/5 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-xs font-semibold text-green-400 uppercase tracking-wider">Expected Behavior</span>
              </div>
              <p className="text-sm text-gray-300">{detail.expected_behavior || "Not specified"}</p>
            </div>

            {/* Actual */}
            <div className="border border-red-500/20 bg-red-500/5 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <XCircle className="w-4 h-4 text-red-400" />
                <span className="text-xs font-semibold text-red-400 uppercase tracking-wider">Actual Behavior</span>
              </div>
              <p className="text-sm text-gray-300">{detail.actual_behavior || detail.description}</p>
            </div>
          </div>

          {/* Evidence */}
          {detail.evidence && (
            <div className="border border-white/5 bg-white/[0.02] rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Eye className="w-4 h-4 text-gray-400" />
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Evidence</span>
              </div>
              <p className="text-sm text-gray-300 font-mono text-xs">{detail.evidence}</p>
            </div>
          )}

          {/* Trace events */}
          {detail.trace_events && detail.trace_events.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Execution Trace</div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {detail.trace_events.map((ev: any, i: number) => (
                  <div key={i} className={`flex gap-2 text-xs font-mono px-3 py-1.5 rounded ${
                    ev.event_type === "tool_call" ? "bg-yellow-500/5 border border-yellow-500/10 text-yellow-300" :
                    ev.actor === "user" ? "bg-blue-500/5 border border-blue-500/10 text-blue-300" :
                    "bg-white/5 border border-white/5 text-gray-400"
                  }`}>
                    <span className="text-gray-600 w-4 flex-shrink-0">{i + 1}</span>
                    <span className="font-bold uppercase text-[10px] w-16 flex-shrink-0">{ev.actor}</span>
                    <span className="truncate">{ev.tool_name ? `${ev.tool_name}(${JSON.stringify(ev.tool_args || {}).substring(0, 40)})` : (ev.content || "")?.substring(0, 80)}</span>
                    {ev.is_blocked && <span className="ml-auto text-red-400 flex-shrink-0">BLOCKED</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Fix recommendation */}
          {detail.recommended_fix && (
            <div className="border border-blue-500/20 bg-blue-500/5 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Wrench className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Recommended Fix</span>
              </div>
              <p className="text-sm text-blue-200">{detail.recommended_fix}</p>
            </div>
          )}

          {detail.confidence && (
            <div className="text-xs text-gray-600">Confidence: {Math.round(detail.confidence * 100)}%</div>
          )}
        </div>
      )}
    </div>
  )
}

export default function FindingsPage() {
  const [severity, setSeverity] = useState("")
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const { data: findings = [], isLoading } = useQuery({
    queryKey: ["findings", severity],
    queryFn: () => findingsApi.list(severity ? { severity } : undefined).then(r => r.data),
  })

  if (isLoading) return <LoadingPage />

  const counts = findings.reduce((acc: Record<string, number>, f: any) => {
    acc[f.severity] = (acc[f.severity] || 0) + 1
    return acc
  }, {})

  return (
    <div className="p-8">
      <PageHeader
        title="Findings"
        description="Security and reliability issues detected during testing"
      />

      {/* Severity filter + counts */}
      <div className="flex items-center gap-2 mb-6">
        {[
          { label: "All", value: "", color: "bg-white/5 text-gray-400 hover:bg-white/10" },
          { label: `CRITICAL${counts["CRITICAL"] ? ` (${counts["CRITICAL"]})` : ""}`, value: "CRITICAL", color: "bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20" },
          { label: `HIGH${counts["HIGH"] ? ` (${counts["HIGH"]})` : ""}`, value: "HIGH", color: "bg-orange-500/10 text-orange-400 border-orange-500/20 hover:bg-orange-500/20" },
          { label: `MEDIUM${counts["MEDIUM"] ? ` (${counts["MEDIUM"]})` : ""}`, value: "MEDIUM", color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20 hover:bg-yellow-500/20" },
          { label: `LOW${counts["LOW"] ? ` (${counts["LOW"]})` : ""}`, value: "LOW", color: "bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20" },
        ].map(btn => (
          <button
            key={btn.value}
            onClick={() => setSeverity(btn.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${btn.color} ${severity === btn.value ? "ring-1 ring-white/20" : "border-transparent"}`}
          >
            {btn.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-500">{findings.length} finding{findings.length !== 1 ? "s" : ""}</span>
      </div>

      {findings.length === 0 ? (
        <EmptyState
          title="No findings"
          description="Run tests against an agent to detect security and reliability issues."
          action={<Link href="/agents" className="text-violet-400 hover:text-violet-300 text-sm">Go to Agents →</Link>}
        />
      ) : (
        <div className="space-y-2">
          {findings.map((f: any) => (
            <FindingRow
              key={f.id}
              finding={f}
              expanded={expandedId === f.id}
              onToggle={() => setExpandedId(expandedId === f.id ? null : f.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
