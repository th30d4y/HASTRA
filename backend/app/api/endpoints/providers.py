from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.security import encrypt_api_key, decrypt_api_key, mask_api_key
from app.models.user import User
from app.models.provider import Provider, ApiKey
import json

router = APIRouter()


class ApiKeyCreate(BaseModel):
    provider_id: int
    name: str
    api_key: str
    extra_config: Optional[dict] = None
    is_default: bool = False


@router.get("")
async def list_providers(db: Session = Depends(get_db)):
    providers = db.query(Provider).filter(Provider.is_active == True).all()
    return [{"id": p.id, "name": p.name, "display_name": p.display_name, "provider_type": p.provider_type, "supports_streaming": p.supports_streaming} for p in providers]


@router.get("/api-keys")
async def list_api_keys(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    keys = db.query(ApiKey).filter(ApiKey.user_id == current_user.id).all()
    return [{"id": k.id, "provider_id": k.provider_id, "name": k.name, "key_hint": k.key_hint, "is_default": k.is_default, "is_valid": k.is_valid, "created_at": k.created_at, "provider_name": k.provider.display_name if k.provider else None} for k in keys]


@router.post("/api-keys")
async def create_api_key(req: ApiKeyCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    provider = db.query(Provider).filter(Provider.id == req.provider_id).first()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    if req.is_default:
        db.query(ApiKey).filter(ApiKey.user_id == current_user.id, ApiKey.provider_id == req.provider_id).update({"is_default": False})
    key = ApiKey(
        user_id=current_user.id,
        provider_id=req.provider_id,
        name=req.name,
        encrypted_key=encrypt_api_key(req.api_key),
        key_hint=mask_api_key(req.api_key),
        is_default=req.is_default,
        extra_config=json.dumps(req.extra_config) if req.extra_config else None,
    )
    db.add(key)
    db.commit()
    db.refresh(key)
    return {"id": key.id, "provider_id": key.provider_id, "name": key.name, "key_hint": key.key_hint, "is_default": key.is_default}


@router.delete("/api-keys/{key_id}")
async def delete_api_key(key_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    key = db.query(ApiKey).filter(ApiKey.id == key_id, ApiKey.user_id == current_user.id).first()
    if not key:
        raise HTTPException(status_code=404, detail="Key not found")
    db.delete(key)
    db.commit()
    return {"status": "deleted"}


@router.post("/api-keys/{key_id}/validate")
async def validate_key(key_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    key = db.query(ApiKey).filter(ApiKey.id == key_id, ApiKey.user_id == current_user.id).first()
    if not key:
        raise HTTPException(status_code=404, detail="Key not found")
    try:
        raw_key = decrypt_api_key(key.encrypted_key)
        key.is_valid = len(raw_key) > 10
        db.commit()
        return {"is_valid": key.is_valid}
    except Exception:
        key.is_valid = False
        db.commit()
        return {"is_valid": False}


@router.get("/models/{provider_id}")
async def get_models(provider_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    provider = db.query(Provider).filter(Provider.id == provider_id).first()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    key = db.query(ApiKey).filter(ApiKey.user_id == current_user.id, ApiKey.provider_id == provider_id, ApiKey.is_default == True).first()
    if not key:
        key = db.query(ApiKey).filter(ApiKey.user_id == current_user.id, ApiKey.provider_id == provider_id).first()
    # No static/hardcoded model list. Models are fetched live from the provider API.
    if not key:
        raise HTTPException(
            status_code=400,
            detail=f"No API key configured for provider '{provider.display_name}'. Add one in Provider Settings first."
        )

    raw_key = decrypt_api_key(key.encrypted_key)

    if provider.name == "openrouter":
        try:
            import httpx
            resp = httpx.get("https://openrouter.ai/api/v1/models", headers={"Authorization": f"Bearer {raw_key}"}, timeout=15)
            resp.raise_for_status()
            return [{"id": m["id"], "name": m.get("name", m["id"]), "context_length": m.get("context_length"), "pricing": m.get("pricing")} for m in resp.json().get("data", [])]
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Failed to fetch OpenRouter models: {str(e)}")

    elif provider.name == "anthropic":
        try:
            import httpx
            resp = httpx.get("https://api.anthropic.com/v1/models", headers={"x-api-key": raw_key, "anthropic-version": "2023-06-01"}, timeout=10)
            resp.raise_for_status()
            return [{"id": m["id"], "name": m.get("display_name", m["id"])} for m in resp.json().get("data", [])]
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Failed to fetch Anthropic models: {str(e)}")

    elif provider.name == "openai" or provider.name == "openai_compatible":
        try:
            import httpx
            base_url = key.extra_config and __import__("json").loads(key.extra_config).get("base_url", "https://api.openai.com/v1") if key.extra_config else "https://api.openai.com/v1"
            resp = httpx.get(f"{base_url}/models", headers={"Authorization": f"Bearer {raw_key}"}, timeout=10)
            resp.raise_for_status()
            return [{"id": m["id"], "name": m["id"]} for m in resp.json().get("data", []) if "gpt" in m["id"] or "o1" in m["id"] or "o3" in m["id"]]
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Failed to fetch OpenAI models: {str(e)}")

    elif provider.name == "google":
        try:
            import httpx
            resp = httpx.get(f"https://generativelanguage.googleapis.com/v1beta/models?key={raw_key}", timeout=10)
            resp.raise_for_status()
            return [{"id": m["name"].split("/")[-1], "name": m.get("displayName", m["name"])} for m in resp.json().get("models", []) if "gemini" in m.get("name", "")]
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Failed to fetch Google models: {str(e)}")

    elif provider.name == "bedrock":
        try:
            import boto3, json as _json
            extra = _json.loads(key.extra_config) if key.extra_config else {}
            region = extra.get("region", "us-east-1")
            client = boto3.client(
                "bedrock", region_name=region,
                aws_access_key_id=raw_key,
                aws_secret_access_key=extra.get("secret_key", ""),
                aws_session_token=extra.get("session_token"),
            )
            resp = client.list_foundation_models()
            return [{"id": m["modelId"], "name": m.get("modelName", m["modelId"])} for m in resp.get("modelSummaries", []) if m.get("modelLifecycle", {}).get("status") == "ACTIVE"]
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Failed to fetch Bedrock models: {str(e)}")

    elif provider.name == "ollama":
        try:
            import httpx
            extra = __import__("json").loads(key.extra_config) if key.extra_config else {}
            base_url = extra.get("base_url", "http://localhost:11434")
            resp = httpx.get(f"{base_url}/api/tags", timeout=5)
            resp.raise_for_status()
            return [{"id": m["name"], "name": m["name"]} for m in resp.json().get("models", [])]
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Failed to fetch Ollama models — is Ollama running? {str(e)}")

    else:
        raise HTTPException(status_code=400, detail=f"Model listing not supported for provider '{provider.display_name}'")
