"use client"
import { useAuthStore } from "@/store/auth"
import { PageHeader } from "@/components/page-header"
import Link from "next/link"
import { Server, Wrench, Zap, User } from "lucide-react"

export default function SettingsPage() {
  const user = useAuthStore(s => s.user)
  return (
    <div className="p-8 max-w-2xl">
      <PageHeader title="Settings" description="Platform configuration and account settings" />
      <div className="space-y-3">
        <Link href="/providers" className="flex items-center gap-4 p-4 border border-white/5 bg-white/[0.02] rounded-xl hover:border-white/10 transition-colors">
          <div className="w-10 h-10 bg-violet-500/10 rounded-lg flex items-center justify-center"><Server className="w-5 h-5 text-violet-400" /></div>
          <div className="flex-1"><div className="font-medium text-sm">LLM Providers & API Keys</div><div className="text-xs text-gray-500">Manage OpenRouter, Anthropic, OpenAI, Bedrock, Gemini, Ollama</div></div>
          <span className="text-gray-600 text-xs">→</span>
        </Link>
        <Link href="/tools" className="flex items-center gap-4 p-4 border border-white/5 bg-white/[0.02] rounded-xl hover:border-white/10 transition-colors">
          <div className="w-10 h-10 bg-violet-500/10 rounded-lg flex items-center justify-center"><Wrench className="w-5 h-5 text-violet-400" /></div>
          <div className="flex-1"><div className="font-medium text-sm">Agent Tools</div><div className="text-xs text-gray-500">Configure tools, risk levels, and execution modes</div></div>
          <span className="text-gray-600 text-xs">→</span>
        </Link>
        <Link href="/mcp" className="flex items-center gap-4 p-4 border border-white/5 bg-white/[0.02] rounded-xl hover:border-white/10 transition-colors">
          <div className="w-10 h-10 bg-violet-500/10 rounded-lg flex items-center justify-center"><Zap className="w-5 h-5 text-violet-400" /></div>
          <div className="flex-1"><div className="font-medium text-sm">MCP Servers</div><div className="text-xs text-gray-500">Connect Model Context Protocol servers for browser automation</div></div>
          <span className="text-gray-600 text-xs">→</span>
        </Link>
        <div className="flex items-center gap-4 p-4 border border-white/5 bg-white/[0.02] rounded-xl">
          <div className="w-10 h-10 bg-violet-500/10 rounded-lg flex items-center justify-center"><User className="w-5 h-5 text-violet-400" /></div>
          <div className="flex-1">
            <div className="font-medium text-sm">{user?.full_name}</div>
            <div className="text-xs text-gray-500">{user?.email}</div>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded ${user?.role === "admin" ? "bg-violet-500/15 text-violet-400" : "bg-gray-500/10 text-gray-400"}`}>{user?.role}</span>
        </div>
      </div>
    </div>
  )
}
