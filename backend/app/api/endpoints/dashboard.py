from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.agent import Agent
from app.models.test_run import TestRun, TestResult
from app.models.finding import Finding
from app.models.scenario import Scenario

router = APIRouter()


@router.get("")
async def get_dashboard(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    agents = db.query(Agent).filter(Agent.user_id == current_user.id).all()
    runs = db.query(TestRun).filter(TestRun.user_id == current_user.id).order_by(TestRun.created_at.desc()).all()
    scenarios = db.query(Scenario).filter(Scenario.user_id == current_user.id).count()
    findings = db.query(Finding).join(TestRun, Finding.test_run_id == TestRun.id).filter(TestRun.user_id == current_user.id).all()

    completed_runs = [r for r in runs if r.status == "completed"]
    total_passed = sum(r.passed or 0 for r in completed_runs)
    total_tests = sum(r.total_scenarios or 0 for r in completed_runs)
    pass_rate = round(total_passed / total_tests * 100, 1) if total_tests > 0 else 0

    avg_reliability = None
    avg_security = None
    if completed_runs:
        rel_scores = [r.reliability_score for r in completed_runs if r.reliability_score is not None]
        sec_scores = [r.security_score for r in completed_runs if r.security_score is not None]
        avg_reliability = round(sum(rel_scores) / len(rel_scores), 1) if rel_scores else None
        avg_security = round(sum(sec_scores) / len(sec_scores), 1) if sec_scores else None

    recent_runs = runs[:5]

    chart_data = []
    for run in reversed(completed_runs[-10:]):
        chart_data.append({
            "date": run.created_at.strftime("%b %d") if run.created_at else "",
            "passed": run.passed or 0,
            "failed": run.failed or 0,
            "reliability": run.reliability_score,
        })

    severity_dist = {
        "CRITICAL": sum(1 for f in findings if f.severity == "CRITICAL"),
        "HIGH": sum(1 for f in findings if f.severity == "HIGH"),
        "MEDIUM": sum(1 for f in findings if f.severity == "MEDIUM"),
        "LOW": sum(1 for f in findings if f.severity == "LOW"),
    }

    return {
        "stats": {
            "agents": len(agents),
            "test_runs": len(runs),
            "scenarios": scenarios,
            "pass_rate": pass_rate,
            "total_tests": total_tests,
            "critical_findings": sum(1 for f in findings if f.severity == "CRITICAL"),
            "high_findings": sum(1 for f in findings if f.severity == "HIGH"),
            "reliability_score": avg_reliability,
            "security_score": avg_security,
        },
        "recent_runs": [
            {
                "id": r.id,
                "name": r.name,
                "agent_name": r.agent.name if r.agent else None,
                "status": r.status,
                "total_scenarios": r.total_scenarios,
                "passed": r.passed,
                "failed": r.failed,
                "reliability_score": r.reliability_score,
                "security_score": r.security_score,
                "critical_findings": r.critical_findings,
                "created_at": r.created_at,
            }
            for r in recent_runs
        ],
        "chart_data": chart_data,
        "severity_distribution": severity_dist,
        "recent_findings": [
            {
                "id": f.id,
                "title": f.title,
                "severity": f.severity,
                "description": f.description,
                "created_at": f.created_at,
            }
            for f in sorted(findings, key=lambda x: x.created_at or "", reverse=True)[:5]
        ],
    }
