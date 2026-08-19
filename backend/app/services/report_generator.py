from sqlalchemy.orm import Session
from app.models.test_run import TestRun


def generate_report_content(run: TestRun, db: Session) -> tuple[dict, str]:
    findings = run.findings
    critical = [f for f in findings if f.severity == "CRITICAL"]
    high = [f for f in findings if f.severity == "HIGH"]
    medium = [f for f in findings if f.severity == "MEDIUM"]
    low = [f for f in findings if f.severity == "LOW"]

    pass_rate = (run.passed / run.total_scenarios * 100) if run.total_scenarios > 0 else 0

    content = {
        "report_version": "1.0",
        "executive_summary": {
            "agent_name": run.agent.name if run.agent else "Unknown",
            "test_date": run.created_at.isoformat() if run.created_at else None,
            "total_scenarios": run.total_scenarios,
            "pass_rate": round(pass_rate, 1),
            "reliability_score": run.reliability_score,
            "security_score": run.security_score,
            "risk_level": _overall_risk(run.critical_findings, run.high_findings),
        },
        "test_coverage": {
            "total": run.total_scenarios,
            "passed": run.passed,
            "failed": run.failed,
            "errors": run.errors,
        },
        "scores": {
            "reliability": run.reliability_score,
            "security": run.security_score,
            "components": {
                "task_success": round(pass_rate, 1),
                "tool_correctness": round(max(0, pass_rate - run.failed * 1.5), 1),
                "instruction_following": round(max(0, 100 - len([f for f in findings if "instruction" in f.title.lower()]) * 10), 1),
                "security": run.security_score,
            },
        },
        "findings": {
            "critical": [_finding_to_dict(f) for f in critical],
            "high": [_finding_to_dict(f) for f in high],
            "medium": [_finding_to_dict(f) for f in medium],
            "low": [_finding_to_dict(f) for f in low],
        },
        "statistics": {
            "total_tokens": run.total_tokens,
            "estimated_cost": run.estimated_cost,
            "duration_seconds": (run.completed_at - run.started_at).total_seconds() if run.completed_at and run.started_at else None,
        },
        "recommendations": _generate_recommendations(findings),
    }

    summary = (
        f"Tested {run.total_scenarios} scenarios with {pass_rate:.0f}% pass rate. "
        f"Reliability: {run.reliability_score}%, Security: {run.security_score}%. "
        f"Found {run.critical_findings} critical and {run.high_findings} high severity issues."
    )

    return content, summary


def _finding_to_dict(f) -> dict:
    return {
        "title": f.title,
        "severity": f.severity,
        "description": f.description,
        "evidence": f.evidence,
        "expected_behavior": f.expected_behavior,
        "actual_behavior": f.actual_behavior,
        "recommended_fix": f.recommended_fix,
        "confidence": f.confidence,
    }


def _overall_risk(critical: int, high: int) -> str:
    if critical > 0:
        return "CRITICAL"
    if high > 2:
        return "HIGH"
    if high > 0:
        return "MEDIUM"
    return "LOW"


def _generate_recommendations(findings) -> list:
    recs = []
    seen = set()
    for f in findings:
        if f.severity in ("CRITICAL", "HIGH") and f.recommended_fix and f.recommended_fix not in seen:
            seen.add(f.recommended_fix)
            recs.append({"priority": f.severity, "recommendation": f.recommended_fix, "finding": f.title})
    return recs[:10]
