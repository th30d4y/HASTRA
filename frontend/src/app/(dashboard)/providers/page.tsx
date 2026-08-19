"use client"
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { providersApi } from "@/lib/api"
import { PageHeader } from "@/components/page-header"
import { LoadingPage } from "@/components/loading"
import { formatDate } from "@/lib/utils"
import { Plus, Trash2, CheckCircle, XCircle, Eye } from "lucide-react"
import { toast } from "@/components/ui/toaster"

export default function ProvidersPage() {
  const qc = useQueryClient()
  const { data: providers = [] } = useQuery({ queryKey: ["providers"], queryFn: () => providersApi.list().then(r => r.data) })
  const { data: apiKeys = [], isLoading } = useQuery({ queryKey: ["api-keys"], queryFn: () => providersApi.listKeys().then(r => r.data) })
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ provider_id: "", name: "", api_key: "", is_default: false })

  const createMutation = useMutation({
    mutationFn: () => providersApi.createKey({ ...form, provider_id: Number(form.provider_id) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["api-keys"] }); setShowAdd(false); setForm({ provider_id: "", name: "", api_key: "", is_default: false }); toast("API key saved", "success") },
    onError: (e: any) => toast(e.response?.data?.detail || "Failed to save key", "error"),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => providersApi.deleteKey(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["api-keys"] }); toast("Key deleted", "info") },
  })

  const validateMutation = useMutation({
    mutationFn: (id: number) => providersApi.validateKey(id),
    onSuccess: (res) => { qc.invalidateQueries({ queryKey: ["api-keys"] }); toast(res.data.is_valid ? "Key is valid ✓" : "Key is invalid", res.data.is_valid ? "success" : "error") },
  })

  if (isLoading) return <LoadingPage />

  return (
    <div className="p-8 max-w-3xl">
      <PageHeader
        title="Provider Settings"
        description="Manage LLM provider API keys"
        action={<button onClick={() => setShowAdd(v => !v)} className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"><Plus className="w-4 h-4" /> Add Key</button>}
      />

      {showAdd && (
        <div className="border border-violet-500/20 bg-violet-500/5 rounded-xl p-5 mb-6">
          <h3 className="text-sm font-semibold mb-4">Add API Key</h3>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Provider</label>
                <select value={form.provider_id} onChange={e => setForm(f => ({...f, provider_id: e.target.value}))} className="w-full bg-[#111] border border-white/10 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 appearance-none" style={{ colorScheme: "dark" }}>
                  <option value="">Select provider</option>
                  {providers.map((p: any) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Key Name</label>
                <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-3 py-2 text-sm" placeholder="My API Key" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">API Key</label>
              <input type="password" value={form.api_key} onChange={e => setForm(f => ({...f, api_key: e.target.value}))} className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-3 py-2 text-sm font-mono" placeholder="sk-..." />
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input type="checkbox" checked={form.is_default} onChange={e => setForm(f => ({...f, is_default: e.target.checked}))} className="accent-violet-500" />
                Set as default for this provider
              </label>
            </div>
            <div className="flex gap-2">
              <button onClick={() => createMutation.mutate()} disabled={!form.provider_id || !form.name || !form.api_key || createMutation.isPending} className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                {createMutation.isPending ? "Saving..." : "Save Key"}
              </button>
              <button onClick={() => setShowAdd(false)} className="border border-white/10 text-gray-400 px-4 py-2 rounded-lg text-sm transition-colors hover:border-white/20">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {apiKeys.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm">No API keys configured yet</div>
        ) : (
          apiKeys.map((key: any) => (
            <div key={key.id} className="flex items-center gap-4 p-4 border border-white/5 bg-white/[0.02] rounded-xl">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{key.name}</span>
                  {key.is_default && <span className="text-xs bg-violet-500/15 text-violet-400 px-1.5 py-0.5 rounded">Default</span>}
                  {key.provider_name && <span className="text-xs text-gray-500">{key.provider_name}</span>}
                </div>
                <code className="text-xs text-gray-400 font-mono">{key.key_hint}</code>
              </div>
              <div className="flex items-center gap-2">
                {key.is_valid === true && <CheckCircle className="w-4 h-4 text-green-400" />}
                {key.is_valid === false && <XCircle className="w-4 h-4 text-red-400" />}
                <button onClick={() => validateMutation.mutate(key.id)} className="text-xs text-gray-400 hover:text-white border border-white/10 px-2 py-1 rounded transition-colors">Validate</button>
                <button onClick={() => deleteMutation.mutate(key.id)} className="p-1.5 hover:bg-red-500/10 text-gray-400 hover:text-red-400 rounded transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
