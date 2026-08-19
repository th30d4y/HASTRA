"use client"
import { useState, use } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { agentsApi, scenariosApi, testRunsApi } from "@/lib/api"
import { api } from "@/lib/api"
import { LoadingPage, EmptyState } from "@/components/loading"
import { SeverityBadge, StatusBadge } from "@/components/severity-badge"
import { StatCard } from "@/components/stat-card"
import { formatDate, scoreColor } from "@/lib/utils"
import { Shield, Zap, Play, FlaskConical, GitBranch, Send, Bot, Wrench, Loader2, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react"
import Link from "next/link"
import { toast } from "@/components/ui/toaster"

export default function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = use(params)
  const id = Number(idStr)
  const qc = useQueryClient()
  const [tab, setTab] = useState<"overview" | "console" | "scenarios" | "runs" | "versions">("overview")
  const [selectedScenarios, setSelectedScenarios] = useState<number[]>([])
  const [chatInput, setChatInput] = useState("")
  const [chatMessages, setChatMessages] = useState<{role: string; content: string; tool_calls?: any[]}[]>([])
  const [chatLoading, setChatLoading] = useState(false)
  const [expandedTrace, setExpandedTrace] = useState<number | null>(null)
  const [traceData, setTraceData] = useState<Record<number, any>>({})

  const { data: agent, isLoading } = useQuery({ queryKey: ["agent", id], queryFn: () => agentsApi.get(id).then(r => r.data) })
  const { data: scenarios = [] } = useQuery({ queryKey: ["scenarios", id], queryFn: () => scenariosApi.list(id).then(r => r.data), enabled: tab === "scenarios" || tab === "overview" })
  const { data: runs = [] } = useQuery({ queryKey: ["runs", id], queryFn: () => testRunsApi.list(id).then(r => r.data), enabled: tab === "runs" || tab === "overview" })
  const { data: versions = [] } = useQuery({ queryKey: ["versions", id], queryFn: () => agentsApi.getVersions(id).then(r => r.data), enabled: tab === "versions" })

  const generateMutation = useMutation({
    mutationFn: () => scenariosApi.generate({ agent_id: id, count: 15 }),
    onSuccess: (res) => { qc.invalidateQueries({ queryKey: ["scenarios", id] }); toast(`Generated ${res.data.generated} scenarios`, "success") },
    onError: (e: any) => toast(e.response?.data?.detail || "Generation failed", "error"),
  })

  const runMutation = useMutation({
    mutationFn: () => testRunsApi.create({ agent_id: id, scenario_ids: selectedScenarios.length > 0 ? selectedScenarios : scenarios.map((s: any) => s.id) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["runs", id] }); qc.invalidateQueries({ queryKey: ["agent", id] }); toast("Tests started", "success"); setTab("runs") },
    onError: (e: any) => toast(e.response?.data?.detail || "Test run failed", "error"),
  })

  const sendChat = async () => {
    const text = chatInput.trim()
    if (!text || chatLoading) return
    setChatInput("")
    const newMessages = [...chatMessages, { role: "user", content: text }]
    setChatMessages(newMessages)
    setChatLoading(true)
    try {
      const res = await agentsApi.chat(id, newMessages.map(m => ({ role: m.role, content: m.content })))
      setChatMessages([...newMessages, { role: "assistant", content: res.data.response, tool_calls: res.data.tool_calls }])
    } catch (e: any) {
      setChatMessages([...newMessages, { role: "assistant", content: `Error: ${e.response?.data?.detail || e.message}` }])
    } finally {
      setChatLoading(false)
    }
  }

  const loadTrace = async (runId: number, resultId: number) => {
    const key = resultId
    if (expandedTrace === key) { setExpandedTrace(null); return }
    setExpandedTrace(key)
    if (!traceData[key]) {
      const res = await testRunsApi.getTrace(runId, resultId)
      setTraceData(prev => ({ ...prev, [key]: res.data }))
    }
  }

  if (isLoading) return <LoadingPage />
  if (!agent) return <div className="p-8 text-gray-400">Agent not found</div>

  const TABS = [
    { key: "overview", label: "Overview" },
    { key: "console", label: "Test Console" },
    { key: "scenarios", label: `Scenarios (${scenarios.length})` },
    { key: "runs", label: `Test Runs (${runs.length})` },
    { key: "versions", label: `Versions (${versions.length})` },
  ]

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link href="/agents" className="text-xs text-gray-500 hover:text-gray-300 mb-2 block">← Agents</Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black">{agent.name}</h1>
            {agent.is_demo && <span className="text-xs bg-yellow-500/15 text-yellow-400 border border-yellow-500/20 px-2 py-0.5 rounded">DEMO</span>}
            <span className="text-xs bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-0.5 rounded">v{agent.current_version}</span>
          </div>
          {agent.description && <p className="text-gray-400 text-sm mt-1">{agent.description}</p>}
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setTab("scenarios"); generateMutation.mutate() }} disabled={generateMutation.isPending} className="flex items-center gap-2 border border-violet-500/30 hover:border-violet-500/60 text-violet-400 px-3 py-2 rounded-lg text-sm transition-colors disabled:opacity-50">
            <FlaskConical className="w-3.5 h-3.5" />{generateMutation.isPending ? "Generating..." : "Generate Tests"}
          </button>
          <button onClick={() => runMutation.mutate()} disabled={runMutation.isPending || scenarios.length === 0} className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-sm transition-colors">
            <Play className="w-3.5 h-3.5" />{runMutation.isPending ? "Starting..." : "Run Tests"}
          </button>
        </div>
      </div>

      {/* Score cards */}
      {(agent.reliability_score !== null || agent.security_score !== null) && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <StatCard label="Reliability" value={agent.reliability_score} suffix="%" isScore icon={Shield} />
          <StatCard label="Security" value={agent.security_score} suffix="%" isScore icon={Zap} />
          <StatCard label="Version" value={`v${agent.current_version}`} icon={GitBranch} />
          <StatCard label="Tools" value={agent.tool_count} icon={Wrench} />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/5 mb-6">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)} className={`px-4 py-2 text-sm border-b-2 transition-colors ${tab === t.key ? "border-violet-500 text-violet-400" : "border-transparent text-gray-400 hover:text-white"}`}>{t.label}</button>
        ))}
      </div>

      {/* Overview */}
      {tab === "overview" && (
        <div className="grid grid-cols-2 gap-6">
          <div className="border border-white/5 bg-white/[0.02] rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Configuration</h3>
            <div className="space-y-2 text-sm">
              {agent.model_id && <div className="flex justify-between"><span className="text-gray-500">Model</span><span className="font-mono text-xs">{agent.model_id}</span></div>}
              <div className="flex justify-between"><span className="text-gray-500">Temperature</span><span>{agent.temperature}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Max Tokens</span><span>{agent.max_tokens}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Environment</span><span className="capitalize">{agent.environment}</span></div>
            </div>
          </div>
          <div className="border border-white/5 bg-white/[0.02] rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Tools ({agent.tool_count})</h3>
            {agent.tools?.length === 0 ? (
              <p className="text-xs text-gray-500">No tools attached.</p>
            ) : (
              <div className="space-y-1.5">
                {agent.tools?.map((t: any) => (
                  <div key={t.id} className="flex items-center justify-between text-xs">
                    <span className="font-mono text-gray-300">{t.name}</span>
                    <div className="flex items-center gap-2">
                      {t.requires_confirmation && <span className="text-yellow-400 text-[10px]">CONFIRM</span>}
                      <SeverityBadge severity={t.risk_level} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="col-span-2 border border-white/5 bg-white/[0.02] rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">System Prompt</h3>
            <p className="text-xs text-gray-400 font-mono leading-relaxed whitespace-pre-wrap">{agent.system_prompt || "No system prompt configured"}</p>
          </div>
        </div>
      )}

      {/* Test Console */}
      {tab === "console" && (
        <div className="border border-white/5 rounded-xl overflow-hidden">
          <div className="bg-white/[0.03] px-4 py-2.5 border-b border-white/5 flex items-center gap-2">
            <Bot className="w-4 h-4 text-violet-400" />
            <span className="text-sm font-medium">{agent.name}</span>
            <span className="text-xs text-gray-500 font-mono ml-2">{agent.model_id}</span>
            <span className="ml-auto text-xs text-gray-500">{agent.environment} · {agent.tool_count} tools</span>
          </div>

          {/* Messages */}
          <div className="h-96 overflow-y-auto p-4 space-y-3">
            {chatMessages.length === 0 && (
              <div className="text-center py-8 text-gray-600 text-sm">
                <Bot className="w-8 h-8 mx-auto mb-2 opacity-30" />
                Send a message to test this agent with its real LLM and tools
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i}>
                <div className={`flex gap-2 ${msg.role === "user" ? "justify-end" : ""}`}>
                  {msg.role !== "user" && (
                    <div className="w-6 h-6 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Bot className="w-3.5 h-3.5 text-violet-400" />
                    </div>
                  )}
                  <div className={`max-w-[75%] text-sm rounded-xl px-3 py-2 ${msg.role === "user" ? "bg-violet-600 text-white rounded-tr-sm" : "bg-white/5 text-gray-200 rounded-tl-sm"}`}>
                    {msg.content}
                  </div>
                </div>
                {/* Tool calls */}
                {msg.tool_calls && msg.tool_calls.length > 0 && (
                  <div className="ml-8 mt-1.5 space-y-1">
                    {msg.tool_calls.map((tc: any, j: number) => (
                      <div key={j} className="flex items-center gap-2 text-xs border border-yellow-500/20 bg-yellow-500/5 rounded-lg px-3 py-1.5">
                        <Wrench className="w-3 h-3 text-yellow-400 flex-shrink-0" />
                        <span className="font-mono text-yellow-300">{tc.name}</span>
                        <span className="text-gray-500 truncate">{JSON.stringify(tc.args || tc.input || {}).substring(0, 60)}</span>
                        <span className="ml-auto text-green-400 text-[10px]">✓</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {chatLoading && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <div className="w-6 h-6 rounded-full bg-violet-500/20 flex items-center justify-center">
                  <Loader2 className="w-3.5 h-3.5 text-violet-400 animate-spin" />
                </div>
                Thinking...
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-white/5 p-3 flex gap-2">
            <input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendChat()}
              className="flex-1 bg-white/5 border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
              placeholder="Send a message to the agent..."
              disabled={chatLoading}
            />
            <button onClick={sendChat} disabled={!chatInput.trim() || chatLoading} className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm transition-colors">
              {chatLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      {/* Scenarios */}
      {tab === "scenarios" && (
        <div>
          {scenarios.length === 0 ? (
            <EmptyState title="No scenarios" description="Generate scenarios to start testing this agent." action={<button onClick={() => generateMutation.mutate()} className="text-violet-400 hover:text-violet-300 text-sm">Generate Scenarios →</button>} />
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-gray-500">{selectedScenarios.length > 0 ? `${selectedScenarios.length} selected` : "Select to run specific scenarios"}</p>
                <div className="flex gap-2">
                  <button onClick={() => setSelectedScenarios(scenarios.map((s: any) => s.id))} className="text-xs text-gray-400 hover:text-white">All</button>
                  <button onClick={() => setSelectedScenarios([])} className="text-xs text-gray-400 hover:text-white">None</button>
                </div>
              </div>
              {scenarios.map((s: any) => (
                <div key={s.id} className="flex items-center gap-3 p-3 border border-white/5 rounded-lg hover:border-white/10 transition-colors">
                  <input type="checkbox" checked={selectedScenarios.includes(s.id)} onChange={e => setSelectedScenarios(prev => e.target.checked ? [...prev, s.id] : prev.filter(x => x !== s.id))} className="accent-violet-500" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{s.name}</div>
                    <div className="text-xs text-gray-500 truncate">{s.user_input}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">{s.category}</span>
                    <SeverityBadge severity={s.risk_level} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Runs */}
      {tab === "runs" && (
        <div className="space-y-2">
          {runs.length === 0 ? (
            <EmptyState title="No test runs" description="Run the test suite to see results." />
          ) : runs.map((run: any) => (
            <div key={run.id} className="border border-white/5 bg-white/[0.02] rounded-xl overflow-hidden">
              <Link href={`/test-runs/${run.id}`} className="flex items-center gap-4 p-4 hover:bg-white/[0.02] transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{run.name}</div>
                  <div className="text-xs text-gray-500">{formatDate(run.created_at)}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs">
                    <span className="text-green-400">{run.passed}</span>
                    <span className="text-gray-600">/</span>
                    <span className="text-red-400">{run.failed}</span>
                    <span className="text-gray-600">/{run.total_scenarios}</span>
                  </span>
                  {run.reliability_score !== null && <span className={`text-xs font-bold ${scoreColor(run.reliability_score)}`}>{run.reliability_score}%</span>}
                  {run.critical_findings > 0 && <span className="text-xs text-red-400 font-bold">C:{run.critical_findings}</span>}
                  <StatusBadge status={run.status} />
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* Versions */}
      {tab === "versions" && (
        <div className="space-y-2">
          {versions.map((v: any) => (
            <div key={v.id} className="flex items-center gap-4 p-4 border border-white/5 rounded-lg">
              <div className="text-sm font-mono text-violet-400 w-8">v{v.version_number}</div>
              <div className="flex-1"><div className="text-sm font-medium">{v.change_description}</div><div className="text-xs text-gray-500">{formatDate(v.created_at)}</div></div>
              {v.reliability_score !== null && <span className={`text-xs font-bold ${scoreColor(v.reliability_score)}`}>{v.reliability_score}%</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
