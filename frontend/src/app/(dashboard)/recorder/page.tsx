"use client"
import { useState, useEffect, useRef, useCallback, use } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { agentsApi, recordingsApi } from "@/lib/api"
import { formatDate } from "@/lib/utils"
import { SeverityBadge } from "@/components/severity-badge"
import { LoadingPage, EmptyState, Spinner } from "@/components/loading"
import {
  Circle, Square, Plus, ArrowRight, Trash2,
  Globe, MousePointer, Keyboard, Navigation, Camera,
  Play, FileText, RefreshCw, Shield, AlertTriangle,
  Check, X, ChevronDown, ChevronUp, Video, Info,
  Send
} from "lucide-react"
import { toast } from "@/components/ui/toaster"
import Link from "next/link"

// ── Event type icons & colors ─────────────────────────────────────────────────

const EVENT_ICON: Record<string, React.ReactNode> = {
  navigate:   <Globe className="w-3 h-3" />,
  navigation: <Navigation className="w-3 h-3" />,
  click:      <MousePointer className="w-3 h-3" />,
  fill:       <Keyboard className="w-3 h-3" />,
  keydown:    <Keyboard className="w-3 h-3" />,
  check:      <Check className="w-3 h-3" />,
  select:     <ChevronDown className="w-3 h-3" />,
  submit:     <Send className="w-3 h-3" />,
  scroll:     <ChevronDown className="w-3 h-3" />,
  screenshot: <Camera className="w-3 h-3" />,
}

const EVENT_COLOR: Record<string, string> = {
  navigate:   "border-blue-500/30 bg-blue-500/5 text-blue-300",
  navigation: "border-blue-500/20 bg-blue-500/5 text-blue-300",
  click:      "border-orange-500/30 bg-orange-500/5 text-orange-300",
  fill:       "border-green-500/30 bg-green-500/5 text-green-300",
  keydown:    "border-yellow-500/30 bg-yellow-500/5 text-yellow-300",
  check:      "border-teal-500/30 bg-teal-500/5 text-teal-300",
  select:     "border-cyan-500/30 bg-cyan-500/5 text-cyan-300",
  submit:     "border-violet-500/30 bg-violet-500/5 text-violet-300",
  scroll:     "border-gray-500/20 bg-gray-500/5 text-gray-400",
  screenshot: "border-gray-500/20 bg-gray-500/5 text-gray-400",
}

// ── Replay Result ─────────────────────────────────────────────────────────────

