from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.finding import Finding
from app.models.test_run import TestRun, TestResult

router = APIRouter()


class FindingUpdate(BaseModel):
    status: Optional[str] = None  # open, resolved, accepted_risk


@router.get("")
async def list_findings(
    severity: Optional[str] = None,
    agent_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Finding).join(TestRun, Finding.test_run_id == TestRun.id).filter(TestRun.user_id == current_user.id)
    if severity:
        q = q.filter(Finding.severity == severity.upper())
    if agent_id:
        q = q.filter(TestRun.agent_id == agent_id)
    findings = q.order_by(Finding.created_at.desc()).limit(200).all()
    return [_finding_dict(f) for f in findings]


@router.get("/{finding_id}")
async def get_finding(finding_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    f = db.query(Finding).join(TestRun, Finding.test_run_id == TestRun.id).filter(
        Finding.id == finding_id,
        TestRun.user_id == current_user.id,
    ).first()
    if not f:
        raise HTTPException(status_code=404, detail="Finding not found")

    # Get related trace events
    trace_events = []
    if f.test_result_id:
        result = db.query(TestResult).filter(TestResult.id == f.test_result_id).first()
        if result:
            trace_events = [{
                "sequence": e.sequence, "event_type": e.event_type,
                "actor": e.actor, "content": e.content,
                "tool_name": e.tool_name, "tool_args": e.tool_args,
                "tool_result": e.tool_result, "is_blocked": e.is_blocked,
            } for e in result.execution_events[:20]]

    detail = _finding_dict(f)
    detail["trace_events"] = trace_events
    detail["actual_behavior"] = f.actual_behavior

    # Agent and scenario context
    run = db.query(TestRun).filter(TestRun.id == f.test_run_id).first()
    if run and run.agent:
        detail["agent_name"] = run.agent.name
        detail["agent_id"] = run.agent_id
    if f.test_result and f.test_result.scenario:
        detail["scenario_name"] = f.test_result.scenario.name
        detail["scenario_category"] = f.test_result.scenario.category
        detail["scenario_user_input"] = f.test_result.scenario.user_input
        detail["scenario_expected_behavior"] = f.test_result.scenario.expected_behavior

    return detail


def _finding_dict(f: Finding) -> dict:
    return {
        "id": f.id,
        "test_run_id": f.test_run_id,
        "test_result_id": f.test_result_id,
        "title": f.title,
        "severity": f.severity,
        "description": f.description,
        "evidence": f.evidence,
        "expected_behavior": f.expected_behavior,
        "recommended_fix": f.recommended_fix,
        "confidence": f.confidence,
        "is_regression": f.is_regression,
        "created_at": f.created_at,
    }
