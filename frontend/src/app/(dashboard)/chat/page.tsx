"use client"
import { useState, useRef, useEffect, use } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth"
import {
  Send, Loader2, Shield, Plus, Trash2, MessageSquare,
  Globe, MousePointer, Keyboard, Check, X, AlertTriangle,
  Terminal, Bot, Wrench, ChevronDown, ChevronUp, Zap
} from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { formatDate } from "@/lib/utils"

interface Message {
  id?: number
  role: "user" | "assistant"
  content: string
  toolCalls?: ToolCall[]
  screenshots?: Record<string, string>
  loading?: boolean
}

interface ToolCall {
  tool: string
  input: Record<string, any>
  result: string
}

// ── Tool call icons ───────────────────────────────────────────────────────────

const TOOL_ICON: Record<string, React.ReactNode> = {
  browser_open: <Globe className="w-3.5 h-3.5" />,
  browser_read_page: <Globe className="w-3.5 h-3.5" />,
  browser_click: <MousePointer className="w-3.5 h-3.5" />,
  browser_fill: <Keyboard className="w-3.5 h-3.5" />,
  browser_press: <Keyboard className="w-3.5 h-3.5" />,
  browser_find_element: <Globe className="w-3.5 h-3.5" />,
  browser_close: <X className="w-3.5 h-3.5" />,
  create_agent: <Bot className="w-3.5 h-3.5" />,
  create_tool: <Wrench className="w-3.5 h-3.5" />,
  generate_scenarios: <Zap className="w-3.5 h-3.5" />,
  run_tests: <Zap className="w-3.5 h-3.5" />,
  list_agents: <Bot className="w-3.5 h-3.5" />,
  get_findings: <AlertTriangle className="w-3.5 h-3.5" />,
  get_dashboard_stats: <Shield className="w-3.5 h-3.5" />,
}

const TOOL_LABEL: Record<string, string> = {
  browser_open: "Open URL",
  browser_read_page: "Read Page",
  browser_click: "Click",
  browser_fill: "Fill Field",
  browser_press: "Press Key",
  browser_find_element: "Find Element",
  browser_close: "Close Browser",
  create_agent: "Create Agent",
  create_tool: "Create Tool",
  attach_tool_to_agent: "Attach Tool",
  generate_scenarios: "Generate Scenarios",
  run_tests: "Run Tests",
  list_agents: "List Agents",
  get_agent: "Get Agent",
  get_findings: "Get Findings",
  get_dashboard_stats: "Dashboard Stats",
  create_recording: "Create Recording",
}

// ── Tool call card ────────────────────────────────────────────────────────────

