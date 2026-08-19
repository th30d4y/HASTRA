"use client"
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { adminApi } from "@/lib/api"
import { api } from "@/lib/api"
import { PageHeader } from "@/components/page-header"
import { LoadingPage } from "@/components/loading"
import { StatCard } from "@/components/stat-card"
import { formatDate } from "@/lib/utils"
import { Users, Bot, Play, AlertTriangle, FileText, ChevronDown, ChevronRight, Filter } from "lucide-react"
import { toast } from "@/components/ui/toaster"

function LogRow({ log }: { log: any }) {
  const [open, setOpen] = useState(false)
  const actionColor: Record<string, string> = {
    LOGIN_SUCCESS: "text-green-400", LOGIN_FAILURE: "text-red-400",
    AGENT_CREATED: "text-blue-400", AGENT_DELETED: "text-red-400",
    TEST_STARTED: "text-yellow-400", TEST_COMPLETED: "text-green-400",
    TEST_FAILED: "text-red-400",
  }
  const color = actionColor[log.action] || "text-gray-400"

  return (
    <div className="border-b border-white/5 hover:bg-white/[0.01] transition-colors">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center gap-4 px-4 py-2.5 text-left">
        <span className={`text-xs font-mono font-medium w-36 flex-shrink-0 ${color}`}>{log.action}</span>
        <span className="text-xs text-gray-500 w-20 flex-shrink-0">{log.resource_type || "—"}</span>
        <span className="text-xs text-gray-400 flex-1 truncate">{log.details ? JSON.stringify(log.details).substring(0, 60) : "—"}</span>
        <span className="text-xs text-gray-600 flex-shrink-0">{formatDate(log.created_at)}</span>
        {log.details && (open ? <ChevronDown className="w-3 h-3 text-gray-600 flex-shrink-0" /> : <ChevronRight className="w-3 h-3 text-gray-600 flex-shrink-0" />)}
      </button>
      {open && log.details && (
        <div className="px-4 pb-3 ml-40">
          <pre className="text-[11px] text-gray-400 font-mono bg-black/20 rounded p-2 overflow-x-auto">
            {JSON.stringify(log.details, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

export default function AdminPage() {
  const qc = useQueryClient()
  const [logAction, setLogAction] = useState("")
  const [logPage, setLogPage] = useState(1)

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => adminApi.getStats().then(r => r.data),
  })
  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => adminApi.listUsers().then(r => r.data),
  })
  const { data: logsData, isLoading: logsLoading } = useQuery({
    queryKey: ["admin-logs", logAction, logPage],
    queryFn: () => api.get("/admin/logs", { params: { action: logAction || undefined, page: logPage, per_page: 50 } }).then(r => r.data),
  })

  const toggleMutation = useMutation({
    mutationFn: (id: number) => adminApi.toggleUser(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); qc.invalidateQueries({ queryKey: ["admin-stats"] }); toast("User updated", "info") },
    onError: (e: any) => toast(e.response?.data?.detail || "Failed", "error"),
  })

  if (statsLoading || usersLoading) return <LoadingPage />

  const logs = logsData?.logs || []
  const totalLogs = logsData?.total || 0

  return (
    <div className="p-8">
      <PageHeader title="Admin Dashboard" description="Platform overview, user management, and audit logs" />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Users" value={stats?.total_users} icon={Users} />
        <StatCard label="Active Users" value={stats?.active_users} icon={Users} color="text-green-400" />
        <StatCard label="Total Agents" value={stats?.total_agents} icon={Bot} />
        <StatCard label="Test Runs" value={stats?.total_test_runs} icon={Play} />
        <StatCard label="Scenarios" value={stats?.total_scenarios} icon={FileText} />
        <StatCard label="Recordings" value={stats?.total_recordings} icon={Play} />
        <StatCard label="Total Findings" value={stats?.total_findings} icon={AlertTriangle} />
        <StatCard label="Critical" value={stats?.critical_findings} icon={AlertTriangle} color="text-red-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Users */}
        <div>
          <h2 className="text-sm font-semibold text-gray-300 mb-3">Users ({users.length})</h2>
          <div className="border border-white/5 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-white/5 bg-white/[0.02]">
                <th className="text-left text-xs text-gray-500 font-medium px-4 py-2">User</th>
                <th className="text-left text-xs text-gray-500 font-medium px-4 py-2">Role</th>
                <th className="text-left text-xs text-gray-500 font-medium px-4 py-2">Status</th>
                <th className="px-4 py-2"></th>
              </tr></thead>
              <tbody>
                {users.map((u: any) => (
                  <tr key={u.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="px-4 py-2.5">
                      <div className="text-sm font-medium">{u.full_name}</div>
                      <div className="text-xs text-gray-500">{u.email}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded ${u.role === "admin" ? "bg-violet-500/15 text-violet-400" : "bg-gray-500/10 text-gray-400"}`}>{u.role}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-medium ${u.is_active ? "text-green-400" : "text-red-400"}`}>{u.is_active ? "Active" : "Disabled"}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => toggleMutation.mutate(u.id)} disabled={toggleMutation.isPending}
                        className={`text-xs px-2 py-1 rounded border transition-colors disabled:opacity-50 ${u.is_active ? "border-red-500/20 text-red-400 hover:bg-red-500/10" : "border-green-500/20 text-green-400 hover:bg-green-500/10"}`}>
                        {u.is_active ? "Disable" : "Enable"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Audit summary */}
        <div>
          <h2 className="text-sm font-semibold text-gray-300 mb-3">Recent Audit Events</h2>
          <div className="border border-white/5 rounded-xl overflow-hidden">
            {logs.slice(0, 8).map((log: any) => (
              <LogRow key={log.id} log={log} />
            ))}
            {logs.length === 0 && (
              <div className="text-center py-6 text-gray-600 text-xs">No audit events yet</div>
            )}
          </div>
        </div>
      </div>

      {/* Full audit log */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-300">Audit Log ({totalLogs} total)</h2>
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-gray-500" />
            <input
              value={logAction}
              onChange={e => { setLogAction(e.target.value); setLogPage(1) }}
              className="bg-white/5 border border-white/10 text-white rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-violet-500/50 w-40"
              placeholder="Filter by action…"
            />
          </div>
        </div>
        <div className="border border-white/5 rounded-xl overflow-hidden">
          <div className="flex items-center gap-4 px-4 py-2 border-b border-white/5 bg-white/[0.02]">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider w-36">Action</span>
            <span className="text-[10px] text-gray-500 uppercase tracking-wider w-20">Resource</span>
            <span className="text-[10px] text-gray-500 uppercase tracking-wider flex-1">Details</span>
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">Time</span>
          </div>
          {logsLoading ? (
            <div className="text-center py-6 text-gray-600 text-xs">Loading…</div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-gray-600 text-xs">No audit events{logAction ? ` matching "${logAction}"` : " yet"}</div>
          ) : (
            logs.map((log: any) => <LogRow key={log.id} log={log} />)
          )}
        </div>
        {totalLogs > 50 && (
          <div className="flex items-center justify-between mt-3">
            <button onClick={() => setLogPage(p => Math.max(1, p - 1))} disabled={logPage === 1}
              className="text-xs border border-white/10 text-gray-400 px-3 py-1.5 rounded-lg disabled:opacity-50 hover:border-white/20 transition-colors">← Prev</button>
            <span className="text-xs text-gray-500">Page {logPage} of {Math.ceil(totalLogs / 50)}</span>
            <button onClick={() => setLogPage(p => p + 1)} disabled={logPage >= Math.ceil(totalLogs / 50)}
              className="text-xs border border-white/10 text-gray-400 px-3 py-1.5 rounded-lg disabled:opacity-50 hover:border-white/20 transition-colors">Next →</button>
          </div>
        )}
      </div>
    </div>
  )
}
