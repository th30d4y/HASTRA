"use client"
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toolsApi } from "@/lib/api"
import { PageHeader } from "@/components/page-header"
import { LoadingPage, EmptyState } from "@/components/loading"
import { RiskBadge } from "@/components/severity-badge"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "@/components/ui/toaster"

const RISK_LEVELS = ["SAFE", "LOW", "MEDIUM", "HIGH", "CRITICAL"]

export default function ToolsPage() {
  const qc = useQueryClient()
  const { data: tools = [], isLoading } = useQuery({
    queryKey: ["tools"],
    queryFn: () => toolsApi.list().then(r => r.data),
  })
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: "", description: "", risk_level: "SAFE", execution_mode: "MOCK", requires_confirmation: false, mock_response: "" })

  const createMutation = useMutation({
    mutationFn: () => toolsApi.create({ ...form, input_schema: { type: "object", properties: {} } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tools"] }); setShowAdd(false); setForm({ name: "", description: "", risk_level: "SAFE", execution_mode: "MOCK", requires_confirmation: false, mock_response: "" }); toast("Tool created", "success") },
    onError: (e: any) => toast(e.response?.data?.detail || "Failed", "error"),
  })
  const deleteMutation = useMutation({
    mutationFn: (id: number) => toolsApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tools"] }); toast("Tool deleted", "info") },
  })

  if (isLoading) return <LoadingPage />

  return (
    <div className="p-8 max-w-3xl">
      <PageHeader
        title="Tools"
        description="Configure agent tools and their risk levels"
        action={<button onClick={() => setShowAdd(v => !v)} className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"><Plus className="w-4 h-4" /> New Tool</button>}
      />

      {showAdd && (
        <div className="border border-violet-500/20 bg-violet-500/5 rounded-xl p-5 mb-6 space-y-3">
          <h3 className="text-sm font-semibold">Create Tool</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Name</label>
              <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50" placeholder="get_order" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Risk Level</label>
              <select value={form.risk_level} onChange={e => setForm(f => ({...f, risk_level: e.target.value}))} className="w-full bg-[#111] border border-white/10 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 appearance-none" style={{ colorScheme: "dark" }}>
                {RISK_LEVELS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Description</label>
            <input value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50" placeholder="Retrieve order details by ID" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Mock Response (JSON)</label>
            <textarea value={form.mock_response} onChange={e => setForm(f => ({...f, mock_response: e.target.value}))} rows={2} className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/50" placeholder='{"status": "success", "data": {}}' />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input type="checkbox" checked={form.requires_confirmation} onChange={e => setForm(f => ({...f, requires_confirmation: e.target.checked}))} className="accent-violet-500" />
            Requires confirmation before executing
          </label>
          <div className="flex gap-2">
            <button onClick={() => createMutation.mutate()} disabled={!form.name || createMutation.isPending} className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">{createMutation.isPending ? "Creating..." : "Create Tool"}</button>
            <button onClick={() => setShowAdd(false)} className="border border-white/10 text-gray-400 px-4 py-2 rounded-lg text-sm transition-colors hover:border-white/20">Cancel</button>
          </div>
        </div>
      )}

      {tools.length === 0 ? (
        <EmptyState title="No tools configured" description="Create tools that your agents can use. Tools define what actions agents can take." action={<button onClick={() => setShowAdd(true)} className="text-violet-400 hover:text-violet-300 text-sm">Create your first tool →</button>} />
      ) : (
        <div className="border border-white/5 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.02]">
                <th className="text-left text-xs text-gray-500 font-medium px-4 py-3 uppercase tracking-wider">Tool</th>
                <th className="text-left text-xs text-gray-500 font-medium px-4 py-3 uppercase tracking-wider">Risk</th>
                <th className="text-left text-xs text-gray-500 font-medium px-4 py-3 uppercase tracking-wider">Mode</th>
                <th className="text-left text-xs text-gray-500 font-medium px-4 py-3 uppercase tracking-wider">Confirm?</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {tools.map((t: any) => (
                <tr key={t.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-mono text-sm text-violet-300">{t.name}</div>
                    <div className="text-xs text-gray-500">{t.description}</div>
                  </td>
                  <td className="px-4 py-3"><RiskBadge risk={t.risk_level} /></td>
                  <td className="px-4 py-3"><span className="text-xs text-gray-400 bg-white/5 px-2 py-0.5 rounded">{t.execution_mode}</span></td>
                  <td className="px-4 py-3"><span className={`text-xs font-medium ${t.requires_confirmation ? "text-yellow-400" : "text-gray-600"}`}>{t.requires_confirmation ? "Yes" : "No"}</span></td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => deleteMutation.mutate(t.id)} className="p-1.5 hover:bg-red-500/10 text-gray-400 hover:text-red-400 rounded transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