function ToolCallCard({ call, screenshot }: { call: ToolCall; screenshot?: string }) {
  const [open, setOpen] = useState(false)

  let result: any = {}
  let isOk = true
  try {
    result = JSON.parse(call.result)
    isOk = result.success !== false && !result.error
  } catch {
    isOk = false
  }

  const isBrowser = call.tool.startsWith("browser_")
  const label = TOOL_LABEL[call.tool] || call.tool
  const icon = TOOL_ICON[call.tool] || <Terminal className="w-3.5 h-3.5" />

  // Key details to show inline
  let summary = ""
  if (call.tool === "browser_open" || call.tool === "browser_read_page") {
    summary = result.title ? `"${result.title}" — ${result.url}` : result.url || result.error || ""
  } else if (call.tool === "browser_click") {
    summary = `"${call.input.selector}"` + (result.url ? ` → ${result.url}` : "")
  } else if (call.tool === "browser_fill") {
    summary = `${call.input.selector} = ${call.input.value?.startsWith("••") ? "••••••••" : call.input.value}`
  } else if (call.tool === "browser_press") {
    summary = `${call.input.key}` + (result.url ? ` → ${result.url}` : "")
  } else if (call.tool === "create_agent") {
    summary = result.name ? `Agent "${result.name}" (ID: ${result.agent_id})` : result.error || ""
  } else if (call.tool === "create_tool") {
    summary = result.name ? `${result.name} [${result.risk_level}]` : result.error || ""
  } else if (call.tool === "run_tests") {
    summary = result.run_id ? `Run #${result.run_id}: ${result.passed}✓ ${result.failed}✗ / ${result.total}` : result.error || ""
  } else if (call.tool === "generate_scenarios") {
    summary = result.generated ? `${result.generated} scenarios generated` : result.error || ""
  }

  return (
    <div className="border border-white/8 rounded-lg overflow-hidden text-xs mb-1.5">
      {/* Header row */}
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 w-full px-3 py-2 bg-white/[0.03] hover:bg-white/[0.05] transition-colors text-left"
      >
        <span className={isOk ? "text-green-400" : "text-red-400"}>{icon}</span>
        <span className="font-medium text-gray-300">{label}</span>
        {summary && <span className="text-gray-500 truncate flex-1">{summary}</span>}
        <span className={`ml-auto flex-shrink-0 ${isOk ? "text-green-400" : "text-red-400"}`}>
          {result.error ? <X className="w-3 h-3" /> : <Check className="w-3 h-3" />}
        </span>
        {open ? <ChevronUp className="w-3 h-3 text-gray-600 flex-shrink-0" /> : <ChevronDown className="w-3 h-3 text-gray-600 flex-shrink-0" />}
      </button>

      {/* Expanded details */}
      {open && (
        <div className="border-t border-white/5 bg-black/20 p-3 space-y-2">
          {/* Screenshot if browser tool */}
          {screenshot && (
            <div>
              <p className="text-gray-600 text-[10px] uppercase tracking-wider mb-1">Screenshot</p>
              <img
                src={`data:image/jpeg;base64,${screenshot}`}
                alt="Browser state"
                className="w-full rounded border border-white/10"
                style={{ maxHeight: 200, objectFit: "contain", background: "#000" }}
              />
            </div>
          )}

          {/* Input */}
          <div>
            <p className="text-gray-600 text-[10px] uppercase tracking-wider mb-0.5">Input</p>
            <pre className="text-[11px] text-gray-400 font-mono overflow-x-auto leading-relaxed">
              {JSON.stringify(call.input, null, 2)}
            </pre>
          </div>

          {/* Result (filtered) */}
          <div>
            <p className="text-gray-600 text-[10px] uppercase tracking-wider mb-0.5">Result</p>
            {result.error ? (
              <p className="text-red-400 text-[11px]">{result.error}</p>
            ) : (
              <pre className="text-[11px] text-gray-400 font-mono overflow-x-auto leading-relaxed">
                {JSON.stringify(
                  Object.fromEntries(
                    Object.entries(result)
                      .filter(([k]) => k !== "screenshot_b64" && k !== "visible_text")
                      .map(([k, v]) => [k, typeof v === "string" && v.length > 200 ? v.substring(0, 200) + "…" : v])
                  ),
                  null, 2
                )}
              </pre>
            )}
          </div>

          {/* Visible text (browser only) */}
          {result.visible_text && (
            <div>
              <p className="text-gray-600 text-[10px] uppercase tracking-wider mb-0.5">Page Text</p>
              <p className="text-[11px] text-gray-400 leading-relaxed line-clamp-4">{result.visible_text}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end mb-5">
        <div className="max-w-[72%] bg-black text-white px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm leading-relaxed">
          {msg.content}
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-3 mb-5">
      <div className="w-7 h-7 rounded-full bg-black flex items-center justify-center flex-shrink-0 mt-0.5">
        <Shield className="w-3.5 h-3.5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        {msg.loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-400 py-1">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Working…</span>
          </div>
        ) : (
          <>
            {/* Tool calls */}
            {(msg.toolCalls || []).length > 0 && (
              <div className="mb-3">
                {msg.toolCalls!.map((tc, i) => (
                  <ToolCallCard
                    key={i}
                    call={tc}
                    screenshot={msg.screenshots?.[tc.input?.session_id ?? ""]}
                  />
                ))}
              </div>
            )}
            {/* Response text */}
            {msg.content && (
              <div className="prose prose-sm max-w-none text-gray-900
                prose-headings:text-black prose-headings:font-semibold
                prose-p:text-gray-800 prose-p:leading-relaxed
                prose-code:bg-black/8 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-[11px] prose-code:font-mono prose-code:text-gray-800
                prose-pre:bg-gray-100 prose-pre:text-xs prose-pre:overflow-x-auto
                prose-ul:text-gray-800 prose-ol:text-gray-800
                prose-li:text-gray-800 prose-li:my-0.5
                prose-a:text-violet-600 prose-a:no-underline hover:prose-a:underline
                prose-strong:text-black prose-strong:font-semibold
                [&>table]:w-full [&>table]:border-collapse [&>table]:text-xs [&>table]:my-2 [&>table]:overflow-x-auto [&>table]:block
                [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs
                [&_th]:bg-gray-100 [&_th]:px-3 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold [&_th]:text-gray-700 [&_th]:border [&_th]:border-gray-200
                [&_td]:px-3 [&_td]:py-1.5 [&_td]:border [&_td]:border-gray-100 [&_td]:text-gray-700 [&_td]:align-top
                [&_tr:nth-child(even)_td]:bg-gray-50/50
                [&_tr:hover_td]:bg-violet-50/30">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Main chat page ────────────────────────────────────────────────────────────

export default function ChatPage() {
  const user = useAuthStore(s => s.user)
  const qc = useQueryClient()
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { data: sessions = [] } = useQuery({
    queryKey: ["chat-sessions"],
    queryFn: () => api.get("/chat/sessions").then(r => r.data),
  })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages.length])

  const loadSession = async (id: number) => {
    const data = await api.get(`/chat/sessions/${id}`).then(r => r.data)
    setSessionId(id)
    setMessages(data.messages.map((m: any) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      toolCalls: m.tool_calls || [],
    })))
  }

  const deleteSessionMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/chat/sessions/${id}`),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["chat-sessions"] })
      if (sessionId === id) { setSessionId(null); setMessages([]) }
    },
  })

  const chatMutation = useMutation({
    mutationFn: (payload: { messages: { role: string; content: string }[]; session_id: number | null }) =>
      api.post("/chat", payload).then(r => r.data),
    onSuccess: (data) => {
      if (data.session_id && !sessionId) {
        setSessionId(data.session_id)
        qc.invalidateQueries({ queryKey: ["chat-sessions"] })
      }
      qc.invalidateQueries({ queryKey: ["chat-sessions"] })
    },
  })

  const send = async (text?: string) => {
    const userText = (text || input).trim()
    if (!userText) return
    setInput("")

    const userMsg: Message = { role: "user", content: userText }
    const loadingMsg: Message = { role: "assistant", content: "", loading: true }
    setMessages(prev => [...prev, userMsg, loadingMsg])

    const history = [...messages.filter(m => !m.loading), userMsg].map(m => ({
      role: m.role, content: m.content,
    }))

    try {
      const result = await chatMutation.mutateAsync({ messages: history, session_id: sessionId })
      setMessages(prev => prev.map(m =>
        m.loading ? {
          ...m,
          content: result.response,
          toolCalls: result.tool_calls || [],
          screenshots: result.screenshots || {},
          loading: false,
        } : m
      ))
    } catch (e: any) {
      setMessages(prev => prev.map(m =>
        m.loading ? { ...m, content: `Error: ${e.response?.data?.detail || e.message}`, loading: false } : m
      ))
    }
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() }
  }

  // Group sessions by date
  const today = new Date().toDateString()
  const yesterday = new Date(Date.now() - 86400000).toDateString()
  const grouped: Record<string, any[]> = {}
  for (const s of sessions as any[]) {
    const d = new Date(s.updated_at || s.created_at).toDateString()
    const label = d === today ? "Today" : d === yesterday ? "Yesterday" : d
    if (!grouped[label]) grouped[label] = []
    grouped[label].push(s)
  }

  return (
    <div className="flex h-screen bg-white overflow-hidden">
      {/* Sidebar */}
      <div className="w-56 flex-shrink-0 border-r border-black/10 flex flex-col bg-gray-50">
        <div className="p-3 border-b border-black/10">
          <button
            onClick={() => { setSessionId(null); setMessages([]) }}
            className="flex items-center gap-2 w-full text-sm font-medium bg-black text-white px-3 py-2 rounded-lg hover:bg-black/80 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {(sessions as any[]).length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6 px-3">No conversations yet</p>
          ) : (
            Object.entries(grouped).map(([label, group]) => (
              <div key={label}>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider px-3 py-1 mt-1">{label}</p>
                {group.map((s: any) => (
                  <div key={s.id} className={`group flex items-center gap-1 px-2 py-1 mx-1 rounded-lg cursor-pointer transition-colors ${sessionId === s.id ? "bg-black/8" : "hover:bg-black/5"}`}>
                    <button onClick={() => loadSession(s.id)} className="flex-1 text-left min-w-0 py-0.5">
                      <div className="text-xs font-medium text-gray-800 truncate">{s.title}</div>
                      <div className="text-[10px] text-gray-400">{s.message_count} msg</div>
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); deleteSessionMutation.mutate(s.id) }}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 hover:text-red-500 rounded transition-all text-gray-300 flex-shrink-0"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
        <div className="p-3 border-t border-black/10">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-black flex items-center justify-center text-xs text-white font-bold flex-shrink-0">
              {user?.full_name?.charAt(0).toUpperCase()}
            </div>
            <span className="text-xs text-gray-600 truncate">{user?.full_name}</span>
          </div>
        </div>
      </div>

      {/* Main chat */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex-shrink-0 border-b border-black/10 px-5 h-12 flex items-center gap-2.5 bg-white">
          <div className="w-6 h-6 bg-black rounded-full flex items-center justify-center">
            <Shield className="w-3 h-3 text-white" />
          </div>
          <span className="font-semibold text-black text-sm">HASTRA Assistant</span>
          <span className="text-xs text-gray-400 border border-gray-200 px-1.5 py-0.5 rounded-full ml-1">
            Bedrock · Claude · Browser
          </span>
          {sessionId && <span className="text-xs text-gray-300 ml-auto">Session #{sessionId}</span>}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-5 py-5">
            {messages.length === 0 && (
              <div className="text-center pt-12 pb-8">
                <div className="w-12 h-12 bg-black rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Shield className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-xl font-bold text-black mb-2">HASTRA Assistant</h2>
                <p className="text-sm text-gray-500 max-w-md mx-auto">
                  I can browse websites, test login flows, create agents, run test suites, and analyze results.
                  I execute real actions — not simulations.
                </p>
                <div className="grid grid-cols-1 gap-1.5 mt-6 text-left text-xs text-gray-500 border border-black/5 rounded-xl p-4">
                  <p className="font-medium text-gray-400 mb-1">What I can do:</p>
                  <p>• Browse any URL and inspect the page</p>
                  <p>• Test login flows and form interactions</p>
                  <p>• Create agents, attach tools, run test suites</p>
                  <p>• Generate security and reliability scenarios</p>
                  <p>• Read and summarize website content</p>
                </div>
              </div>
            )}
            {messages.map((msg, i) => <MessageBubble key={msg.id ?? i} msg={msg} />)}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input */}
        <div className="flex-shrink-0 border-t border-black/10 bg-white px-5 py-3">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-end gap-2.5 border border-black/15 rounded-2xl bg-white px-4 py-2.5 focus-within:border-black/40 transition-colors shadow-sm">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Ask HASTRA to test a website, create an agent, run tests…"
                rows={1}
                className="flex-1 resize-none outline-none text-sm text-black placeholder-gray-400 leading-relaxed max-h-36 overflow-y-auto bg-transparent"
                style={{ height: "auto", minHeight: "22px" }}
                onInput={e => {
                  const el = e.target as HTMLTextAreaElement
                  el.style.height = "auto"
                  el.style.height = Math.min(el.scrollHeight, 144) + "px"
                }}
              />
              <button
                onClick={() => send()}
                disabled={!input.trim() || chatMutation.isPending}
                className="w-7 h-7 flex-shrink-0 bg-black disabled:bg-black/20 text-white rounded-full flex items-center justify-center transition-colors hover:bg-black/80"
              >
                {chatMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3 h-3" />}
              </button>
            </div>
            <p className="text-center text-[10px] text-gray-400 mt-1.5">
              Actions execute in real Playwright browser sessions — not simulations
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
