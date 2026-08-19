"""
HASTRA AI Assistant — Bedrock-powered agentic chat.

The LLM uses structured tools to perform real backend operations AND real browser
interactions. Browser tools (browser_open, browser_click, etc.) use a per-session
Playwright instance managed by browser_agent.py.

Architecture:
  User message
    → Bedrock (claude-haiku on inference profile)
    → tool_use: create_agent / browse / run_tests / ...
    → _dispatch() → actual backend operation or browser_agent call
    → observation back to Bedrock
    → next tool or end_turn
    → persist messages to DB
"""
import json
import uuid
import boto3
import asyncio
import threading
from typing import Optional
from sqlalchemy.orm import Session
from app.core.config import settings

# ── System prompt ──────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are HASTRA — an AI Agent QA and Security Testing platform.

You are an **agentic controller**. When the user asks you to do something, you DO IT using your tools. You do not just describe what you would do.

## Browser agent rules
When asked to check a website, test a login flow, or read content from a URL:
1. Use `browser_open` to navigate to the URL.
2. Use `browser_read_page` to observe the current state.
3. Use `browser_click`, `browser_fill`, `browser_press` to interact.
4. Repeat observe → act until the task is complete.
5. Use `browser_close` when done to finalize.
6. The `session_id` must be the SAME string across all browser tool calls in one task. Use a short unique ID like "s1", "s2", etc.

## NEVER do fake work
- If a browser tool returns an error, report it honestly.
- Never claim to have opened a website you haven't.
- Never invent page content.
- Every finding must come from actual tool output.

## HASTRA platform rules
- When creating agents with tools: create tools FIRST (get IDs), then create agent with tool_ids.
- When running tests: check there are scenarios first; if none, generate them first.
- Always confirm real IDs from tool responses.

