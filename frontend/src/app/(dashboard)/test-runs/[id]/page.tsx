"use client"
import { useQuery } from "@tanstack/react-query"
import { testRunsApi, reportsApi } from "@/lib/api"
import { LoadingPage } from "@/components/loading"
import { StatusBadge, SeverityBadge } from "@/components/severity-badge"
import { StatCard } from "@/components/stat-card"
import { formatDate, formatDuration, scoreColor } from "@/lib/utils"
import { Shield, Zap, Play, AlertTriangle, ChevronDown, ChevronRight, Terminal, Download } from "lucide-react"
import { useState, use } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "@/components/ui/toaster"

export default function TestRunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = use(params)
  const id = Number(idStr)
  const qc = useQueryClient()
  const { data: run, isLoading } = useQuery({ queryKey: ["run", id], queryFn: () => testRunsApi.get(id).then(r => r.data) })
  const [selectedResult, setSelectedResult] = useState<any>(null)
  const [traceData, setTraceData] = useState<any>(null)
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set())

  const reportMutation = useMutation({
    mutationFn: () => reportsApi.create({ test_run_id: id }),
    onSuccess: (res) => { toast("Report generated!", "success") },
  })

  const loadTrace = async (resultId: number) => {
    if (selectedResult?.id === resultId && traceData) { setSelectedResult(null); setTraceData(null); return }
    const result = run.results.find((r: any) => r.id === resultId)
    setSelectedResult(result)
    try {
      const res = await testRunsApi.getTrace(id, resultId)
      setTraceData(res.data)
    } catch {}
  }

  if (isLoading) return <LoadingPage />
  if (!run) return <div className="p-8 text-gray-400">Run not found</div>

  const EVENT_COLORS: Record<string, string> = {
    user_message: "text-blue-400 border-blue-500/20 bg-blue-500/5",
    agent_response: "text-green-400 border-green-500/20 bg-green-500/5",
    agent_thinking: "text-gray-400 border-gray-500/20 bg-gray-500/5",
    tool_call: "text-yellow-400 border-yellow-500/20 bg-yellow-500/5",
    tool_result: "text-orange-400 border-orange-500/20 bg-orange-500/5",
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <div className="text-xs text-gray-500 mb-2">← <a href="/test-runs" className="hover:text-gray-300">Test Runs</a></div>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-black">{run.name}</h1>
            <p className="text-gray-400 text-sm mt-1">{formatDate(run.created_at)}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => reportMutation.mutate()} disabled={reportMutation.isPending} className="flex items-center gap-2 border border-white/10 hover:border-white/20 text-gray-400 hover:text-white px-3 py-2 rounded-lg text-sm transition-colors">
              <Download className="w-3.5 h-3.5" />{reportMutation.isPending ? "Generating..." : "Generate Report"}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Passed" value={run.passed} color="text-green-400" />
        <StatCard label="Failed" value={run.failed} color="text-red-400" />
        <StatCard label="Reliability" value={run.reliability_score} suffix="%" isScore icon={Shield} />
        <StatCard label="Security" value={run.security_score} suffix="%" isScore icon={Zap} />
        <StatCard label="Critical" value={run.critical_findings} color="text-red-400" icon={AlertTriangle} />
        <StatCard label="High" value={run.high_findings} color="text-orange-400" icon={AlertTriangle} />
        <StatCard label="Tokens" value={run.total_tokens?.toLocaleString()} />
        <StatCard label="Est. Cost" value={run.estimated_cost ? `$${run.estimated_cost}` : "N/A"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2 className="text-sm font-semibold text-gray-300 mb-3">Test Results ({run.results?.length})</h2>
          <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
            {run.results?.map((result: any) => (
              <div key={result.id}>
                <button onClick={() => loadTrace(result.id)} className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${selectedResult?.id === result.id ? "border-violet-500/30 bg-violet-500/5" : "border-white/5 hover:border-white/10 bg-white/[0.02]"}`}>
                  {selectedResult?.id === result.id ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{result.scenario_name}</div>
                    <div className="text-xs text-gray-500">{result.scenario_category}</div>
                  </div>
                  <StatusBadge status={result.status} />
                </button>

                {selectedResult?.id === result.id && traceData && (
                  <div className="mt-1 ml-4 border border-white/5 rounded-lg p-3 bg-black/20 space-y-2 max-h-64 overflow-y-auto">
                    {traceData.events?.map((ev: any) => (
                      <div key={ev.id} className={`text-xs border rounded p-2 font-mono ${EVENT_COLORS[ev.event_type] || "text-gray-400 border-gray-500/20 bg-gray-500/5"}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold uppercase">{ev.actor || ev.event_type}</span>
                          {ev.tool_name && <span className="text-yellow-400">→ {ev.tool_name}</span>}
                          {ev.is_blocked && <span className="text-red-400">BLOCKED</span>}
                        </div>
                        {ev.content && <div className="text-xs opacity-80 truncate">{ev.content}</div>}
                        {ev.tool_args && <div className="text-xs opacity-60 truncate">Args: {JSON.stringify(ev.tool_args)}</div>}
                        {ev.tool_result && <div className="text-xs opacity-60 truncate">Result: {ev.tool_result?.substring(0, 80)}</div>}
                      </div>
                    ))}
                    {traceData.findings?.map((f: any) => (
                      <div key={f.id} className="text-xs border border-red-500/20 bg-red-500/5 text-red-300 rounded p-2">
                        <div className="flex items-center gap-2 mb-1"><AlertTriangle className="w-3 h-3" /><SeverityBadge severity={f.severity} /><span className="font-bold">{f.title}</span></div>
                        <div className="opacity-80">{f.description}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-gray-300 mb-3">Findings ({(run.findings || []).length})</h2>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {(run.findings || []).length === 0 ? (
              <div className="text-center py-8 text-gray-600 text-sm">
                {run.status === "completed" ? "No findings — all tests passed!" : "Run in progress..."}
              </div>
            ) : (
              (run.findings || []).map((f: any, i: number) => (
                <div key={f.id || i} className="border border-white/5 bg-white/[0.02] rounded-lg p-3">
                  <div className="flex items-start gap-2 mb-2">
                    <SeverityBadge severity={f.severity} />
                    <div className="flex-1">
                      <span className="text-sm font-medium">{f.title}</span>
                      {f.scenario_name && <span className="text-xs text-gray-500 ml-2">· {f.scenario_name}</span>}
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mb-2">{f.description}</p>
                  {f.expected_behavior && <p className="text-xs text-green-400/70 mt-1"><span className="font-medium text-green-400">Expected:</span> {f.expected_behavior}</p>}
                  {f.evidence && <p className="text-xs text-gray-500 mt-1"><span className="text-gray-400 font-medium">Evidence:</span> {f.evidence}</p>}
                  {f.recommended_fix && <p className="text-xs text-blue-400 mt-1"><span className="font-medium">Fix:</span> {f.recommended_fix}</p>}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
