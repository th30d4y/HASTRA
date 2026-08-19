"use client"
import { useQuery } from "@tanstack/react-query"
import { useAuthStore } from "@/store/auth"
import { StatCard } from "@/components/stat-card"
import { SeverityBadge, StatusBadge } from "@/components/severity-badge"
import { LoadingPage } from "@/components/loading"
import { formatDate, scoreColor } from "@/lib/utils"
import { Shield, Zap, Play, AlertTriangle, BarChart3, Bot, FlaskConical, MessageSquare } from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"
import { api } from "@/lib/api"
import Link from "next/link"

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user)

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get("/dashboard").then(r => r.data),
  })

  if (isLoading) return <LoadingPage />

  const stats = data?.stats || {}
  const recentRuns = data?.recent_runs || []
  const chartData = data?.chart_data || []
  const severityDist = data?.severity_distribution || {}
  const recentFindings = data?.recent_findings || []

  const severityChartData = Object.entries(severityDist).map(([k, v]) => ({ name: k, value: v as number }))
  const SEVERITY_COLORS: Record<string, string> = {
    CRITICAL: "#ef4444", HIGH: "#f97316", MEDIUM: "#eab308", LOW: "#3b82f6",
  }

  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black">Dashboard</h1>
          <p className="text-gray-400 text-sm mt-1">Welcome back, {user?.full_name}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/chat" className="flex items-center gap-2 border border-violet-500/30 hover:border-violet-500/60 text-violet-400 px-3 py-2 rounded-lg text-sm font-medium transition-colors">
            <MessageSquare className="w-3.5 h-3.5" /> AI Assistant
          </Link>
          <Link href="/agents/new" className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors">
            <Bot className="w-3.5 h-3.5" /> New Agent
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Agents" value={stats.agents} icon={Bot} />
        <StatCard label="Test Runs" value={stats.test_runs} icon={Play} />
        <StatCard label="Scenarios" value={stats.scenarios} icon={FlaskConical} />
        <StatCard label="Pass Rate" value={stats.pass_rate} icon={BarChart3} suffix="%" isScore />
        <StatCard label="Critical Findings" value={stats.critical_findings} icon={AlertTriangle} color="text-red-400" />
        <StatCard label="High Findings" value={stats.high_findings} icon={AlertTriangle} color="text-orange-400" />
        <StatCard label="Reliability Score" value={stats.reliability_score} icon={Shield} suffix="%" isScore />
        <StatCard label="Security Score" value={stats.security_score} icon={Zap} suffix="%" isScore />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Chart */}
        <div className="lg:col-span-2 border border-white/5 bg-white/[0.02] rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Test Execution History</h2>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} barSize={8}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 11 }} />
                <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "#0a0a0a", border: "1px solid #ffffff15", borderRadius: 8 }} />
                <Bar dataKey="passed" fill="#22c55e" radius={[2, 2, 0, 0]} />
                <Bar dataKey="failed" fill="#ef4444" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex flex-col items-center justify-center text-gray-600 text-sm gap-3">
              <span>No test runs yet</span>
              <div className="flex gap-2">
                <Link href="/agents" className="text-xs text-violet-400 hover:text-violet-300 border border-violet-500/20 px-3 py-1.5 rounded-lg">Create Agent</Link>
                <Link href="/chat" className="text-xs text-gray-400 hover:text-white border border-white/10 px-3 py-1.5 rounded-lg">AI Assistant</Link>
              </div>
            </div>
          )}
        </div>

        {/* Severity Distribution */}
        <div className="border border-white/5 bg-white/[0.02] rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Findings by Severity</h2>
          {severityChartData.some(d => d.value > 0) ? (
            <>
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={severityChartData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} dataKey="value">
                    {severityChartData.map((entry) => (
                      <Cell key={entry.name} fill={SEVERITY_COLORS[entry.name] || "#6b7280"} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5">
                {severityChartData.map(d => (
                  <div key={d.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ background: SEVERITY_COLORS[d.name] }} />
                      <span className="text-gray-400">{d.name}</span>
                    </div>
                    <span className="font-medium">{d.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-32 flex items-center justify-center text-gray-600 text-sm">No findings yet</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Runs */}
        <div className="border border-white/5 bg-white/[0.02] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-300">Recent Test Runs</h2>
            <Link href="/test-runs" className="text-xs text-violet-400 hover:text-violet-300">View all</Link>
          </div>
          {recentRuns.length > 0 ? (
            <div className="space-y-2">
              {recentRuns.map((run: any) => (
                <Link key={run.id} href={`/test-runs/${run.id}`} className="flex items-center justify-between p-3 rounded-lg hover:bg-white/5 transition-colors group">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{run.name}</div>
                    <div className="text-xs text-gray-500">{run.agent_name} · {formatDate(run.created_at)}</div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                    <span className="text-xs text-gray-500">{run.passed}/{run.total_scenarios}</span>
                    <StatusBadge status={run.status} />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-600 text-sm">No test runs yet</div>
          )}
        </div>

        {/* Recent Findings */}
        <div className="border border-white/5 bg-white/[0.02] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-300">Recent Findings</h2>
            <Link href="/findings" className="text-xs text-violet-400 hover:text-violet-300">View all</Link>
          </div>
          {recentFindings.length > 0 ? (
            <div className="space-y-2">
              {recentFindings.map((f: any) => (
                <div key={f.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors">
                  <SeverityBadge severity={f.severity} />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{f.title}</div>
                    <div className="text-xs text-gray-500 line-clamp-1">{f.description}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-600 text-sm">No findings yet</div>
          )}
        </div>
      </div>
    </div>
  )
}
