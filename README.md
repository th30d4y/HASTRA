# HASTRA

**AI Agent Security, Testing & Reliability Assurance**

HASTRA is a production-quality platform for testing, securing, and monitoring Agentic AI systems.

## Quick Start

### Development (Local)

**Prerequisites:** Node.js 20+, Python 3.12+, PostgreSQL, Redis

```bash
# 1. Clone and navigate
cd HASTRA

# 2. Backend setup
cd backend
cp .env.example .env
# Edit .env with your database credentials
pip install -r requirements.txt
python scripts/init_db.py
uvicorn main:app --reload --port 8000

# 3. Frontend setup (new terminal)
cd frontend
npm install
npm run dev
```

Open http://localhost:3000

**Default admin:** admin@hastra.dev / Admin123!

### Docker Compose

```bash
cp backend/.env.example backend/.env
docker-compose up --build
```

### Demo Mode

1. Login at http://localhost:3000/login
2. Click **Run Demo** on the dashboard
3. Watch 50 adversarial tests run against the Customer Support Agent
4. Explore findings, traces, and reliability scores

## Features

- **Agent Management** — Register and version AI agents
- **LLM Providers** — OpenRouter, Anthropic, OpenAI, Bedrock, Gemini, Ollama
- **Scenario Generator** — AI-powered adversarial test generation
- **Sandbox Execution** — Safe test execution with mock tools
- **Failure Detection** — 12+ failure categories across reliability and security
- **Reliability Scoring** — Quantified HASTRA Reliability Score
- **Regression Testing** — Compare agent versions side-by-side
- **Reports** — Professional security assessment reports
- **Recording System** — Record agent sessions and convert to scenarios

## Architecture

```
Frontend (Next.js 15) → API (FastAPI) → PostgreSQL + Redis
                                      → Scenario Engine
                                      → Sandbox Executor
                                      → Failure Classifier
                                      → Scoring Engine
```

## Environment Variables

See `backend/.env.example` for all configuration options.

## API Documentation

Available at http://localhost:8000/api/docs when backend is running.
