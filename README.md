# Real-Time Collaborative Document Editor

A full-stack collaborative document editor built with React, Django, Django Channels, WebSockets, and PostgreSQL.

## Features

- Create, rename, edit, and delete documents.
- Real-time multi-user editing over WebSockets.
- Persistent document storage through Django models.
- PostgreSQL-ready configuration with a SQLite fallback for quick local demos.
- Optional Redis channel layer for multi-process WebSocket broadcasting.
- Selenium end-to-end test scaffold for two-client collaboration flows.

## Project Structure

```text
backend/    Django + Channels API and WebSocket server
frontend/   Vite + React editor client
e2e/        Selenium collaboration smoke test
```

## Run Locally

1. Start PostgreSQL and Redis:

```powershell
docker compose up -d
```

2. Create backend environment:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item ..\.env.example .env
python manage.py migrate
python manage.py runserver 8000
```

3. Start the frontend in a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

4. Open `http://localhost:5173`.

## Deploy Frontend to Vercel

This repo includes a root `vercel.json` for deploying the Vite frontend to Vercel. The Django Channels backend should run on a long-running ASGI host because Vercel Functions do not act as a WebSocket server.

See [docs/VERCEL_DEPLOYMENT.md](docs/VERCEL_DEPLOYMENT.md) for the exact Vercel environment variables and backend hosting notes.

For Render backend deployment, use `backend` as the root directory, `pip install -r requirements.txt` as the build command, and `bash start.sh` as the start command.

## Quick SQLite Demo

If you do not want to run Docker, remove or comment `DATABASE_URL` and `REDIS_URL` in `backend/.env`, then run migrations and the Django server. The app will use SQLite and the in-memory Channels layer.

## API

- `GET /api/documents/` lists documents.
- `POST /api/documents/` creates a document.
- `GET /api/documents/<id>/` loads a document.
- `PATCH /api/documents/<id>/` updates title or content.
- `DELETE /api/documents/<id>/` deletes a document.
- `WS /ws/documents/<id>/?clientId=<id>&name=<name>` joins a live editing session.

## Tests

Backend unit tests:

```powershell
cd backend
python manage.py test
```

Selenium smoke test, with backend and frontend already running:

```powershell
pip install selenium pytest
pytest e2e
```
