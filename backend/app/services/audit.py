"""
Audit trail and structured logging service.
Called from API endpoints to record every important mutation.
Sensitive fields are automatically redacted.
"""
import json
import re
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session

# Fields that must never appear in logs
_REDACT_KEYS = re.compile(
    r'(password|api_key|secret|token|access_key|session|cookie|credential|auth)',
    re.IGNORECASE
)

# Action constants
AGENT_CREATED = "AGENT_CREATED"
AGENT_UPDATED = "AGENT_UPDATED"
AGENT_DELETED = "AGENT_DELETED"
TOOL_CREATED = "TOOL_CREATED"
TOOL_ATTACHED = "TOOL_ATTACHED"
TOOL_DELETED = "TOOL_DELETED"
MCP_ADDED = "MCP_SERVER_ADDED"
MCP_REMOVED = "MCP_SERVER_REMOVED"
PROVIDER_ADDED = "PROVIDER_ADDED"
PROVIDER_REMOVED = "PROVIDER_REMOVED"
TEST_STARTED = "TEST_STARTED"
TEST_COMPLETED = "TEST_COMPLETED"
TEST_FAILED = "TEST_FAILED"
RECORDING_STARTED = "RECORDING_STARTED"
RECORDING_STOPPED = "RECORDING_STOPPED"
REPORT_GENERATED = "REPORT_GENERATED"
LOGIN_SUCCESS = "LOGIN_SUCCESS"
LOGIN_FAILURE = "LOGIN_FAILURE"
PERMISSION_DENIED = "PERMISSION_DENIED"
SCENARIO_GENERATED = "SCENARIO_GENERATED"
SCENARIO_DELETED = "SCENARIO_DELETED"
CHAT_MESSAGE = "CHAT_MESSAGE"
BROWSER_SESSION_STARTED = "BROWSER_SESSION_STARTED"
BROWSER_SESSION_ENDED = "BROWSER_SESSION_ENDED"


def redact(data: dict) -> dict:
    """Recursively redact sensitive fields."""
    if not isinstance(data, dict):
        return data
    result = {}
    for k, v in data.items():
        if _REDACT_KEYS.search(k):
            result[k] = "[REDACTED]"
        elif isinstance(v, dict):
            result[k] = redact(v)
        elif isinstance(v, list):
            result[k] = [redact(i) if isinstance(i, dict) else i for i in v]
        else:
            result[k] = v
    return result


def log_audit(
    db: Session,
    action: str,
    user_id: int,
    resource_type: Optional[str] = None,
    resource_id: Optional[int] = None,
    status: str = "success",
    metadata: Optional[dict] = None,
    ip_address: Optional[str] = None,
):
    """Write an audit log entry."""
    from app.models.audit_log import AuditLog
    try:
        safe_meta = redact(metadata) if metadata else None
        entry = AuditLog(
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=safe_meta,
            ip_address=ip_address,
        )
        db.add(entry)
        db.commit()
    except Exception:
        db.rollback()  # audit failure must never break the main operation
