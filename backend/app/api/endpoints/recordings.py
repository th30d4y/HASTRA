import json
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import Optional, List
from pydantic import BaseModel
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.recording import Recording, RecordingEvent
from app.models.agent import Agent
from datetime import datetime, timezone
import asyncio

router = APIRouter()


class RecordingCreate(BaseModel):
    agent_id: int
    name: str
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    target_url: Optional[str] = None


class ManualStepAdd(BaseModel):
    event_type: str
    actor: str
    content: str
    tool_name: Optional[str] = None
    tool_args: Optional[dict] = None
    tool_result: Optional[str] = None
    expected_behavior: Optional[str] = None
    assertions: Optional[List[dict]] = None
    order_index: Optional[int] = None


class StepUpdate(BaseModel):
    content: Optional[str] = None
    expected_behavior: Optional[str] = None
    assertions: Optional[List[dict]] = None


class ActionRequest(BaseModel):
    type: str                        # click | fill | keydown | navigate | scroll
    x: Optional[float] = None       # click: page x coord
    y: Optional[float] = None       # click: page y coord
    selector: Optional[str] = None  # fill
    value: Optional[str] = None     # fill value
    key: Optional[str] = None       # keydown key
    url: Optional[str] = None       # navigate url


# ── CRUD ───────────────────────────────────────────────────────────────────────

