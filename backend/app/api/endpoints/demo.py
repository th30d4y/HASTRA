from fastapi import APIRouter

router = APIRouter()


@router.post("/setup")
async def setup_demo():
    return {"status": "disabled", "message": "Demo mode is disabled. Create agents and scenarios using the AI Assistant or UI."}


@router.post("/run")
async def run_demo():
    return {"status": "disabled", "message": "Demo mode is disabled. Create agents and scenarios using the AI Assistant or UI."}
