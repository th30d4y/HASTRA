from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.report import Report
from app.models.test_run import TestRun
import json

router = APIRouter()


class ReportCreate(BaseModel):
    test_run_id: int
    title: Optional[str] = None
    format: str = "json"


@router.post("")
async def create_report(req: ReportCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    run = db.query(TestRun).filter(TestRun.id == req.test_run_id, TestRun.user_id == current_user.id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Test run not found")
    from app.services.report_generator import generate_report_content
    content, summary = generate_report_content(run, db)
    report = Report(
        user_id=current_user.id,
        test_run_id=run.id,
        title=req.title or f"Report: {run.name}",
        format=req.format,
        content=json.dumps(content),
        summary=summary,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return {"id": report.id, "title": report.title, "summary": summary}


@router.get("")
async def list_reports(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    reports = db.query(Report).filter(Report.user_id == current_user.id).order_by(Report.created_at.desc()).all()
    return [{"id": r.id, "title": r.title, "format": r.format, "summary": r.summary, "created_at": r.created_at} for r in reports]


@router.get("/{report_id}")
async def get_report(report_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    report = db.query(Report).filter(Report.id == report_id, Report.user_id == current_user.id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Not found")
    content = json.loads(report.content) if report.content else {}
    return {"id": report.id, "title": report.title, "format": report.format, "summary": report.summary, "content": content, "created_at": report.created_at}
