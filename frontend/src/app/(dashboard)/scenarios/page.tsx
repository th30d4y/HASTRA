"use client"
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { scenariosApi, testRunsApi } from "@/lib/api"
import { PageHeader } from "@/components/page-header"
import { LoadingPage, EmptyState } from "@/components/loading"
import { SeverityBadge, StatusBadge } from "@/components/severity-badge"
import { formatDate } from "@/lib/utils"
import Link from "next/link"
import { Play, FlaskConical, Zap, Filter } from "lucide-react"
import { toast } from "@/components/ui/toaster"
import { useRouter } from "next/navigation"

export default function ScenariosPage() {
  const qc = useQueryClient()
  const router = useRouter()
  const [category, setCategory] = useState("")
  const [selectedIds, setSelectedIds] = useState<number[]>([])

  const { data: scenarios = [], isLoading } = useQuery({
    queryKey: ["scenarios-all"],
    queryFn: () => scenariosApi.list().then(r => r.data),
  })

  const runMutation = useMutation({
    mutationFn: ({ agent_id, ids }: { agent_id: number; ids: number[] }) =>
      testRunsApi.create({ agent_id, scenario_ids: ids }),
    onSuccess: (res) => {
      toast(`Test run started (${res.data.total_scenarios} scenarios)`, "success")
      router.push(`/test-runs/${res.data.id}`)
    },
    onError: (e: any) => toast(e.response?.data?.detail || "Failed to start run", "error"),
  })

  if (isLoading) return <LoadingPage />

  const categories: string[] = [...new Set<string>(scenarios.map((s: any) => s.category as string).filter(Boolean))]
  const filtered = category ? scenarios.filter((s: any) => s.category === category) : scenarios

  // Group scenarios by agent
  const byAgent: Record<number, { agent_id: number; scenarios: any[] }> = {}
  for (const s of filtered) {
    if (s.agent_id) {
      if (!byAgent[s.agent_id]) byAgent[s.agent_id] = { agent_id: s.agent_id, scenarios: [] }
      byAgent[s.agent_id].scenarios.push(s)
    }
  }

  const toggleSelect = (id: number) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const runSelected = () => {
    if (selectedIds.length === 0) return
    const scenario = scenarios.find((s: any) => selectedIds.includes(s.id))
    if (!scenario?.agent_id) { toast("Scenarios must have an agent assigned", "error"); return }
    runMutation.mutate({ agent_id: scenario.agent_id, ids: selectedIds })
  }

  return (
    <div className="p-8">
      <PageHeader
        title="Scenarios"
        description={`${scenarios.length} test scenarios`}
        action={
          selectedIds.length > 0 ? (
            <button onClick={runSelected} disabled={runMutation.isPending} className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              <Play className="w-4 h-4" />{runMutation.isPending ? "Starting..." : `Run ${selectedIds.length} Selected`}
            </button>
          ) : undefined
        }
      />

      {/* Filters */}
      {categories.length > 0 && (
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <Filter className="w-3.5 h-3.5 text-gray-500" />
          <button onClick={() => setCategory("")} className={`px-2.5 py-1 rounded text-xs transition-colors ${!category ? "bg-violet-600 text-white" : "bg-white/5 text-gray-400 hover:bg-white/10"}`}>All</button>
          {categories.map(c => (
            <button key={c} onClick={() => setCategory(c)} className={`px-2.5 py-1 rounded text-xs transition-colors capitalize ${category === c ? "bg-violet-600 text-white" : "bg-white/5 text-gray-400 hover:bg-white/10"}`}>{c?.replace(/_/g, " ")}</button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          title="No scenarios"
          description="Generate scenarios from an agent to start testing."
          action={<Link href="/agents" className="text-violet-400 hover:text-violet-300 text-sm">Go to Agents →</Link>}
        />
      ) : (
        <div className="space-y-1.5">
          {filtered.map((s: any) => (
            <div key={s.id} className={`flex items-center gap-3 p-3 border rounded-lg hover:border-white/10 transition-colors ${selectedIds.includes(s.id) ? "border-violet-500/30 bg-violet-500/5" : "border-white/5 bg-white/[0.02]"}`}>
              <input
                type="checkbox"
                checked={selectedIds.includes(s.id)}
                onChange={() => toggleSelect(s.id)}
                className="accent-violet-500 flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{s.name}</span>
                  {s.is_generated && <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded flex-shrink-0">AI</span>}
                  {s.is_demo && <span className="text-[10px] bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-1.5 py-0.5 rounded flex-shrink-0">DEMO</span>}
                </div>
                <div className="text-xs text-gray-500 truncate mt-0.5">{s.user_input}</div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-gray-500 capitalize hidden sm:block">{s.category?.replace(/_/g, " ")}</span>
                <SeverityBadge severity={s.risk_level} />
                {s.agent_id && (
                  <button
                    onClick={() => runMutation.mutate({ agent_id: s.agent_id, ids: [s.id] })}
                    disabled={runMutation.isPending}
                    title="Run this scenario"
                    className="p-1.5 hover:bg-violet-500/20 text-gray-500 hover:text-violet-400 rounded transition-colors"
                  >
                    <Play className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
