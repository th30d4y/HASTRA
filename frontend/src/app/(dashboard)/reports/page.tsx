"use client"
import { useQuery } from "@tanstack/react-query"
import { reportsApi } from "@/lib/api"
import { PageHeader } from "@/components/page-header"
import { LoadingPage, EmptyState } from "@/components/loading"
import { formatDate } from "@/lib/utils"
import Link from "next/link"
import { FileText, ExternalLink } from "lucide-react"

export default function ReportsPage() {
  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["reports"],
    queryFn: () => reportsApi.list().then(r => r.data),
  })
  if (isLoading) return <LoadingPage />
  return (
    <div className="p-8">
      <PageHeader title="Reports" description="Generated security and reliability assessment reports" />
      {reports.length === 0 ? (
        <EmptyState title="No reports yet" description="Open a completed test run and click Generate Report." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reports.map((r: any) => (
            <Link key={r.id} href={`/reports/${r.id}`} className="border border-white/5 bg-white/[0.02] rounded-xl p-5 hover:border-white/10 transition-colors group">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 bg-violet-500/10 rounded-lg flex items-center justify-center">
                  <FileText className="w-5 h-5 text-violet-400" />
                </div>
                <ExternalLink className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors" />
              </div>
              <h3 className="font-semibold text-sm mb-2">{r.title}</h3>
              <p className="text-xs text-gray-500 line-clamp-2 mb-3">{r.summary}</p>
              <div className="text-xs text-gray-600">{formatDate(r.created_at)}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
