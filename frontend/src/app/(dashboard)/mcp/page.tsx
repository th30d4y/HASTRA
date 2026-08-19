"use client"
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { mcpApi } from "@/lib/api"
import { PageHeader } from "@/components/page-header"
import { LoadingPage, EmptyState } from "@/components/loading"
import { Plus, Trash2, Circle } from "lucide-react"
import { toast } from "@/components/ui/toaster"

export default function McpPage() {
  const qc = useQueryClient()
  const { data: servers = [], isLoading } = useQuery({
    queryKey: ["mcp"],
    queryFn: () => mcpApi.list().then(r => r.data),
  })
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: "", description: "", transport: "http", endpoint: "" })

  const createMutation = useMutation({
    mutationFn: () => mcpApi.create(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["mcp"] }); setShowAdd(false); setForm({ name: "", description: "", transport: "http", endpoint: "" }); toast("MCP server added", "success") },
    onError: (e: any) => toast(e.response?.data?.detail || "Failed", "error"),
  })
  const deleteMutation = useMutation({
    mutationFn: (id: number) => mcpApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["mcp"] }); toast("Server removed", "info") },
  })

  if (isLoading) return <LoadingPage />

  return (
    <div className="p-8 max-w-2xl">
      <PageHeader
        title="MCP Servers"
        description="Connect Model Context Protocol servers for browser and tool automation"
        action={<button onClick={() => setShowAdd(v => !v)} className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"><Plus className="w-4 h-4" /> Add Server</button>}
      />

      {showAdd && (
        <div className="border border-violet-500/20 bg-violet-500/5 rounded-xl p-5 mb-6 space-y-3">
          <h3 className="text-sm font-semibold">Add MCP Server</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Server Name</label>
              <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50" placeholder="Playwright MCP" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Transport</label>
              <div className="flex rounded-lg border border-white/10 overflow-hidden">
                {(["http", "stdio", "sse"] as const).map(opt => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setForm(f => ({...f, transport: opt}))}
                    className={`flex-1 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-violet-500
                      ${form.transport === opt
                        ? "bg-violet-600 text-white"
                        : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
                      }`}
                  >
                    {opt.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Endpoint URL</label>
            <input value={form.endpoint} onChange={e => setForm(f => ({...f, endpoint: e.target.value}))} className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/50" placeholder="http://localhost:3001" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => createMutation.mutate()} disabled={!form.name || createMutation.isPending} className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">{createMutation.isPending ? "Adding..." : "Add Server"}</button>
            <button onClick={() => setShowAdd(false)} className="border border-white/10 text-gray-400 px-4 py-2 rounded-lg text-sm transition-colors hover:border-white/20">Cancel</button>
          </div>
        </div>
      )}

      {servers.length === 0 ? (
        <EmptyState title="No MCP servers" description="Add MCP servers to give agents browser automation and external tool access." action={<button onClick={() => setShowAdd(true)} className="text-violet-400 hover:text-violet-300 text-sm">Add your first server →</button>} />
      ) : (
        <div className="space-y-2">
          {servers.map((s: any) => (
            <div key={s.id} className="flex items-center gap-4 p-4 border border-white/5 bg-white/[0.02] rounded-xl hover:border-white/10 transition-colors">
              <Circle className={`w-3 h-3 flex-shrink-0 ${s.is_connected ? "text-green-400 fill-green-400" : "text-gray-600 fill-gray-600"}`} />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{s.name}</div>
                <div className="text-xs text-gray-500 font-mono">{s.endpoint || s.transport}</div>
              </div>
              <span className="text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded">{s.transport}</span>
              <button onClick={() => deleteMutation.mutate(s.id)} className="p-1.5 hover:bg-red-500/10 text-gray-400 hover:text-red-400 rounded transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
