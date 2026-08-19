from fastapi import APIRouter
from .endpoints import auth, users, agents, providers, tools, mcp, recordings, scenarios, test_runs, findings, reports, admin, demo, dashboard, chat

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
api_router.include_router(agents.router, prefix="/agents", tags=["agents"])
api_router.include_router(providers.router, prefix="/providers", tags=["providers"])
api_router.include_router(tools.router, prefix="/tools", tags=["tools"])
api_router.include_router(mcp.router, prefix="/mcp", tags=["mcp"])
api_router.include_router(recordings.router, prefix="/recordings", tags=["recordings"])
api_router.include_router(scenarios.router, prefix="/scenarios", tags=["scenarios"])
api_router.include_router(test_runs.router, prefix="/test-runs", tags=["test-runs"])
api_router.include_router(findings.router, prefix="/findings", tags=["findings"])
api_router.include_router(reports.router, prefix="/reports", tags=["reports"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
api_router.include_router(demo.router, prefix="/demo", tags=["demo"])
api_router.include_router(chat.router, prefix="/chat", tags=["chat"])
