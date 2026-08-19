"""
Initialize the database: create tables, seed providers, failure categories, and admin user.
Run: python scripts/init_db.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import engine, SessionLocal, Base
from app.core.security import get_password_hash
from app.core.config import settings
from app.models import User, Provider
from app.models.finding import FailureCategory

PROVIDERS = [
    {"name": "openrouter", "display_name": "OpenRouter", "provider_type": "openrouter", "supports_streaming": True},
    {"name": "anthropic", "display_name": "Anthropic", "provider_type": "anthropic", "supports_streaming": True},
    {"name": "openai", "display_name": "OpenAI", "provider_type": "openai", "supports_streaming": True},
    {"name": "google", "display_name": "Google Gemini", "provider_type": "google", "supports_streaming": True},
    {"name": "bedrock", "display_name": "Amazon Bedrock", "provider_type": "bedrock", "supports_streaming": True},
    {"name": "ollama", "display_name": "Ollama (Local)", "provider_type": "ollama", "supports_streaming": True},
    {"name": "openai_compatible", "display_name": "OpenAI-Compatible API", "provider_type": "openai_compatible", "supports_streaming": True},
]

FAILURE_CATEGORIES = [
    {"name": "task_failure", "display_name": "Task Failure", "category_type": "reliability", "severity_default": "HIGH"},
    {"name": "hallucination", "display_name": "Hallucination", "category_type": "reliability", "severity_default": "MEDIUM"},
    {"name": "goal_drift", "display_name": "Goal Drift", "category_type": "reliability", "severity_default": "HIGH"},
    {"name": "incorrect_tool_selection", "display_name": "Incorrect Tool Selection", "category_type": "reliability", "severity_default": "MEDIUM"},
    {"name": "incorrect_tool_args", "display_name": "Incorrect Tool Arguments", "category_type": "reliability", "severity_default": "MEDIUM"},
    {"name": "tool_loop", "display_name": "Tool Loop", "category_type": "reliability", "severity_default": "HIGH"},
    {"name": "timeout", "display_name": "Timeout", "category_type": "reliability", "severity_default": "MEDIUM"},
    {"name": "instruction_override", "display_name": "Instruction Override", "category_type": "security", "severity_default": "HIGH"},
    {"name": "prompt_injection", "display_name": "Prompt Injection", "category_type": "security", "severity_default": "CRITICAL"},
    {"name": "unauthorized_tool_use", "display_name": "Unauthorized Tool Use", "category_type": "security", "severity_default": "CRITICAL"},
    {"name": "privilege_escalation", "display_name": "Privilege Escalation", "category_type": "security", "severity_default": "CRITICAL"},
    {"name": "sensitive_data_exposure", "display_name": "Sensitive Data Exposure", "category_type": "security", "severity_default": "HIGH"},
    {"name": "destructive_action", "display_name": "Destructive Action", "category_type": "security", "severity_default": "CRITICAL"},
    {"name": "data_exfiltration", "display_name": "Data Exfiltration", "category_type": "security", "severity_default": "CRITICAL"},
]


def init():
    print("Creating database tables...")
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        # Seed providers
        for p_data in PROVIDERS:
            existing = db.query(Provider).filter(Provider.name == p_data["name"]).first()
            if not existing:
                db.add(Provider(**p_data))
                print(f"  + Provider: {p_data['display_name']}")

        # Seed failure categories
        for fc_data in FAILURE_CATEGORIES:
            existing = db.query(FailureCategory).filter(FailureCategory.name == fc_data["name"]).first()
            if not existing:
                db.add(FailureCategory(**fc_data))
                print(f"  + Category: {fc_data['display_name']}")

        # Create admin user
        admin = db.query(User).filter(User.email == settings.ADMIN_EMAIL).first()
        if not admin:
            admin = User(
                email=settings.ADMIN_EMAIL,
                hashed_password=get_password_hash(settings.ADMIN_PASSWORD),
                full_name="HASTRA Admin",
                role="admin",
                is_active=True,
                is_verified=True,
            )
            db.add(admin)
            print(f"  + Admin user: {settings.ADMIN_EMAIL}")

        db.commit()
        print("Database initialized successfully.")

    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    init()
