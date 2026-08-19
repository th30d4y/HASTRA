"use client"
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useAuthStore } from "@/store/auth"
import {
  Shield, LayoutDashboard, Bot, Video, FlaskConical,
  Play, AlertTriangle, FileText, Settings, ChevronRight,
  LogOut, Users, Zap, Server, Wrench, GitBranch, BarChart3, MessageSquare
} from "lucide-react"

const NAV_ITEMS = [
  { href: "/chat", label: "AI Assistant", icon: MessageSquare },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/recorder", label: "Recorder", icon: Video },
  { href: "/scenarios", label: "Scenarios", icon: FlaskConical },
  { href: "/test-runs", label: "Test Runs", icon: Play },
  { href: "/findings", label: "Findings", icon: AlertTriangle },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/providers", label: "Providers", icon: Server },
  { href: "/tools", label: "Tools", icon: Wrench },
  { href: "/mcp", label: "MCP Servers", icon: Zap },
  { href: "/settings", label: "Settings", icon: Settings },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, clearAuth } = useAuthStore()

  useEffect(() => {
    if (!user) router.push("/login")
  }, [user, router])

  if (!user) return null

  const handleLogout = () => {
    clearAuth()
    router.push("/login")
  }

  return (
    <div className="flex h-screen bg-[#030303] text-white overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 border-r border-white/5 bg-black/40 flex flex-col">
        <div className="h-14 flex items-center gap-2 px-4 border-b border-white/5">
          <Shield className="w-5 h-5 text-violet-400" />
          <span className="font-bold text-sm tracking-tight">HASTRA</span>
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm mb-0.5 transition-colors ${active ? "bg-violet-500/15 text-violet-300 font-medium" : "text-gray-400 hover:text-white hover:bg-white/5"}`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {item.label}
              </Link>
            )
          })}
          {user.role === "admin" && (
            <Link href="/admin" className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm mb-0.5 transition-colors mt-2 border-t border-white/5 pt-3 ${pathname.startsWith("/admin") ? "bg-violet-500/15 text-violet-300 font-medium" : "text-gray-400 hover:text-white hover:bg-white/5"}`}>
              <Users className="w-4 h-4 flex-shrink-0" />
              Admin
            </Link>
          )}
        </nav>
        <div className="px-4 py-3 border-t border-white/5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-full bg-violet-500/20 flex items-center justify-center text-xs font-bold text-violet-400">
              {user.full_name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate">{user.full_name}</div>
              <div className="text-xs text-gray-500 truncate">{user.role}</div>
            </div>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-2 text-xs text-gray-400 hover:text-red-400 transition-colors w-full">
            <LogOut className="w-3 h-3" /> Sign out
          </button>
        </div>
      </aside>
      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
