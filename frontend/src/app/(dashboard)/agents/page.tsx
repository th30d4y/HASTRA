"use client"
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { agentsApi } from "@/lib/api"
import { PageHeader } from "@/components/page-header"
import { LoadingPage, EmptyState } from "@/components/loading"
import { formatDate, scoreColor } from "@/lib/utils"
import { Bot, Plus, Trash2, ExternalLink, Shield, Zap } from "lucide-react"
import Link from "next/link"
import { toast } from "@/components/ui/toaster"

export default function AgentsPage() {
  const qc = useQueryClient()
  const { data: agents = [], isLoading } = useQuery({ queryKey: ["agents"], queryFn: () => agentsApi.list().then(r => r.data) })
  const deleteMutation = useMutation({
    mutationFn: (id: number) => agentsApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["agents"] }); toast("Agent deleted", "info") },
  })

  if (isLoading) return <LoadingPage />

  return (
    <div className="p-8">
      <PageHeader
        title="Agents"
        description="Manage your AI agents and test configurations"
        action={
          <Link href="/agents/new" className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" /> New Agent
          </Link>
        }
      />
      {agents.length === 0 ? (
        <EmptyState title="No agents yet" description="Create your first AI agent to get started with testing." action={<Link href="/agents/new" className="text-violet-400 hover:text-violet-300 text-sm">Create Agent →</Link>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent: any) => (
            <div key={agent.id} className="border border-white/5 bg-white/[0.02] rounded-xl p-5 hover:border-white/10 transition-colors group">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 bg-violet-500/10 rounded-lg flex items-center justify-center">
                  <Bot className="w-5 h-5 text-violet-400" />
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Link href={`/agents/${agent.id}`} className="p-1.5 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors"><ExternalLink className="w-3.5 h-3.5" /></Link>
                  <button onClick={() => deleteMutation.mutate(agent.id)} className="p-1.5 hover:bg-red-500/10 rounded text-gray-400 hover:text-red-400 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <h3 className="font-semibold mb-1">{agent.name}</h3>
              {agent.description && <p className="text-xs text-gray-500 mb-3 line-clamp-2">{agent.description}</p>}
              <div className="space-y-1.5 text-xs text-gray-400">
                {agent.model_id && <div className="flex items-center gap-1"><Zap className="w-3 h-3" />{agent.model_id}</div>}
                <div className="flex gap-3">
                  <span>Tools: {agent.tool_count}</span>
                  <span>MCP: {agent.mcp_count}</span>
                  <span>v{agent.current_version}</span>
                </div>
              </div>
              {(agent.reliability_score || agent.security_score) && (
                <div className="flex gap-4 mt-3 pt-3 border-t border-white/5">
                  {agent.reliability_score !== null && (
                    <div className="text-center">
                      <div className={`text-sm font-bold ${scoreColor(agent.reliability_score)}`}>{agent.reliability_score}%</div>
                      <div className="text-xs text-gray-600">Reliability</div>
                    </div>
                  )}
                  {agent.security_score !== null && (
                    <div className="text-center">
                      <div className={`text-sm font-bold ${scoreColor(agent.security_score)}`}>{agent.security_score}%</div>
                      <div className="text-xs text-gray-600">Security</div>
                    </div>
                  )}
                </div>
              )}
              <div className="mt-3">
                <Link href={`/agents/${agent.id}`} className="block w-full text-center text-xs bg-white/5 hover:bg-white/10 text-gray-300 py-1.5 rounded-md transition-colors">Open →</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
