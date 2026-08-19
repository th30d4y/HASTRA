"use client"
import { useQuery } from "@tanstack/react-query"
import { testRunsApi } from "@/lib/api"
import { PageHeader } from "@/components/page-header"
import { LoadingPage, EmptyState } from "@/components/loading"
import { StatusBadge, SeverityBadge } from "@/components/severity-badge"
import { formatDate, scoreColor } from "@/lib/utils"
import Link from "next/link"
import { Shield, Zap, AlertTriangle } from "lucide-react"

export default function TestRunsPage() {
  const { data: runs = [], isLoading } = useQuery({ queryKey: ["runs"], queryFn: () => testRunsApi.list().then(r => r.data) })
  if (isLoading) return <LoadingPage />
  return (
    <div className="p-8">
      <PageHeader title="Test Runs" description="History of all test executions" />
      {runs.length === 0 ? (
        <EmptyState title="No test runs yet" description="Open an agent and run its test suite." />
      ) : (
        <div className="border border-white/5 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-white/5 bg-white/[0.02]">
              <th className="text-left text-xs text-gray-500 font-medium px-4 py-3 uppercase tracking-wider">Run</th>
              <th className="text-left text-xs text-gray-500 font-medium px-4 py-3 uppercase tracking-wider">Results</th>
              <th className="text-left text-xs text-gray-500 font-medium px-4 py-3 uppercase tracking-wider">Reliability</th>
              <th className="text-left text-xs text-gray-500 font-medium px-4 py-3 uppercase tracking-wider">Security</th>
              <th className="text-left text-xs text-gray-500 font-medium px-4 py-3 uppercase tracking-wider">Findings</th>
              <th className="text-left text-xs text-gray-500 font-medium px-4 py-3 uppercase tracking-wider">Status</th>
              <th className="text-left text-xs text-gray-500 font-medium px-4 py-3 uppercase tracking-wider">Date</th>
            </tr></thead>
            <tbody>
              {runs.map((run: any) => (
                <tr key={run.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/test-runs/${run.id}`} className="font-medium hover:text-violet-400 transition-colors">{run.name}</Link>
                    {run.agent_id && <div className="text-xs text-gray-500">Agent #{run.agent_id}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-green-400">{run.passed}</span>
                    <span className="text-gray-600 mx-1">/</span>
                    <span className="text-red-400">{run.failed}</span>
                    <span className="text-gray-600 mx-1">/</span>
                    <span className="text-gray-400">{run.total_scenarios}</span>
                  </td>
                  <td className="px-4 py-3">
                    {run.reliability_score !== null ? <span className={`font-bold ${scoreColor(run.reliability_score)}`}>{run.reliability_score}%</span> : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {run.security_score !== null ? <span className={`font-bold ${scoreColor(run.security_score)}`}>{run.security_score}%</span> : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {run.critical_findings > 0 && <span className="text-xs text-red-400 font-bold">C:{run.critical_findings}</span>}
                      {run.high_findings > 0 && <span className="text-xs text-orange-400 font-bold">H:{run.high_findings}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={run.status} /></td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(run.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
