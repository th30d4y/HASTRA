import Link from "next/link"
import { Shield, Zap, Target, BarChart3, GitBranch, Play, ArrowRight, CheckCircle } from "lucide-react"

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#030303] text-white">
      {/* Nav */}
      <nav className="border-b border-white/5 bg-black/30 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-violet-400" />
            <span className="text-xl font-bold tracking-tight">HASTRA</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm text-gray-400 hover:text-white transition-colors">Sign in</Link>
            <Link href="/register" className="text-sm bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-md transition-colors">Get Started</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-6 pt-24 pb-20 text-center">
        <div className="inline-flex items-center gap-2 border border-violet-500/20 bg-violet-500/5 text-violet-400 text-xs px-3 py-1 rounded-full mb-8">
          <Zap className="w-3 h-3" />
          AI Agent Security & Testing Platform
        </div>
        <h1 className="text-6xl font-black tracking-tight mb-6 bg-gradient-to-b from-white to-gray-400 bg-clip-text text-transparent leading-tight">
          Test AI Agents Before<br />They Fail in Production.
        </h1>
        <p className="text-xl text-gray-400 max-w-3xl mx-auto mb-10">
          HASTRA automatically generates adversarial scenarios, replays agent workflows, detects unsafe behavior, and measures AI-agent reliability.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link href="/register" className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-8 py-3 rounded-md font-medium transition-colors">
            Start Testing <ArrowRight className="w-4 h-4" />
          </Link>
          <Link href="/login" className="flex items-center gap-2 border border-white/10 hover:border-white/20 text-white px-8 py-3 rounded-md font-medium transition-colors">
            <Play className="w-4 h-4" /> View Demo
          </Link>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-white/5 bg-white/[0.02]">
        <div className="max-w-7xl mx-auto px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { v: "12+", l: "Failure Categories" },
            { v: "50+", l: "Pre-built Scenarios" },
            { v: "8", l: "LLM Providers" },
            { v: "100%", l: "Sandboxed" },
          ].map((s) => (
            <div key={s.l}>
              <div className="text-4xl font-black text-violet-400">{s.v}</div>
              <div className="text-sm text-gray-500 mt-1">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-black mb-4">Everything you need to test AI agents</h2>
          <p className="text-gray-400 text-lg">From recording to regression testing — HASTRA covers the full lifecycle.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            { icon: <Target className="w-5 h-5 text-violet-400" />, title: "Scenario Generation", desc: "AI-powered generation of normal, adversarial, and security test scenarios grounded in your agent's actual capabilities." },
            { icon: <Play className="w-5 h-5 text-violet-400" />, title: "Sandboxed Execution", desc: "Run tests in a safe environment with mock APIs, tools, and browser automation. No risk to production systems." },
            { icon: <Shield className="w-5 h-5 text-violet-400" />, title: "Security Testing", desc: "Detect prompt injection, unauthorized tool use, data leakage, and destructive actions before they reach users." },
            { icon: <BarChart3 className="w-5 h-5 text-violet-400" />, title: "Reliability Scoring", desc: "Quantified reliability and security scores across task success, tool correctness, and instruction following." },
            { icon: <GitBranch className="w-5 h-5 text-violet-400" />, title: "Regression Testing", desc: "Compare agent versions side-by-side. Detect regressions automatically when you update your agent." },
            { icon: <Zap className="w-5 h-5 text-violet-400" />, title: "Multi-Model Testing", desc: "Run the same scenarios against different LLM providers and models to find the best option for your use case." },
          ].map((f) => (
            <div key={f.title} className="border border-white/5 bg-white/[0.02] rounded-xl p-6 hover:border-violet-500/20 transition-colors">
              <div className="w-10 h-10 bg-violet-500/10 rounded-lg flex items-center justify-center mb-4">{f.icon}</div>
              <h3 className="font-semibold mb-2">{f.title}</h3>
              <p className="text-sm text-gray-400">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Workflow */}
      <section className="border-y border-white/5 bg-white/[0.02]">
        <div className="max-w-4xl mx-auto px-6 py-24 text-center">
          <h2 className="text-4xl font-black mb-4">The HASTRA Workflow</h2>
          <p className="text-gray-400 mb-12">A complete testing pipeline for agentic AI systems.</p>
          <div className="flex flex-wrap justify-center gap-3">
            {["RECORD", "UNDERSTAND", "GENERATE", "ATTACK", "EXECUTE", "OBSERVE", "EVALUATE", "REPORT", "REGRESSION TEST"].map((step, i, arr) => (
              <div key={step} className="flex items-center gap-3">
                <div className="bg-violet-500/10 border border-violet-500/20 text-violet-400 text-sm font-mono px-4 py-2 rounded-md">{step}</div>
                {i < arr.length - 1 && <ArrowRight className="w-4 h-4 text-gray-600" />}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-6 py-24 text-center">
        <h2 className="text-4xl font-black mb-4">Ready to secure your AI agents?</h2>
        <p className="text-gray-400 mb-8">HASTRA helps teams discover how AI agents fail before those failures happen in production.</p>
        <Link href="/register" className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-8 py-3 rounded-md font-medium transition-colors">
          Get Started Free <ArrowRight className="w-4 h-4" />
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 text-center text-sm text-gray-600">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Shield className="w-4 h-4 text-violet-400" />
          <span className="text-white font-semibold">HASTRA</span>
        </div>
        AI Agent Security, Testing & Reliability Assurance
      </footer>
    </div>
  )
}
