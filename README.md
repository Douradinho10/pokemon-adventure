# pokemon adventure

*Automatically synced with your [v0.app](https://v0.app) deployments*

[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=for-the-badge&logo=vercel)](https://vercel.com/jpdourado0210-9526s-projects/v0-pokemon-adventure)
[![Built with v0](https://img.shields.io/badge/Built%20with-v0.app-black?style=for-the-badge)](https://v0.app/chat/ePr08YMQL82)

## Overview

This repository will stay in sync with your deployed chats on [v0.app](https://v0.app).
Any changes you make to your deployed app will be automatically pushed to this repository from [v0.app](https://v0.app).

## Deployment

Your project is live at:

**[https://vercel.com/jpdourado0210-9526s-projects/v0-pokemon-adventure](https://vercel.com/jpdourado0210-9526s-projects/v0-pokemon-adventure)**

## Build your app

Continue building your app on:

**[https://v0.app/chat/ePr08YMQL82](https://v0.app/chat/ePr08YMQL82)**

## Local Dev

`pnpm dev` now starts both the Next.js app and the Socket.io server together.
If you need them separately, use `pnpm run dev:web` or `pnpm run dev:socket`.

## Production Socket.io

Socket.io rooms need a live Node server. `render.yaml` is included for a standalone Socket.io service.

Deploy `server/socket-server.js` to a host that keeps Node processes alive, then set `NEXT_PUBLIC_SOCKET_SERVER_URL` in the Vercel app to that public URL.

If the socket URL is not configured, the app falls back to Firebase RTDB rooms.

## How It Works

1. Create and modify your project using [v0.app](https://v0.app)
2. Deploy your chats from the v0 interface
3. Changes are automatically pushed to this repository
4. Vercel deploys the latest version from this repository