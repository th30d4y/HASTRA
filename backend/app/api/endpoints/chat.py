from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.chat_session import ChatSession, ChatMessage

router = APIRouter()


class MessageIn(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[MessageIn]
    session_id: Optional[int] = None


# ── Sessions ──────────────────────────────────────────────────────────────────

@router.get("/sessions")
async def list_sessions(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    sessions = (
        db.query(ChatSession)
        .filter(ChatSession.user_id == current_user.id)
        .order_by(ChatSession.updated_at.desc())
        .all()
    )
    return [
        {"id": s.id, "title": s.title, "message_count": len(s.messages), "created_at": s.created_at, "updated_at": s.updated_at}
        for s in sessions
    ]


@router.post("/sessions")
async def create_session(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    session = ChatSession(user_id=current_user.id, title="New Chat")
    db.add(session)
    db.commit()
    db.refresh(session)
    return {"id": session.id, "title": session.title, "created_at": session.created_at}


@router.get("/sessions/{session_id}")
async def get_session(session_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    session = db.query(ChatSession).filter(ChatSession.id == session_id, ChatSession.user_id == current_user.id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "id": session.id,
        "title": session.title,
        "created_at": session.created_at,
        "messages": [
            {"id": m.id, "role": m.role, "content": m.content, "tool_calls": m.tool_calls, "created_at": m.created_at}
            for m in session.messages
        ],
    }


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    session = db.query(ChatSession).filter(ChatSession.id == session_id, ChatSession.user_id == current_user.id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    db.delete(session)
    db.commit()
    return {"status": "deleted"}


# ── Chat ──────────────────────────────────────────────────────────────────────

@router.post("")
async def chat_endpoint(req: ChatRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from app.services.bedrock_chat import chat
    from datetime import datetime, timezone

    # Get or create session
    if req.session_id:
        session = db.query(ChatSession).filter(ChatSession.id == req.session_id, ChatSession.user_id == current_user.id).first()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
    else:
        session = ChatSession(user_id=current_user.id, title="New Chat")
        db.add(session)
        db.flush()

    messages = [{"role": m.role, "content": m.content} for m in req.messages]

    # Save the last user message (the new one)
    last_user = next((m for m in reversed(req.messages) if m.role == "user"), None)
    if last_user:
        db.add(ChatMessage(session_id=session.id, role="user", content=last_user.content))

        # Auto-title session from first user message
        if len(session.messages) <= 1 and session.title == "New Chat":
            session.title = last_user.content[:60].strip()

    try:
        result = chat(messages, current_user.id, db)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Chat error: {str(e)}")

    # Save assistant response
    db.add(ChatMessage(
        session_id=session.id,
        role="assistant",
        content=result["response"],
        tool_calls=result["tool_calls"] or None,
    ))
    session.updated_at = datetime.now(timezone.utc)
    db.commit()

    return {
        "response": result["response"],
        "tool_calls": result["tool_calls"],
        "screenshots": result.get("screenshots", {}),  # session_id → latest screenshot b64
        "session_id": session.id,
    }