function ReplayResult({ result }: { result: any }) {
  const [expanded, setExpanded] = useState<number | null>(null)
  const passed = result.passed_steps ?? 0
  const failed = result.failed_steps ?? 0
  const total = result.total_steps ?? 0
  const ok = result.status === "passed"

  return (
    <div className="border border-white/5 rounded-xl overflow-hidden">
      <div className={`flex items-center gap-3 px-4 py-3 border-b border-white/5 ${ok ? "bg-green-500/10" : "bg-red-500/10"}`}>
        {ok ? <Check className="w-4 h-4 text-green-400" /> : <X className="w-4 h-4 text-red-400" />}
        <span className={`font-semibold text-sm ${ok ? "text-green-300" : "text-red-300"}`}>
          Replay {ok ? "PASSED" : "FAILED"}
        </span>
        <span className="text-xs text-gray-400 ml-auto">{passed}/{total} steps passed</span>
        {result.duration_ms && <span className="text-xs text-gray-600">{result.duration_ms}ms</span>}
      </div>

      <div className="p-4 space-y-2">
        {/* Step list */}
        <div className="space-y-1 max-h-56 overflow-y-auto">
          {result.step_results?.map((step: any, i: number) => {
            const isOk = step.status?.startsWith("pass")
            const isFail = step.status === "fail" || step.status === "error"
            return (
              <div key={i}>
                <button
                  onClick={() => setExpanded(expanded === i ? null : i)}
                  className={`w-full flex items-center gap-2.5 text-xs px-3 py-1.5 rounded text-left transition-colors ${
                    isOk ? "bg-green-500/5 text-green-300 hover:bg-green-500/10" :
                    isFail ? "bg-red-500/5 text-red-300 hover:bg-red-500/10" :
                    "bg-white/5 text-gray-500 hover:bg-white/10"
                  }`}
                >
                  <span className="flex-shrink-0 w-4">
                    {isOk ? <Check className="w-3 h-3" /> : isFail ? <X className="w-3 h-3" /> : <span className="text-gray-600">—</span>}
                  </span>
                  <span className="text-gray-500 w-12 flex-shrink-0 capitalize">{step.event_type}</span>
                  <span className="truncate flex-1">{step.action}</span>
                  {step.error && <span className="text-red-400 truncate max-w-[140px]">{step.error}</span>}
                  {(step.screenshot || step.error) && (
                    expanded === i ? <ChevronUp className="w-3 h-3 flex-shrink-0" /> : <ChevronDown className="w-3 h-3 flex-shrink-0" />
                  )}
                </button>
                {expanded === i && (
                  <div className="ml-8 mt-1 space-y-1 p-2 bg-black/20 rounded">
                    {step.error && <p className="text-xs text-red-300 font-mono">{step.error}</p>}
                    {step.actual_url && <p className="text-xs text-gray-400">URL: <span className="text-gray-300 font-mono">{step.actual_url}</span></p>}
                    {step.screenshot && (
                      <img src={`data:image/jpeg;base64,${step.screenshot}`} alt={`Step ${i}`}
                        className="max-w-full rounded border border-white/10 mt-1" style={{maxHeight: 160}} />
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Findings */}
        {result.findings?.length > 0 && (
          <div className="border-t border-white/5 pt-3 space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Findings ({result.findings.length})</p>
            {result.findings.map((f: any, i: number) => (
              <div key={i} className="border border-red-500/20 bg-red-500/5 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                  <SeverityBadge severity={f.severity} />
                  <span className="text-sm font-medium text-red-200">{f.title}</span>
                </div>
                {f.description && <p className="text-xs text-red-200/70">{f.description}</p>}
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {f.expected && <div className="text-xs"><span className="text-green-400 font-medium">Expected:</span> <span className="text-gray-300">{f.expected}</span></div>}
                  {f.actual && <div className="text-xs"><span className="text-red-400 font-medium">Actual:</span> <span className="text-gray-300">{f.actual}</span></div>}
                </div>
                {f.recommended_fix && <p className="text-xs text-blue-300 mt-1"><span className="font-medium">Fix:</span> {f.recommended_fix}</p>}
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-between text-xs text-gray-600 pt-1">
          <span>Final URL: <span className="text-gray-400 font-mono">{result.final_url}</span></span>
        </div>
        {result.final_screenshot && (
          <img src={`data:image/jpeg;base64,${result.final_screenshot}`} alt="Final state"
            className="w-full rounded border border-white/10 mt-2" />
        )}
      </div>
    </div>
  )
}

// ── Event row ─────────────────────────────────────────────────────────────────

function EventRow({ ev, index }: { ev: any; index: number }) {
  return (
    <div className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-xs ${EVENT_COLOR[ev.event_type] || "border-white/5 bg-white/[0.02] text-gray-400"}`}>
      <span className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center bg-black/20 mt-0.5">
        {EVENT_ICON[ev.event_type] || <span className="text-[10px] font-bold">{index + 1}</span>}
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-medium capitalize">{ev.event_type}</div>
        <div className="text-gray-400 truncate leading-tight">{ev.content}</div>
        {ev.selector && <div className="text-gray-600 font-mono text-[10px] truncate">sel: {ev.selector}</div>}
      </div>
      <span className="text-gray-600 flex-shrink-0 text-[10px]">{(ev.timestamp_ms / 1000).toFixed(1)}s</span>
    </div>
  )
}

// ── Recording Detail (active session) ─────────────────────────────────────────

function RecordingSession({ recording, onBack }: { recording: any; onBack: () => void }) {
  const qc = useQueryClient()
  const [events, setEvents] = useState<any[]>([])
  const [eventIndex, setEventIndex] = useState(0)
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [status, setStatus] = useState(recording.status)
  const [replayResult, setReplayResult] = useState<any>(null)
  const [replayLoading, setReplayLoading] = useState(false)
  const [navigateUrl, setNavigateUrl] = useState("")
  const eventsEndRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<any>(null)
  const screenshotRef = useRef<any>(null)

  const isRecording = status === "recording"

  // Poll events every second while recording
  const pollEvents = useCallback(async () => {
    try {
      const res = await recordingsApi.pollEvents(recording.id, eventIndex)
      const data = res.data
      if (data.events?.length > 0) {
        setEvents(prev => [...prev, ...data.events])
        setEventIndex(data.total)
      }
      if (!data.active) {
        setStatus("completed")
        clearInterval(pollRef.current)
        clearInterval(screenshotRef.current)
        qc.invalidateQueries({ queryKey: ["recordings"] })
      }
    } catch {}
  }, [eventIndex, recording.id, qc])

  // Poll screenshot every 800ms while recording
  const pollScreenshot = useCallback(async () => {
    try {
      const res = await recordingsApi.screenshot(recording.id)
      if (res.data?.screenshot) setScreenshot(res.data.screenshot)
    } catch {}
  }, [recording.id])

  useEffect(() => {
    if (isRecording) {
      pollRef.current = setInterval(pollEvents, 1000)
      screenshotRef.current = setInterval(pollScreenshot, 800)
      pollScreenshot() // immediate first shot
    } else {
      // Load saved events from DB
      recordingsApi.get(recording.id).then(res => {
        setEvents(res.data.events || [])
        setEventIndex(res.data.events?.length || 0)
      }).catch(() => {})
    }
    return () => {
      clearInterval(pollRef.current)
      clearInterval(screenshotRef.current)
    }
  }, [isRecording]) // eslint-disable-line

  // Restart poll when eventIndex changes
  useEffect(() => {
    if (isRecording) {
      clearInterval(pollRef.current)
      pollRef.current = setInterval(pollEvents, 1000)
    }
  }, [pollEvents, isRecording])

  // Auto-scroll event list
  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [events.length])

  const stopMutation = useMutation({
    mutationFn: () => recordingsApi.stop(recording.id),
    onSuccess: (res) => {
      setStatus("completed")
      clearInterval(pollRef.current)
      clearInterval(screenshotRef.current)
      toast(`Recording stopped — ${res.data.event_count} events captured`, "success")
      qc.invalidateQueries({ queryKey: ["recordings"] })
      // Final load from DB
      recordingsApi.get(recording.id).then(r => {
        setEvents(r.data.events || [])
        setEventIndex(r.data.events?.length || 0)
      }).catch(() => {})
    },
  })

  const convertMutation = useMutation({
    mutationFn: () => recordingsApi.convertToScenario(recording.id),
    onSuccess: (res) => toast(`Scenario created: "${res.data.name}" (${res.data.step_count} steps)`, "success"),
    onError: (e: any) => toast(e.response?.data?.detail || "Conversion failed", "error"),
  })

  const handleReplay = async () => {
    setReplayLoading(true)
    setReplayResult(null)
    try {
      const res = await recordingsApi.replay(recording.id)
      setReplayResult(res.data)
    } catch (e: any) {
      toast(e.response?.data?.detail || "Replay failed", "error")
    } finally {
      setReplayLoading(false)
    }
  }

  const handleNavigate = async () => {
    const url = navigateUrl.trim()
    if (!url) return
    try {
      await recordingsApi.interact(recording.id, { type: "navigate", url })
      setNavigateUrl("")
    } catch (e: any) {
      toast(e.response?.data?.detail || "Navigation failed", "error")
    }
  }

  const handleImgClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    if (!isRecording) return
    const img = e.currentTarget
    const rect = img.getBoundingClientRect()
    // Scale click to 1280×800
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 1280)
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 800)
    try {
      await recordingsApi.interact(recording.id, { type: "click", x, y })
    } catch {}
  }

  return (
    <div className="p-6 h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 mb-4 flex-shrink-0">
        <button onClick={onBack} className="text-xs text-gray-500 hover:text-gray-300">← Recordings</button>
        <h1 className="text-lg font-bold">{recording.name}</h1>
        {recording.target_url && (
          <span className="text-xs text-gray-500 font-mono">{recording.target_url}</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {/* Status badge */}
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
            isRecording ? "bg-red-500/20 text-red-300 animate-pulse" :
            status === "completed" ? "bg-green-500/10 text-green-400" :
            "bg-gray-500/10 text-gray-400"
          }`}>
            {isRecording ? "● Recording" : status}
          </span>
          <span className="text-xs text-gray-500">{events.length} events</span>

          {isRecording && (
            <button onClick={() => stopMutation.mutate()} disabled={stopMutation.isPending}
              className="flex items-center gap-1.5 bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50">
              <Square className="w-3 h-3 fill-white" />{stopMutation.isPending ? "Stopping..." : "Stop"}
            </button>
          )}
          {status === "completed" && events.length > 0 && (
            <>
              <button onClick={handleReplay} disabled={replayLoading}
                className="flex items-center gap-1.5 border border-violet-500/30 hover:border-violet-500/60 text-violet-400 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50">
                {replayLoading ? <Spinner size="sm" /> : <RefreshCw className="w-3 h-3" />}
                {replayLoading ? "Replaying..." : "Replay"}
              </button>
              <button onClick={() => convertMutation.mutate()} disabled={convertMutation.isPending}
                className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors">
                <FileText className="w-3 h-3" />{convertMutation.isPending ? "Saving..." : "Save as Scenario"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main layout */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Left: Browser view */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="border border-white/10 rounded-xl overflow-hidden flex flex-col flex-1 bg-black/30">
            {/* Browser chrome */}
            <div className="flex items-center gap-2 px-3 py-2 bg-white/[0.03] border-b border-white/10 flex-shrink-0">
              <div className="flex gap-1">
                <div className="w-3 h-3 rounded-full bg-red-500/40" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/40" />
                <div className="w-3 h-3 rounded-full bg-green-500/40" />
              </div>
              <div className="flex-1 flex items-center gap-2">
                <input
                  value={navigateUrl}
                  onChange={e => setNavigateUrl(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && isRecording && handleNavigate()}
                  placeholder={isRecording ? "Type URL and press Enter to navigate..." : recording.target_url || "No URL"}
                  disabled={!isRecording}
                  className="flex-1 bg-white/5 border border-white/10 text-white text-xs rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-violet-500/50 disabled:opacity-50 font-mono"
                />
                {isRecording && (
                  <button onClick={handleNavigate} className="text-xs text-gray-400 hover:text-white px-2">Go</button>
                )}
              </div>
              <Globe className="w-3.5 h-3.5 text-gray-600" />
            </div>

            {/* Screenshot / placeholder */}
            <div className="flex-1 relative min-h-0">
              {screenshot ? (
                <img
                  src={`data:image/jpeg;base64,${screenshot}`}
                  alt="Browser view"
                  className={`w-full h-full object-contain ${isRecording ? "cursor-crosshair" : ""}`}
                  onClick={isRecording ? handleImgClick : undefined}
                  style={{ maxHeight: "100%", background: "#000" }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center p-8">
                  {isRecording ? (
                    <>
                      <Spinner size="lg" />
                      <p className="text-sm text-gray-400 mt-3">Browser is starting…</p>
                      <p className="text-xs text-gray-600 mt-1">Connecting to Playwright session</p>
                    </>
                  ) : (
                    <>
                      <Globe className="w-10 h-10 text-gray-700 mb-3" />
                      <p className="text-sm text-gray-500">No screenshot available</p>
                      {status === "ready" && <p className="text-xs text-gray-600 mt-1">Click "Launch Browser" to start</p>}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Replay result below browser */}
          {(replayLoading || replayResult) && (
            <div className="mt-3 overflow-y-auto" style={{ maxHeight: "40%" }}>
              {replayLoading ? (
                <div className="border border-white/5 rounded-xl p-6 text-center">
                  <Spinner size="lg" />
                  <p className="text-sm text-gray-400 mt-2">Replaying in fresh Playwright session…</p>
                </div>
              ) : <ReplayResult result={replayResult} />}
            </div>
          )}
        </div>

        {/* Right: Event list */}
        <div className="w-72 flex-shrink-0 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-2 flex-shrink-0">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Recorded Events ({events.length})
            </p>
            {isRecording && (
              <span className="text-xs text-red-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-red-400 rounded-full animate-pulse" />
                Live
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
            {events.length === 0 ? (
              <div className="text-center py-8 text-gray-600 text-xs">
                {isRecording
                  ? "Interact with the browser above to record events"
                  : "No events recorded"}
              </div>
            ) : (
              events.map((ev, i) => <EventRow key={ev.id ?? i} ev={ev} index={i} />)
            )}
            <div ref={eventsEndRef} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── List / Create views ────────────────────────────────────────────────────────

export default function RecorderPage() {
  const qc = useQueryClient()
  const [view, setView] = useState<"list" | "new" | "session">("list")
  const [activeRecording, setActiveRecording] = useState<any>(null)
  const [form, setForm] = useState({ agent_id: "", name: "", description: "", target_url: "" })

  const { data: agents = [] } = useQuery({ queryKey: ["agents"], queryFn: () => agentsApi.list().then(r => r.data) })
  const { data: recordings = [], isLoading } = useQuery({ queryKey: ["recordings"], queryFn: () => recordingsApi.list().then(r => r.data) })

  const createMutation = useMutation({
    mutationFn: () => recordingsApi.create({
      agent_id: Number(form.agent_id),
      name: form.name,
      description: form.description || undefined,
      target_url: form.target_url || undefined,
    }),
    onSuccess: async (res) => {
      qc.invalidateQueries({ queryKey: ["recordings"] })
      const rec = res.data
      toast("Recording created", "info")

      // If URL provided, auto-launch browser
      if (form.target_url) {
        try {
          toast("Launching browser…", "info")
          await recordingsApi.startBrowser(rec.id)
          toast("Browser started — interact to record events", "success")
          setActiveRecording({ ...rec, status: "recording" })
        } catch (e: any) {
          toast(e.response?.data?.detail || "Browser failed to start", "error")
          setActiveRecording({ ...rec, status: "ready" })
        }
      } else {
        setActiveRecording({ ...rec, status: "ready" })
      }
      setView("session")
    },
    onError: (e: any) => toast(e.response?.data?.detail || "Failed to create recording", "error"),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => recordingsApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["recordings"] }); toast("Deleted", "info") },
  })

  const openRecording = async (r: any) => {
    setActiveRecording(r)
    setView("session")
  }

  if (view === "session" && activeRecording) {
    return <RecordingSession recording={activeRecording} onBack={() => { setView("list"); setActiveRecording(null); qc.invalidateQueries({ queryKey: ["recordings"] }) }} />
  }

  if (view === "new") {
    return (
      <div className="p-8 max-w-lg">
        <button onClick={() => setView("list")} className="text-xs text-gray-500 hover:text-gray-300 mb-4 block">← Recordings</button>
        <div className="mb-6">
          <h1 className="text-2xl font-black">New Recording</h1>
          <p className="text-gray-400 text-sm mt-1">Capture real browser interactions with Playwright</p>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Recording Name *</label>
            <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))}
              className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
              placeholder="Login flow, Checkout test…" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Target URL</label>
            <input value={form.target_url} onChange={e => setForm(f => ({...f, target_url: e.target.value}))}
              className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/50"
              placeholder="https://example.com/login" />
            <p className="text-xs text-gray-500 mt-1">A Playwright browser will open at this URL automatically</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Agent *</label>
            <select value={form.agent_id} onChange={e => setForm(f => ({...f, agent_id: e.target.value}))}
              className="w-full bg-[#1a1a1a] border border-white/10 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 appearance-none"
              style={{ colorScheme: "dark" }}>
              <option value="">Select agent</option>
              {agents.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            {agents.length === 0 && <p className="text-xs text-gray-500 mt-1">No agents. <Link href="/agents/new" className="text-violet-400">Create one →</Link></p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Description</label>
            <input value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))}
              className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
              placeholder="What does this recording test?" />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => createMutation.mutate()} disabled={!form.name || !form.agent_id || createMutation.isPending}
              className="flex-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium transition-colors">
              {createMutation.isPending ? "Creating & launching…" : form.target_url ? "Create & Launch Browser" : "Create Recording"}
            </button>
            <button onClick={() => setView("list")} className="px-6 border border-white/10 text-gray-400 rounded-lg text-sm transition-colors hover:border-white/20">Cancel</button>
          </div>
        </div>
      </div>
    )
  }

  // List view
  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black">Recorder</h1>
          <p className="text-gray-400 text-sm mt-1">Real browser recording with Playwright — capture, replay, and compare interactions</p>
        </div>
        <button onClick={() => setView("new")} className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" /> New Recording
        </button>
      </div>

      {/* How it works */}
      <div className="grid grid-cols-4 gap-3 mb-8">
        {[
          { icon: <Globe className="w-4 h-4 text-blue-400" />, n: "1", label: "Enter URL", desc: "Playwright opens target in isolated browser" },
          { icon: <MousePointer className="w-4 h-4 text-orange-400" />, n: "2", label: "Interact", desc: "Click the live browser view — events are captured" },
          { icon: <Camera className="w-4 h-4 text-violet-400" />, n: "3", label: "Stop & Save", desc: "Save as a reusable test scenario" },
          { icon: <RefreshCw className="w-4 h-4 text-green-400" />, n: "4", label: "Replay", desc: "Fresh Playwright session — compare expected vs actual" },
        ].map(item => (
          <div key={item.n} className="border border-white/5 bg-white/[0.02] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1.5">{item.icon}<span className="text-sm font-semibold">{item.label}</span></div>
            <p className="text-xs text-gray-500">{item.desc}</p>
          </div>
        ))}
      </div>

      {/* Architecture note */}
      <div className="border border-blue-500/20 bg-blue-500/5 rounded-xl p-4 mb-6 flex items-start gap-3">
        <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-blue-200/80">
          <span className="font-semibold text-blue-300">How recording works: </span>
          Playwright runs headless on the server. The browser view is streamed as screenshots to this panel every 800ms.
          Click anywhere on the browser screenshot to send that click to Playwright. Use the URL bar to navigate.
          All interactions are captured and saved to the database.
        </div>
      </div>

      {isLoading ? <LoadingPage /> : recordings.length === 0 ? (
        <EmptyState
          title="No recordings yet"
          description="Create a recording to start capturing real browser interactions for replay testing."
          action={<button onClick={() => setView("new")} className="text-violet-400 hover:text-violet-300 text-sm">Create First Recording →</button>}
        />
      ) : (
        <div className="space-y-2">
          {recordings.map((r: any) => (
            <div key={r.id} className="flex items-center gap-4 p-4 border border-white/5 bg-white/[0.02] rounded-xl hover:border-white/10 transition-colors">
              <div className="w-9 h-9 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                <Video className="w-4 h-4 text-violet-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{r.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    r.status === "completed" ? "bg-green-500/10 text-green-400" :
                    r.status === "recording" ? "bg-red-500/10 text-red-400 animate-pulse" :
                    "bg-gray-500/10 text-gray-400"
                  }`}>{r.status}</span>
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-xs text-gray-500">{r.event_count || 0} events</span>
                  {r.target_url && <span className="text-xs text-gray-600 font-mono truncate max-w-xs">{r.target_url}</span>}
                  <span className="text-xs text-gray-600">{formatDate(r.created_at)}</span>
                </div>
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => openRecording(r)} className="flex items-center gap-1.5 text-xs border border-white/10 hover:border-white/20 text-gray-400 hover:text-white px-3 py-1.5 rounded-lg transition-colors">
                  Open <ArrowRight className="w-3 h-3" />
                </button>
                <button onClick={() => deleteMutation.mutate(r.id)} disabled={deleteMutation.isPending}
                  className="p-1.5 hover:bg-red-500/10 text-gray-500 hover:text-red-400 rounded-lg transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
