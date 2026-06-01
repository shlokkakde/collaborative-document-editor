# Vercel Deployment

This repository is configured to deploy the React/Vite frontend to Vercel.

The Django Channels backend is not deployed to Vercel by this config. Vercel Functions are request/response functions and do not support acting as a WebSocket server. Host the Django ASGI backend on a long-running platform such as Render, Railway, Fly.io, a VPS, or another server that can run Daphne/Uvicorn plus Redis.

References:

- Vercel project configuration: https://vercel.com/docs/project-configuration/vercel-json
- Vercel Python runtime: https://vercel.com/docs/functions/runtimes/python
- Vercel WebSocket support note: https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections

## Frontend on Vercel

Connect the GitHub repository to Vercel. The root `vercel.json` handles the frontend build and works whether Vercel builds from the repo root, `frontend`, or `backend`:

- Install command: `if [ -d frontend ]; then cd frontend && npm install; elif [ -d ../frontend ]; then cd ../frontend && npm install; else npm install; fi`
- Build command: `if [ -d frontend ]; then cd frontend && npm run build && rm -rf ../dist && cp -R dist ../dist; elif [ -d ../frontend ]; then cd ../frontend && npm run build && rm -rf ../backend/dist && cp -R dist ../backend/dist; else npm run build; fi`
- Output directory: `dist`
- SPA route rewrite for `/documents/:id`

## Required Vercel Environment Variables

Set these in Vercel Project Settings -> Environment Variables:

```text
VITE_API_BASE_URL=https://your-django-backend.example.com
```

Optional, only when the WebSocket server is on a different origin:

```text
VITE_WS_BASE_URL=wss://your-django-websocket.example.com
```

If `VITE_WS_BASE_URL` is omitted, the frontend derives the WebSocket origin from `VITE_API_BASE_URL`.

## Backend Environment Variables

On the backend host, configure:

```text
DJANGO_SECRET_KEY=...
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=your-backend.example.com
CORS_ALLOWED_ORIGINS=https://your-vercel-app.vercel.app
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
```

Also include your production Vercel domain in `CORS_ALLOWED_ORIGINS`, otherwise browser requests from the deployed frontend will be blocked.

## Render Backend Settings

Use these settings for the Render Web Service:

```text
Root Directory: backend
Runtime: Python
Build Command: pip install -r requirements.txt
Start Command: bash start.sh
```

The backend includes `backend/.python-version` to pin Render to Python 3.13. If Render still builds with Python 3.14, add this environment variable in Render:

```text
PYTHON_VERSION=3.13.5
```

Do not use `gunicorn` for this backend. This project uses Django Channels, so Render must start Daphne through `bash start.sh`.

## Local Check Before Deploying

```powershell
cd frontend
npm ci
npm run build
```

The generated frontend uses the Vite build-time environment variables, so redeploy Vercel after changing `VITE_API_BASE_URL` or `VITE_WS_BASE_URL`.
