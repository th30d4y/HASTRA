from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, List
from pydantic import BaseModel
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.test_run import TestRun, TestResult, ExecutionEvent
from app.models.scenario import Scenario

router = APIRouter()


class TestRunCreate(BaseModel):
    agent_id: int
    scenario_ids: Optional[List[int]] = None  # None = run all scenarios for agent
    name: Optional[str] = None


@router.get("")
async def list_runs(agent_id: Optional[int] = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    q = db.query(TestRun).filter(TestRun.user_id == current_user.id)
    if agent_id:
        q = q.filter(TestRun.agent_id == agent_id)
    runs = q.order_by(TestRun.created_at.desc()).all()
    return [{
        "id": r.id, "name": r.name, "agent_id": r.agent_id,
        "status": r.status, "total_scenarios": r.total_scenarios,
        "passed": r.passed, "failed": r.failed,
        "reliability_score": r.reliability_score, "security_score": r.security_score,
        "critical_findings": r.critical_findings,
        "created_at": r.created_at, "completed_at": r.completed_at,
    } for r in runs]


@router.post("")
async def create_run(req: TestRunCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from app.models.agent import Agent

    agent = db.query(Agent).filter(Agent.id == req.agent_id, Agent.user_id == current_user.id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    # If no scenario_ids provided (or empty), run ALL scenarios for this agent
    scenario_ids = req.scenario_ids
    if not scenario_ids:
        scenarios = db.query(Scenario).filter(
            Scenario.agent_id == req.agent_id,
            Scenario.user_id == current_user.id,
        ).all()
        scenario_ids = [s.id for s in scenarios]

    if not scenario_ids:
        raise HTTPException(
            status_code=400,
            detail="No scenarios found for this agent. Generate scenarios first using 'Generate Tests' or the AI Assistant."
        )

    run = TestRun(
        user_id=current_user.id,
        agent_id=req.agent_id,
        name=req.name or f"Test Run — {agent.name}",
        status="running",
        total_scenarios=len(scenario_ids),
    )
    db.add(run)
    db.flush()
    for sid in scenario_ids:
        result = TestResult(test_run_id=run.id, scenario_id=sid, status="queued")
        db.add(result)
    db.commit()
    db.refresh(run)

    from app.services.test_executor import execute_test_run_sync
    execute_test_run_sync(run.id, db)
    db.refresh(run)

    return {
        "id": run.id, "name": run.name, "status": run.status,
        "total_scenarios": run.total_scenarios, "passed": run.passed,
        "failed": run.failed, "reliability_score": run.reliability_score,
        "security_score": run.security_score, "critical_findings": run.critical_findings,
    }


@router.get("/{run_id}")
async def get_run(run_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    run = db.query(TestRun).filter(TestRun.id == run_id, TestRun.user_id == current_user.id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Not found")

    results = []
    for r in run.results:
        results.append({
            "id": r.id,
            "scenario_id": r.scenario_id,
            "scenario_name": r.scenario.name if r.scenario else None,
            "scenario_category": r.scenario.category if r.scenario else None,
            "scenario_risk": r.scenario.risk_level if r.scenario else None,
            "status": r.status,
            "error_message": r.error_message,
            "latency_ms": r.latency_ms,
            "token_usage": r.token_usage,
            "estimated_cost": r.estimated_cost,
            "started_at": r.started_at,
            "completed_at": r.completed_at,
        })

    # Aggregate findings
    all_findings = []
    for r in run.results:
        for f in r.findings:
            all_findings.append({
                "id": f.id,
                "title": f.title,
                "severity": f.severity,
                "description": f.description,
                "expected_behavior": f.expected_behavior,
                "evidence": f.evidence,
                "recommended_fix": f.recommended_fix,
                "scenario_name": r.scenario.name if r.scenario else None,
                "test_result_id": r.id,
            })

    return {
        "id": run.id, "name": run.name, "agent_id": run.agent_id,
        "status": run.status, "total_scenarios": run.total_scenarios,
        "passed": run.passed, "failed": run.failed, "errors": run.errors,
        "reliability_score": run.reliability_score, "security_score": run.security_score,
        "critical_findings": run.critical_findings, "high_findings": run.high_findings,
        "medium_findings": run.medium_findings, "low_findings": run.low_findings,
        "total_tokens": run.total_tokens, "estimated_cost": run.estimated_cost,
        "created_at": run.created_at, "completed_at": run.completed_at,
        "results": results,
        "findings": all_findings,
    }


@router.get("/{run_id}/results/{result_id}/trace")
async def get_trace(run_id: int, result_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    run = db.query(TestRun).filter(TestRun.id == run_id, TestRun.user_id == current_user.id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Not found")
    result = db.query(TestResult).filter(TestResult.id == result_id, TestResult.test_run_id == run_id).first()
    if not result:
        raise HTTPException(status_code=404, detail="Not found")

    events = [{
        "id": e.id, "sequence": e.sequence, "event_type": e.event_type,
        "actor": e.actor, "content": e.content,
        "tool_name": e.tool_name, "tool_args": e.tool_args,
        "tool_result": e.tool_result, "is_blocked": e.is_blocked,
        "latency_ms": e.latency_ms, "token_usage": e.token_usage,
    } for e in result.execution_events]

    findings = [{
        "id": f.id, "title": f.title, "severity": f.severity,
        "description": f.description, "evidence": f.evidence,
        "expected_behavior": f.expected_behavior, "actual_behavior": f.actual_behavior,
        "recommended_fix": f.recommended_fix, "confidence": f.confidence,
    } for f in result.findings]

    return {
        "result_id": result.id,
        "scenario_name": result.scenario.name if result.scenario else None,
        "scenario_category": result.scenario.category if result.scenario else None,
        "status": result.status,
        "latency_ms": result.latency_ms,
        "token_usage": result.token_usage,
        "estimated_cost": result.estimated_cost,
        "events": events,
        "findings": findings,
    }
