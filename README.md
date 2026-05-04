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

Deploy `server/socket-server.js` to a host that keeps Node processes alive. The app now defaults to `https://pokemon-adventure-socket.onrender.com` in production, and you can override it with `NEXT_PUBLIC_SOCKET_SERVER_URL` if you move the socket service.

If the socket server is unavailable, the app falls back to Firebase RTDB rooms.

Casual multiplayer rooms now require everyone to mark ready before the host can start the run. Ranked multiplayer stores monthly points, and surrendering or closing the browser during a run counts as a loss.

## How It Works

1. Create and modify your project using [v0.app](https://v0.app)
2. Deploy your chats from the v0 interface
3. Changes are automatically pushed to this repository
4. Vercel deploys the latest version from this repository