## Response style
- Be concise but accurate.
- Show tool execution results clearly.
- For browser tasks, show each step as it happens.
- Report findings with evidence from actual observations.
- If credentials are needed, say so clearly — never guess passwords."""

# ── Tool definitions ───────────────────────────────────────────────────────────

TOOLS = [
    # ── Browser agent tools ─────────────────────────────────────────────────
    {
        "name": "browser_open",
        "description": "Open a URL in a real Playwright browser. Returns page title, URL, visible text, interactive elements, and a screenshot. ALWAYS call this first for any web task.",
        "input_schema": {
            "type": "object",
            "properties": {
                "session_id": {"type": "string", "description": "Browser session ID (use same ID across all browser calls in one task, e.g. 's1')"},
                "url": {"type": "string", "description": "Full URL to open (must start with http:// or https://)"},
            },
            "required": ["session_id", "url"],
        },
    },
    {
        "name": "browser_read_page",
        "description": "Read the current browser page state: URL, title, visible text, interactive elements, screenshot. Call after navigation or interactions to observe what changed.",
        "input_schema": {
            "type": "object",
            "properties": {
                "session_id": {"type": "string"},
            },
            "required": ["session_id"],
        },
    },
    {
        "name": "browser_click",
        "description": "Click an element on the current page. Pass the visible text, aria-label, or CSS selector of the element to click.",
        "input_schema": {
            "type": "object",
            "properties": {
                "session_id": {"type": "string"},
                "selector": {"type": "string", "description": "Visible text, aria-label, placeholder, or CSS selector of element to click"},
            },
            "required": ["session_id", "selector"],
        },
    },
    {
        "name": "browser_fill",
        "description": "Fill a form field. Use the field's label, placeholder, name, or id as the selector. Passwords are automatically masked.",
        "input_schema": {
            "type": "object",
            "properties": {
                "session_id": {"type": "string"},
                "selector": {"type": "string", "description": "Field label, placeholder, name, or id"},
                "value": {"type": "string", "description": "Value to fill. Passwords will be masked in logs."},
            },
            "required": ["session_id", "selector", "value"],
        },
    },
    {
        "name": "browser_press",
        "description": "Press a keyboard key. Common values: Enter, Tab, Escape, ArrowDown, ArrowUp.",
        "input_schema": {
            "type": "object",
            "properties": {
                "session_id": {"type": "string"},
                "key": {"type": "string", "description": "Key to press (Enter, Tab, Escape, etc.)"},
            },
            "required": ["session_id", "key"],
        },
    },
    {
        "name": "browser_find_element",
        "description": "Find elements on the page matching a description. Use this to locate login buttons, forms, navigation links, etc.",
        "input_schema": {
            "type": "object",
            "properties": {
                "session_id": {"type": "string"},
                "description": {"type": "string", "description": "Description of element to find, e.g. 'login button', 'email field', 'write up'"},
            },
            "required": ["session_id", "description"],
        },
    },
    {
        "name": "browser_close",
        "description": "Close the browser session when the task is complete. Returns the complete action history.",
        "input_schema": {
            "type": "object",
            "properties": {
                "session_id": {"type": "string"},
            },
            "required": ["session_id"],
        },
    },
    # ── HASTRA platform tools ────────────────────────────────────────────────
    {
        "name": "create_tool",
        "description": "Create a tool definition. Returns tool_id. Call BEFORE create_agent so you have tool IDs to attach.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "description": {"type": "string"},
                "risk_level": {"type": "string", "enum": ["SAFE", "LOW", "MEDIUM", "HIGH", "CRITICAL"]},
                "requires_confirmation": {"type": "boolean"},
                "mock_response": {"type": "string", "description": "JSON string for sandbox response"},
                "agent_id": {"type": "integer", "description": "If provided, immediately attach to this agent"},
            },
            "required": ["name", "description", "risk_level"],
        },
    },
    {
        "name": "create_agent",
        "description": "Create a new HASTRA agent. Provide tool_ids to attach existing tools. Returns agent_id.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "description": {"type": "string"},
                "system_prompt": {"type": "string"},
                "model_id": {"type": "string"},
                "environment": {"type": "string", "enum": ["sandbox", "staging", "production"], "default": "sandbox"},
                "tool_ids": {"type": "array", "items": {"type": "integer"}},
            },
            "required": ["name"],
        },
    },
    {
        "name": "attach_tool_to_agent",
        "description": "Attach an existing tool to an agent",
        "input_schema": {
            "type": "object",
            "properties": {
                "agent_id": {"type": "integer"},
                "tool_id": {"type": "integer"},
            },
            "required": ["agent_id", "tool_id"],
        },
    },
    {
        "name": "list_agents",
        "description": "List all agents with scores and tool counts",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_agent",
        "description": "Get detailed info about a specific agent",
        "input_schema": {
            "type": "object",
            "properties": {"agent_id": {"type": "integer"}},
            "required": ["agent_id"],
        },
    },
    {
        "name": "list_tools",
        "description": "List all configured tools",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "generate_scenarios",
        "description": "Generate AI-powered test scenarios for an agent",
        "input_schema": {
            "type": "object",
            "properties": {
                "agent_id": {"type": "integer"},
                "count": {"type": "integer", "default": 10},
                "categories": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["agent_id"],
        },
    },
    {
        "name": "run_tests",
        "description": "Run test scenarios for an agent using real Bedrock LLM evaluation",
        "input_schema": {
            "type": "object",
            "properties": {
                "agent_id": {"type": "integer"},
                "scenario_ids": {"type": "array", "items": {"type": "integer"}},
            },
            "required": ["agent_id"],
        },
    },
    {
        "name": "get_findings",
        "description": "Get security and reliability findings",
        "input_schema": {
            "type": "object",
            "properties": {
                "severity": {"type": "string", "enum": ["CRITICAL", "HIGH", "MEDIUM", "LOW"]},
                "agent_id": {"type": "integer"},
            },
        },
    },
    {
        "name": "get_dashboard_stats",
        "description": "Get platform overview statistics",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "create_recording",
        "description": "Create a new browser recording session for an agent",
        "input_schema": {
            "type": "object",
            "properties": {
                "agent_id": {"type": "integer"},
                "name": {"type": "string"},
                "description": {"type": "string"},
            },
            "required": ["agent_id", "name"],
        },
    },
    {
        "name": "list_recordings",
        "description": "List all recordings",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "suggest_regression_tests",
        "description": "Analyze past failures and create regression test scenarios",
        "input_schema": {
            "type": "object",
            "properties": {
                "agent_id": {"type": "integer"},
                "create": {"type": "boolean", "default": True},
            },
            "required": ["agent_id"],
        },
    },
]


# ── Tool dispatcher ────────────────────────────────────────────────────────────

def _execute_tool(name: str, inp: dict, user_id: int, db: Session) -> str:
    try:
        result = _dispatch(name, inp, user_id, db)
        return json.dumps(result, default=str)
    except Exception as e:
        return json.dumps({"error": str(e), "tool": name})


def _dispatch(name: str, inp: dict, user_id: int, db: Session) -> dict:
    # ── Browser tools ────────────────────────────────────────────────────────
    if name == "browser_open":
        from app.services.browser_agent import browser_open
        return browser_open(inp["session_id"], inp["url"])  # screenshot captured in chat loop

    elif name == "browser_read_page":
        from app.services.browser_agent import browser_read_page
        return browser_read_page(inp["session_id"])

    elif name == "browser_click":
        from app.services.browser_agent import browser_click
        return browser_click(inp["session_id"], inp["selector"])

    elif name == "browser_fill":
        from app.services.browser_agent import browser_fill
        return browser_fill(inp["session_id"], inp["selector"], inp["value"])

    elif name == "browser_press":
        from app.services.browser_agent import browser_press
        return browser_press(inp["session_id"], inp["key"])

    elif name == "browser_find_element":
        from app.services.browser_agent import browser_find_element
        return browser_find_element(inp["session_id"], inp["description"])

    elif name == "browser_close":
        from app.services.browser_agent import browser_close
        return browser_close(inp["session_id"])

    # ── HASTRA platform tools ────────────────────────────────────────────────
    elif name == "create_tool":
        from app.models.tool import Tool
        from app.models.agent import Agent
        tool = Tool(
            user_id=user_id, name=inp["name"],
            description=inp.get("description", ""),
            risk_level=inp.get("risk_level", "SAFE"),
            requires_confirmation=inp.get("requires_confirmation", False),
            mock_response=inp.get("mock_response", "{}"),
            execution_mode="MOCK", input_schema={"type": "object"},
        )
        db.add(tool)
        db.flush()
        if inp.get("agent_id"):
            agent = db.query(Agent).filter(Agent.id == inp["agent_id"], Agent.user_id == user_id).first()
            if agent and tool not in agent.tools:
                agent.tools.append(tool)
        db.commit()
        return {"success": True, "tool_id": tool.id, "name": tool.name, "risk_level": tool.risk_level}

    elif name == "create_agent":
        from app.models.agent import Agent, AgentVersion
        from app.models.tool import Tool
        agent = Agent(
            user_id=user_id, name=inp["name"],
            description=inp.get("description", ""),
            system_prompt=inp.get("system_prompt", ""),
            model_id=inp.get("model_id", settings.BEDROCK_MODEL_ID),
            environment=inp.get("environment", "sandbox"),
            temperature=0.3, max_tokens=1024, current_version=1,
        )
        db.add(agent)
        db.flush()
        snapshot = {"name": agent.name, "system_prompt": agent.system_prompt, "model_id": agent.model_id}
        db.add(AgentVersion(agent_id=agent.id, version_number=1, snapshot=snapshot, change_description="Created via Assistant"))
        attached = []
        for tid in inp.get("tool_ids", []):
            t = db.query(Tool).filter(Tool.id == tid, Tool.user_id == user_id).first()
            if t and t not in agent.tools:
                agent.tools.append(t)
                attached.append(t.name)
        db.commit()
        return {"success": True, "agent_id": agent.id, "name": agent.name, "model_id": agent.model_id,
                "version": 1, "attached_tools": attached, "environment": agent.environment}

    elif name == "attach_tool_to_agent":
        from app.models.agent import Agent
        from app.models.tool import Tool
        agent = db.query(Agent).filter(Agent.id == inp["agent_id"], Agent.user_id == user_id).first()
        tool = db.query(Tool).filter(Tool.id == inp["tool_id"], Tool.user_id == user_id).first()
        if not agent: return {"error": f"Agent {inp['agent_id']} not found"}
        if not tool: return {"error": f"Tool {inp['tool_id']} not found"}
        if tool not in agent.tools:
            agent.tools.append(tool)
            db.commit()
        return {"success": True, "agent": agent.name, "tool": tool.name}

    elif name == "list_agents":
        from app.models.agent import Agent
        agents = db.query(Agent).filter(Agent.user_id == user_id).all()
        return [{"id": a.id, "name": a.name, "model_id": a.model_id, "tool_count": len(a.tools),
                 "version": a.current_version, "reliability_score": a.reliability_score,
                 "security_score": a.security_score, "environment": a.environment} for a in agents]

    elif name == "get_agent":
        from app.models.agent import Agent
        agent = db.query(Agent).filter(Agent.id == inp["agent_id"], Agent.user_id == user_id).first()
        if not agent: return {"error": "Agent not found"}
        return {"id": agent.id, "name": agent.name, "description": agent.description,
                "model_id": agent.model_id, "version": agent.current_version,
                "tools": [{"id": t.id, "name": t.name, "risk_level": t.risk_level} for t in agent.tools],
                "reliability_score": agent.reliability_score, "security_score": agent.security_score}

    elif name == "list_tools":
        from app.models.tool import Tool
        tools = db.query(Tool).filter(Tool.user_id == user_id).all()
        return [{"id": t.id, "name": t.name, "risk_level": t.risk_level, "execution_mode": t.execution_mode} for t in tools]

    elif name == "generate_scenarios":
        from app.models.agent import Agent
        from app.models.scenario import Scenario, ScenarioAssertion
        from app.services.scenario_generator import generate_scenarios_for_agent
        agent = db.query(Agent).filter(Agent.id == inp["agent_id"], Agent.user_id == user_id).first()
        if not agent: return {"error": f"Agent {inp['agent_id']} not found"}
        data = generate_scenarios_for_agent(agent, list(agent.tools), inp.get("categories", []), inp.get("count", 10))
        created = []
        for s_data in data:
            assertions = s_data.pop("assertions", [])
            s = Scenario(user_id=user_id, agent_id=agent.id, is_generated=True, **s_data)
            db.add(s); db.flush()
            for a in assertions:
                db.add(ScenarioAssertion(scenario_id=s.id, assertion_type=a.get("type", "custom"), description=a.get("description", "")))
            created.append({"id": s.id, "name": s.name, "category": s.category, "risk_level": s.risk_level})
        db.commit()
        return {"success": True, "generated": len(created), "scenarios": created[:5], "total": len(created)}

    elif name == "run_tests":
        from app.models.agent import Agent
        from app.models.scenario import Scenario
        from app.models.test_run import TestRun, TestResult
        from app.services.test_executor import execute_test_run_sync
        agent = db.query(Agent).filter(Agent.id == inp["agent_id"], Agent.user_id == user_id).first()
        if not agent: return {"error": f"Agent {inp['agent_id']} not found"}
        scenario_ids = inp.get("scenario_ids", [])
        if not scenario_ids:
            scenarios = db.query(Scenario).filter(Scenario.agent_id == agent.id, Scenario.user_id == user_id).all()
            scenario_ids = [s.id for s in scenarios]
        if not scenario_ids: return {"error": "No scenarios found. Generate scenarios first."}
        run = TestRun(user_id=user_id, agent_id=agent.id, name=f"Chat Run — {agent.name}",
                      status="running", total_scenarios=len(scenario_ids))
        db.add(run); db.flush()
        for sid in scenario_ids:
            db.add(TestResult(test_run_id=run.id, scenario_id=sid, status="queued"))
        db.commit()
        execute_test_run_sync(run.id, db)
        db.refresh(run)
        return {"success": True, "run_id": run.id, "total": run.total_scenarios,
                "passed": run.passed, "failed": run.failed,
                "reliability_score": run.reliability_score, "security_score": run.security_score,
                "critical_findings": run.critical_findings}

    elif name == "get_findings":
        from app.models.finding import Finding
        from app.models.test_run import TestRun
        q = db.query(Finding).join(TestRun, Finding.test_run_id == TestRun.id).filter(TestRun.user_id == user_id)
        if "severity" in inp: q = q.filter(Finding.severity == inp["severity"])
        if "agent_id" in inp: q = q.filter(TestRun.agent_id == inp["agent_id"])
        findings = q.order_by(Finding.created_at.desc()).limit(20).all()
        return [{"id": f.id, "title": f.title, "severity": f.severity,
                 "description": f.description, "recommended_fix": f.recommended_fix} for f in findings]

    elif name == "get_dashboard_stats":
        from app.models.agent import Agent
        from app.models.test_run import TestRun
        from app.models.finding import Finding
        from app.models.scenario import Scenario
        return {"agents": db.query(Agent).filter(Agent.user_id == user_id).count(),
                "test_runs": db.query(TestRun).filter(TestRun.user_id == user_id).count(),
                "scenarios": db.query(Scenario).filter(Scenario.user_id == user_id).count(),
                "findings": db.query(Finding).join(TestRun).filter(TestRun.user_id == user_id).count(),
                "critical": db.query(Finding).join(TestRun).filter(TestRun.user_id == user_id, Finding.severity == "CRITICAL").count()}

    elif name == "create_recording":
        from app.models.recording import Recording
        from app.models.agent import Agent
        agent = db.query(Agent).filter(Agent.id == inp["agent_id"], Agent.user_id == user_id).first()
        if not agent: return {"error": "Agent not found"}
        rec = Recording(user_id=user_id, agent_id=inp["agent_id"],
                        name=inp["name"], description=inp.get("description", ""),
                        status="recording", agent_version=agent.current_version)
        db.add(rec); db.commit()
        return {"success": True, "recording_id": rec.id, "name": rec.name}

    elif name == "list_recordings":
        from app.models.recording import Recording
        recs = db.query(Recording).filter(Recording.user_id == user_id).order_by(Recording.created_at.desc()).limit(10).all()
        return [{"id": r.id, "name": r.name, "status": r.status, "event_count": r.event_count} for r in recs]

    elif name == "suggest_regression_tests":
        from app.models.agent import Agent
        from app.models.finding import Finding
        from app.models.test_run import TestRun
        from app.models.scenario import Scenario, ScenarioAssertion
        agent = db.query(Agent).filter(Agent.id == inp["agent_id"], Agent.user_id == user_id).first()
        if not agent: return {"error": "Agent not found"}
        findings = db.query(Finding).join(TestRun).filter(
            TestRun.agent_id == agent.id, Finding.severity.in_(["CRITICAL", "HIGH"])
        ).order_by(Finding.created_at.desc()).limit(10).all()
        suggestions, created = [], []
        seen = set()
        for f in findings:
            if f.title not in seen:
                seen.add(f.title)
                suggestions.append({"name": f"Regression: {f.title}", "category": "regression",
                                     "risk_level": f.severity, "user_input": f.description or f.title,
                                     "expected_behavior": f.expected_behavior or "Agent handles this correctly",
                                     "description": f"Regression for: {f.description}", "tags": ["regression"]})
        if inp.get("create", True):
            for s_data in suggestions[:5]:
                s = Scenario(user_id=user_id, agent_id=agent.id, is_generated=True, **s_data)
                db.add(s); db.flush(); created.append({"id": s.id, "name": s.name})
            db.commit()
        return {"success": True, "suggestions": [s["name"] for s in suggestions], "created": len(created)}

    return {"error": f"Unknown tool: {name}"}


def _sanitize_browser_result(result: dict) -> dict:
    """Remove screenshot from tool result (too large for LLM context window)."""
    r = {k: v for k, v in result.items() if k != "screenshot_b64"}
    # Truncate visible text for LLM context
    if "visible_text" in r and r["visible_text"]:
        r["visible_text"] = r["visible_text"][:1500]
    # Limit interactive elements
    if "interactive_elements" in r:
        r["interactive_elements"] = r["interactive_elements"][:20]
    return r


# ── Main chat function ─────────────────────────────────────────────────────────

def chat(messages: list, user_id: int, db: Session) -> dict:
    """
    Run one turn of the agentic loop.
    Returns: {"response": str, "tool_calls": list, "screenshots": dict}
    """
    client = boto3.client(
        "bedrock-runtime",
        region_name=settings.AWS_DEFAULT_REGION or "us-east-1",
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        aws_session_token=settings.AWS_SESSION_TOKEN,
    )

    current_messages = list(messages)
    tool_calls_made = []
    screenshots = {}  # session_id → latest screenshot for UI display

    for iteration in range(20):  # max 20 tool calls
        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 4096,
            "system": SYSTEM_PROMPT,
            "messages": current_messages,
            "tools": TOOLS,
        }

        response = client.invoke_model(
            modelId=settings.BEDROCK_MODEL_ID, body=json.dumps(body)
        )
        result = json.loads(response["body"].read())
        content = result.get("content", [])
        stop_reason = result.get("stop_reason")

        current_messages.append({"role": "assistant", "content": content})

        if stop_reason == "end_turn":
            text = "".join(b["text"] for b in content if isinstance(b, dict) and b.get("type") == "text")
            return {"response": text, "tool_calls": tool_calls_made, "screenshots": screenshots}

        if stop_reason == "tool_use":
            tool_results = []
            for block in content:
                if not (isinstance(block, dict) and block.get("type") == "tool_use"):
                    continue

                tool_name = block["name"]
                tool_input = block.get("input", {})
                tool_use_id = block["id"]

                raw_result = _execute_tool(tool_name, tool_input, user_id, db)

                # Capture screenshot from browser tools (it's in the raw result before sanitization for LLM)
                if tool_name in ("browser_open", "browser_read_page", "browser_click", "browser_press", "browser_find_element"):
                    sess_id = tool_input.get("session_id", "")
                    try:
                        full = json.loads(raw_result)
                        if ss := full.get("screenshot_b64"):
                            screenshots[sess_id] = ss
                        # Replace raw_result with sanitized version for LLM context
                        raw_result = json.dumps(_sanitize_browser_result(full))
                    except Exception:
                        pass

                tool_calls_made.append({
                    "tool": tool_name,
                    "input": tool_input,
                    "result": raw_result,
                })
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tool_use_id,
                    "content": raw_result,
                })

            current_messages.append({"role": "user", "content": tool_results})
            continue

        break  # unexpected stop_reason

    # Fallback text
    text = ""
    for msg in reversed(current_messages):
        if msg["role"] == "assistant":
            for b in (msg["content"] if isinstance(msg["content"], list) else []):
                if isinstance(b, dict) and b.get("type") == "text":
                    text += b["text"]
            if text:
                break
    return {"response": text or "Done.", "tool_calls": tool_calls_made, "screenshots": screenshots}


class _noop_ctx:
    def __enter__(self): return self
    def __exit__(self, *a): pass
