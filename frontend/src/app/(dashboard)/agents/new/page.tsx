"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery, useMutation } from "@tanstack/react-query"
import { agentsApi, providersApi } from "@/lib/api"
import { PageHeader } from "@/components/page-header"
import { toast } from "@/components/ui/toaster"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default function NewAgentPage() {
  const router = useRouter()
  const { data: providers = [] } = useQuery({ queryKey: ["providers"], queryFn: () => providersApi.list().then(r => r.data) })
  const [selectedProvider, setSelectedProvider] = useState<number | null>(null)
  const { data: models = [] } = useQuery({
    queryKey: ["models", selectedProvider],
    queryFn: () => selectedProvider ? providersApi.getModels(selectedProvider).then(r => r.data) : Promise.resolve([]),
    enabled: !!selectedProvider,
  })
  const { data: apiKeys = [] } = useQuery({ queryKey: ["api-keys"], queryFn: () => providersApi.listKeys().then(r => r.data) })

  const [form, setForm] = useState({
    name: "", description: "", system_prompt: "", provider_id: null as number | null,
    api_key_id: null as number | null, model_id: "", temperature: 0.7, max_tokens: 2048, environment: "sandbox",
  })
  const [error, setError] = useState("")

  const createMutation = useMutation({
    mutationFn: () => agentsApi.create({ ...form, provider_id: form.provider_id || undefined, api_key_id: form.api_key_id || undefined }),
    onSuccess: (res) => { toast("Agent created!", "success"); router.push(`/agents/${res.data.id}`) },
    onError: (err: any) => setError(err.response?.data?.detail || "Failed to create agent"),
  })

  const providerKeys = apiKeys.filter((k: any) => k.provider_id === selectedProvider)

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <Link href="/agents" className="flex items-center gap-1 text-sm text-gray-400 hover:text-white mb-4"><ArrowLeft className="w-4 h-4" /> Agents</Link>
        <PageHeader title="Create Agent" description="Configure a new AI agent for testing" />
      </div>
      {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-lg mb-4">{error}</div>}
      <div className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Agent Name *</label>
          <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50" placeholder="Customer Support Agent" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Description</label>
          <input value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50" placeholder="Brief description of agent's purpose" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">System Prompt</label>
          <textarea value={form.system_prompt} onChange={e => setForm(f => ({...f, system_prompt: e.target.value}))} rows={4} className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 resize-none" placeholder="You are a helpful assistant..." />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Provider</label>
            <select value={selectedProvider || ""} onChange={e => { const v = Number(e.target.value); setSelectedProvider(v || null); setForm(f => ({...f, provider_id: v || null, model_id: ""})) }} className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50">
              <option value="">Select provider</option>
              {providers.map((p: any) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">API Key</label>
            <select value={form.api_key_id || ""} onChange={e => setForm(f => ({...f, api_key_id: Number(e.target.value) || null}))} className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50">
              <option value="">Select key</option>
              {providerKeys.map((k: any) => <option key={k.id} value={k.id}>{k.name} ({k.key_hint})</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Model</label>
          <select value={form.model_id} onChange={e => setForm(f => ({...f, model_id: e.target.value}))} className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50">
            <option value="">Select model</option>
            {(models as any[]).map((m: any) => <option key={m.id} value={m.id}>{m.name || m.id}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Temperature: {form.temperature}</label>
            <input type="range" min="0" max="1" step="0.1" value={form.temperature} onChange={e => setForm(f => ({...f, temperature: Number(e.target.value)}))} className="w-full accent-violet-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Max Tokens</label>
            <input type="number" value={form.max_tokens} onChange={e => setForm(f => ({...f, max_tokens: Number(e.target.value)}))} className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Environment</label>
          <select value={form.environment} onChange={e => setForm(f => ({...f, environment: e.target.value}))} className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50">
            <option value="sandbox">Sandbox (Safe — Mock all tools)</option>
            <option value="staging">Staging (Caution — Semi-live)</option>
            <option value="production">Production (Danger — Live tools)</option>
          </select>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={() => createMutation.mutate()} disabled={!form.name || createMutation.isPending} className="flex-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white py-2.5 rounded-lg font-medium text-sm transition-colors">
            {createMutation.isPending ? "Creating..." : "Create Agent"}
          </button>
          <Link href="/agents" className="px-6 py-2.5 border border-white/10 hover:border-white/20 text-gray-400 rounded-lg text-sm transition-colors">Cancel</Link>
        </div>
      </div>
    </div>
  )
}