@router.get("")
async def list_recordings(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    recs = db.query(Recording).filter(Recording.user_id == current_user.id).order_by(Recording.created_at.desc()).all()
    return [_summary(r) for r in recs]


@router.post("")
async def create_recording(req: RecordingCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    agent = db.query(Agent).filter(Agent.id == req.agent_id, Agent.user_id == current_user.id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    rec = Recording(
        user_id=current_user.id,
        agent_id=req.agent_id,
        name=req.name,
        description=req.description,
        tags=req.tags,
        agent_version=agent.current_version,
        model_id=agent.model_id,
        status="ready",
        extra_metadata={"target_url": req.target_url} if req.target_url else {},
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return {"id": rec.id, "name": rec.name, "status": rec.status,
            "target_url": req.target_url, "created_at": rec.created_at}


@router.get("/{recording_id}")
async def get_recording(recording_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rec = db.query(Recording).filter(Recording.id == recording_id, Recording.user_id == current_user.id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Recording not found")
    events = [_event_dict(e) for e in rec.events]
    return {**_summary(rec), "events": events}


@router.delete("/{recording_id}")
async def delete_recording(recording_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rec = db.query(Recording).filter(Recording.id == recording_id, Recording.user_id == current_user.id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(rec)
    db.commit()
    return {"status": "deleted"}


# ── Browser session lifecycle ──────────────────────────────────────────────────

@router.post("/{recording_id}/start-browser")
async def start_browser_recording(
    recording_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Launch a Playwright browser in a background thread.
    The browser navigates to target_url and waits for user interactions
    (forwarded via /interact).
    Screenshots are available via /screenshot.
    Live events stream via /live-events (SSE).
    """
    rec = db.query(Recording).filter(Recording.id == recording_id, Recording.user_id == current_user.id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Recording not found")

    meta = rec.extra_metadata or {}
    url = meta.get("target_url", "")
    if not url:
        raise HTTPException(status_code=400, detail="No target URL configured. Set target_url when creating the recording.")
    if not url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail=f"Invalid URL: '{url}'. Must start with http:// or https://")

    from app.services.playwright_recorder import start_recording, get_session
    # Don't start if already running
    existing = get_session(recording_id)
    if existing and not existing.stop_event.is_set():
        return {"status": "already_running", "recording_id": recording_id}

    result = start_recording(recording_id, url)
    if result.get("status") == "error":
        raise HTTPException(status_code=500, detail=f"Failed to start browser: {result.get('error')}")
    if result.get("status") == "timeout":
        raise HTTPException(status_code=504, detail="Browser did not start in time. Check Playwright installation: playwright install chromium")

    return result


@router.post("/{recording_id}/stop")
async def stop_recording(recording_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Signal the browser session to stop."""
    rec = db.query(Recording).filter(Recording.id == recording_id, Recording.user_id == current_user.id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Not found")

    from app.services.playwright_recorder import stop_recording as do_stop
    result = do_stop(recording_id)

    # Finalize event_count from DB
    import time; time.sleep(0.5)  # brief pause for last events to flush
    db.expire(rec)
    db.refresh(rec)
    count = db.query(RecordingEvent).filter(RecordingEvent.recording_id == recording_id).count()
    rec.event_count = count
    rec.status = "completed"
    rec.completed_at = datetime.now(timezone.utc)
    db.commit()

    return {"status": "completed", "event_count": count, "recording_id": recording_id}


# ── Screenshot + live events ───────────────────────────────────────────────────

@router.get("/{recording_id}/screenshot")
async def get_screenshot(recording_id: int, current_user: User = Depends(get_current_user)):
    """Return current browser screenshot as base64 JPEG."""
    from app.services.playwright_recorder import get_screenshot
    b64 = get_screenshot(recording_id)
    if not b64:
        raise HTTPException(status_code=404, detail="No screenshot available. Start a browser session first.")
    return {"screenshot": b64, "format": "jpeg"}


@router.get("/{recording_id}/live-events")
async def live_events_sse(
    recording_id: int,
    after: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    SSE stream of new recording events.
    Client sends ?after=N to get only events after index N.
    Falls back to polling from DB when session is inactive.
    """
    from app.services.playwright_recorder import get_session, get_live_events

    async def event_generator():
        idx = after
        session = get_session(recording_id)
        last_db_check = 0

        while True:
            # Get from in-memory session if active
            if session and not session.stop_event.is_set():
                new = get_live_events(recording_id, idx)
                if new:
                    for ev in new:
                        yield f"data: {json.dumps({'index': idx, 'event': ev})}\n\n"
                        idx += 1
                await asyncio.sleep(0.5)
            else:
                # Session ended — send remaining DB events then close
                import time as _time
                now = _time.monotonic()
                if now - last_db_check > 1.0:
                    # Refresh from DB
                    db.expire_all()
                    db_events = db.query(RecordingEvent).filter(
                        RecordingEvent.recording_id == recording_id
                    ).order_by(RecordingEvent.timestamp_ms).all()
                    all_db = [_event_dict(e) for e in db_events]
                    remaining = all_db[idx:]
                    for ev in remaining:
                        yield f"data: {json.dumps({'index': idx, 'event': ev})}\n\n"
                        idx += 1
                    last_db_check = now
                    if not session:
                        # No active session, send done signal
                        yield f"data: {json.dumps({'done': True, 'total': idx})}\n\n"
                        break
                await asyncio.sleep(1.0)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/{recording_id}/events")
async def get_events_poll(
    recording_id: int,
    after: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Simple polling endpoint for new events (alternative to SSE).
    Returns all events with index >= after.
    """
    from app.services.playwright_recorder import get_session, get_live_events

    session = get_session(recording_id)
    if session and not session.stop_event.is_set():
        # From in-memory session
        new = get_live_events(recording_id, after)
        return {"events": new, "total": after + len(new), "active": True}
    else:
        # From DB
        rec = db.query(Recording).filter(Recording.id == recording_id, Recording.user_id == current_user.id).first()
        if not rec:
            raise HTTPException(status_code=404, detail="Not found")
        all_events = db.query(RecordingEvent).filter(
            RecordingEvent.recording_id == recording_id
        ).order_by(RecordingEvent.timestamp_ms).all()
        sliced = [_event_dict(e) for e in all_events[after:]]
        return {"events": sliced, "total": len(all_events), "active": False}


# ── Interact (forward user actions to Playwright) ─────────────────────────────

@router.post("/{recording_id}/interact")
async def interact(recording_id: int, req: ActionRequest, current_user: User = Depends(get_current_user)):
    """
    Forward a browser action (click at coordinates, fill, keydown, navigate)
    to the live Playwright session. The action is also recorded automatically.
    """
    from app.services.playwright_recorder import execute_action, get_session

    session = get_session(recording_id)
    if not session:
        raise HTTPException(status_code=400, detail="No active recording session. Start a browser session first.")

    result = execute_action(recording_id, req.model_dump(exclude_none=True))
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result


# ── Replay ─────────────────────────────────────────────────────────────────────

@router.post("/{recording_id}/replay")
async def replay(recording_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Replay the recording in a fresh isolated Playwright browser."""
    rec = db.query(Recording).filter(Recording.id == recording_id, Recording.user_id == current_user.id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Not found")

    count = db.query(RecordingEvent).filter(RecordingEvent.recording_id == recording_id).count()
    if count == 0:
        raise HTTPException(status_code=400, detail="Recording has no events. Record some interactions first.")

    from app.services.playwright_recorder import _run_replay
    result = await _run_replay(recording_id, current_user.id)
    if result.get("error") and not result.get("success"):
        raise HTTPException(status_code=500, detail=result["error"])
    return result


# ── Manual step management ────────────────────────────────────────────────────

@router.post("/{recording_id}/steps")
async def add_manual_step(recording_id: int, req: ManualStepAdd, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rec = db.query(Recording).filter(Recording.id == recording_id, Recording.user_id == current_user.id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Not found")
    existing = db.query(RecordingEvent).filter(RecordingEvent.recording_id == recording_id).count()
    ts = (req.order_index or existing) * 1000
    extra = {}
    if req.expected_behavior or req.assertions:
        extra = {"expected_behavior": req.expected_behavior, "assertions": req.assertions or []}
    ev = RecordingEvent(
        recording_id=recording_id, event_type=req.event_type,
        timestamp_ms=ts, actor=req.actor, content=req.content,
        tool_name=req.tool_name, tool_args=req.tool_args,
        tool_result=req.tool_result,
        extra_metadata=extra if extra else None,
    )
    db.add(ev)
    rec.event_count = (rec.event_count or 0) + 1
    db.commit()
    db.refresh(ev)
    return {"id": ev.id, "status": "added"}


@router.put("/{recording_id}/steps/{event_id}")
async def update_step(recording_id: int, event_id: int, req: StepUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rec = db.query(Recording).filter(Recording.id == recording_id, Recording.user_id == current_user.id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Not found")
    ev = db.query(RecordingEvent).filter(RecordingEvent.id == event_id, RecordingEvent.recording_id == recording_id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Step not found")
    if req.content is not None:
        ev.content = req.content
    meta = ev.extra_metadata or {}
    if req.expected_behavior is not None:
        meta["expected_behavior"] = req.expected_behavior
    if req.assertions is not None:
        meta["assertions"] = req.assertions
    ev.extra_metadata = meta
    db.commit()
    return {"status": "updated"}


@router.delete("/{recording_id}/steps/{event_id}")
async def delete_step(recording_id: int, event_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rec = db.query(Recording).filter(Recording.id == recording_id, Recording.user_id == current_user.id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Not found")
    ev = db.query(RecordingEvent).filter(RecordingEvent.id == event_id, RecordingEvent.recording_id == recording_id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Step not found")
    db.delete(ev)
    rec.event_count = max(0, (rec.event_count or 1) - 1)
    db.commit()
    return {"status": "deleted"}


# ── Convert to scenario ────────────────────────────────────────────────────────

@router.post("/{recording_id}/convert-to-scenario")
async def convert_to_scenario(recording_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rec = db.query(Recording).filter(Recording.id == recording_id, Recording.user_id == current_user.id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Not found")

    from app.models.scenario import Scenario, ScenarioStep, ScenarioAssertion

    events = sorted(rec.events, key=lambda e: e.timestamp_ms)
    user_events = [e for e in events if e.actor == "user"]
    user_input = user_events[0].content if user_events else "Interact with target"

    meta = rec.extra_metadata or {}
    starting_url = meta.get("target_url")

    all_assertions = []
    for e in events:
        for a in (e.extra_metadata or {}).get("assertions", []):
            all_assertions.append(a)

    scenario = Scenario(
        user_id=current_user.id,
        agent_id=rec.agent_id,
        source_recording_id=rec.id,
        name=f"From recording: {rec.name}",
        description=rec.description or f"Converted from recording: {rec.name}",
        category="normal",
        user_input=user_input,
        expected_behavior="All recorded steps complete successfully",
        preconditions={"starting_url": starting_url} if starting_url else None,
        is_generated=False,
        tags=rec.tags or [],
    )
    db.add(scenario)
    db.flush()

    for i, event in enumerate(events):
        db.add(ScenarioStep(
            scenario_id=scenario.id,
            order_index=i,
            step_type=event.event_type,
            content=event.content,
            extra_metadata={
                **(event.extra_metadata or {}),
                "tool_name": event.tool_name,
                "tool_args": event.tool_args,
            },
        ))

    for a in all_assertions:
        db.add(ScenarioAssertion(
            scenario_id=scenario.id,
            assertion_type=a.get("type", "custom"),
            description=a.get("description", ""),
            config=a.get("config"),
        ))

    db.commit()
    return {
        "scenario_id": scenario.id,
        "name": scenario.name,
        "step_count": len(events),
        "assertion_count": len(all_assertions),
    }


# ── Helpers ────────────────────────────────────────────────────────────────────

def _summary(r: Recording) -> dict:
    meta = r.extra_metadata or {}
    return {
        "id": r.id, "name": r.name, "description": r.description,
        "agent_id": r.agent_id, "status": r.status,
        "event_count": r.event_count or 0,
        "duration_ms": r.duration_ms,
        "tags": r.tags,
        "target_url": meta.get("target_url"),
        "created_at": r.created_at,
        "completed_at": r.completed_at,
    }


def _event_dict(e: RecordingEvent) -> dict:
    meta = e.extra_metadata or {}
    return {
        "id": e.id,
        "event_type": e.event_type,
        "timestamp_ms": e.timestamp_ms,
        "actor": e.actor,
        "content": e.content,
        "tool_name": e.tool_name,
        "tool_args": e.tool_args,
        "tool_result": e.tool_result,
        "latency_ms": e.latency_ms,
        "token_usage": e.token_usage,
        "expected_behavior": meta.get("expected_behavior"),
        "assertions": meta.get("assertions", []),
        "url": meta.get("url"),
        "selector": meta.get("selector"),
        "element": meta.get("element"),
        "selectors": meta.get("selectors"),
    }
