"use client"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { adminApi } from "@/lib/api"
import { PageHeader } from "@/components/page-header"
import { LoadingPage } from "@/components/loading"
import { StatCard } from "@/components/stat-card"
import { formatDate } from "@/lib/utils"
import { Users, Bot, Play, AlertTriangle } from "lucide-react"
import { toast } from "@/components/ui/toaster"

export default function AdminPage() {
  const qc = useQueryClient()
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => adminApi.getStats().then(r => r.data),
  })
  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => adminApi.listUsers().then(r => r.data),
  })
  const toggleMutation = useMutation({
    mutationFn: (id: number) => adminApi.toggleUser(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); qc.invalidateQueries({ queryKey: ["admin-stats"] }); toast("User status updated", "info") },
    onError: (e: any) => toast(e.response?.data?.detail || "Failed", "error"),
  })

  if (statsLoading || usersLoading) return <LoadingPage />

  return (
    <div className="p-8">
      <PageHeader title="Admin Dashboard" description="Platform-wide overview and user management" />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <StatCard label="Total Users" value={stats?.total_users} icon={Users} />
        <StatCard label="Active Users" value={stats?.active_users} icon={Users} color="text-green-400" />
        <StatCard label="Total Agents" value={stats?.total_agents} icon={Bot} />
        <StatCard label="Test Runs" value={stats?.total_test_runs} icon={Play} />
        <StatCard label="Total Findings" value={stats?.total_findings} icon={AlertTriangle} />
        <StatCard label="Critical Findings" value={stats?.critical_findings} icon={AlertTriangle} color="text-red-400" />
      </div>

      <h2 className="text-sm font-semibold text-gray-300 mb-3">Users ({users.length})</h2>
      <div className="border border-white/5 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 bg-white/[0.02]">
              <th className="text-left text-xs text-gray-500 font-medium px-4 py-3 uppercase tracking-wider">User</th>
              <th className="text-left text-xs text-gray-500 font-medium px-4 py-3 uppercase tracking-wider">Role</th>
              <th className="text-left text-xs text-gray-500 font-medium px-4 py-3 uppercase tracking-wider">Status</th>
              <th className="text-left text-xs text-gray-500 font-medium px-4 py-3 uppercase tracking-wider">Joined</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u: any) => (
              <tr key={u.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-3">
                  <div className="font-medium">{u.full_name}</div>
                  <div className="text-xs text-gray-500">{u.email}</div>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${u.role === "admin" ? "bg-violet-500/15 text-violet-400" : "bg-gray-500/10 text-gray-400"}`}>{u.role}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium ${u.is_active ? "text-green-400" : "text-red-400"}`}>{u.is_active ? "Active" : "Disabled"}</span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(u.created_at)}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => toggleMutation.mutate(u.id)}
                    disabled={toggleMutation.isPending}
                    className={`text-xs px-3 py-1 rounded border transition-colors disabled:opacity-50 ${u.is_active ? "border-red-500/20 text-red-400 hover:bg-red-500/10" : "border-green-500/20 text-green-400 hover:bg-green-500/10"}`}
                  >
                    {u.is_active ? "Disable" : "Enable"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
