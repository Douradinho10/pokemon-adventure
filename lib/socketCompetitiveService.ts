"use client"

import { io } from "socket.io-client"
import { createMultiplayerRoom, joinMultiplayerRoom, type MultiplayerRoom } from "./socketMultiplayerService"
import { joinCompetitiveQueue as joinLegacyCompetitiveQueue } from "./multiplayerService"

interface SocketQueueParams {
  maxPlayers: 2 | 3
  userId: string
  displayName: string
}

type SocketRole = "host" | "guest"

interface SocketQueueResult {
  ok: boolean
  room?: MultiplayerRoom
  message?: string
}

const DEFAULT_REMOTE_SOCKET_SERVER_URL = "https://pokemon-adventure-socket.onrender.com"
const SOCKET_SERVER_URL = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || DEFAULT_REMOTE_SOCKET_SERVER_URL

function resolveLocalSocketHostname() {
  if (typeof window === "undefined") {
    return "127.0.0.1"
  }

  const hostname = window.location.hostname.toLowerCase()
  if (hostname === "localhost" || hostname === "0.0.0.0") {
    return "127.0.0.1"
  }

  return window.location.hostname
}

function isLocalDevelopmentHost() {
  if (typeof window === "undefined") {
    return false
  }

  const hostname = window.location.hostname.toLowerCase()
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" || hostname.endsWith(".local")
}

function canUseSocketTransport() {
  return Boolean(resolveSocketServerUrl())
}

function resolveSocketServerUrl() {
  if (typeof window === "undefined") {
    return SOCKET_SERVER_URL
  }

  if (isLocalDevelopmentHost()) {
    const currentPort = Number(window.location.port)
    const socketPort = Number.isFinite(currentPort) && currentPort >= 3000 && currentPort < 4000 ? currentPort + 1000 : 4001
    const hostname = resolveLocalSocketHostname()
    return `${window.location.protocol}//${hostname}:${socketPort}`
  }

  return SOCKET_SERVER_URL
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

export async function joinCompetitiveQueueWithSocket(params: SocketQueueParams): Promise<SocketQueueResult> {
  if (typeof window === "undefined") {
    return { ok: false, message: "Socket disponivel apenas no browser" }
  }

  if (!canUseSocketTransport()) {
    return await joinLegacyCompetitiveQueue(params)
  }

  return new Promise<SocketQueueResult>((resolve) => {
    const socketServerUrl = resolveSocketServerUrl()
    if (!socketServerUrl) {
      resolve({ ok: false, message: "Socket.io indisponivel neste ambiente" })
      return
    }

    const socket = io(socketServerUrl, {
      transports: ["polling", "websocket"],
      timeout: 5000,
      reconnection: true,
      reconnectionAttempts: 2,
    })

    let resolved = false
    let matchId: string | null = null
    let role: SocketRole | null = null
    let fallbackStarted = false
    const failSafeTimeoutId = window.setTimeout(() => {
      void fallbackToLegacy()
    }, 12000)

    const fallbackToLegacy = async () => {
      if (resolved || fallbackStarted) {
        return
      }

      fallbackStarted = true
      window.clearTimeout(failSafeTimeoutId)
      socket.disconnect()

      try {
        resolve(await joinLegacyCompetitiveQueue(params))
      } catch (error) {
        resolve({
          ok: false,
          message: error instanceof Error ? error.message : "Falha ao entrar na fila competitiva",
        })
      }
    }

    const finish = (result: SocketQueueResult) => {
      if (resolved) {
        return
      }
      resolved = true
      window.clearTimeout(failSafeTimeoutId)
      socket.disconnect()
      resolve(result)
    }

    const createRoomAsHost = async () => {
      try {
        const createdRoom = await createMultiplayerRoom({
          hostUserId: params.userId,
          hostDisplayName: params.displayName,
          maxPlayers: params.maxPlayers,
          mode: "competitive",
          visibility: "private",
        })

        socket.emit("competitive:room-created", {
          matchId,
          roomId: createdRoom.id,
        })

        finish({ ok: true, room: createdRoom })
      } catch (error) {
        finish({
          ok: false,
          message: error instanceof Error ? error.message : "Falha ao criar sala via websocket",
        })
      }
    }

    const joinRoomAsGuest = async (roomId: string) => {
      for (let attempt = 0; attempt < 20; attempt++) {
        const joinResult = await joinMultiplayerRoom({
          roomId,
          userId: params.userId,
          displayName: params.displayName,
        })

        if (joinResult.ok && joinResult.room) {
          finish({ ok: true, room: joinResult.room })
          return
        }

        await delay(120)
      }

      finish({ ok: false, message: "Falha ao entrar na sala criada via websocket" })
    }

    socket.on("connect", () => {
      socket.emit("competitive:enqueue", {
        maxPlayers: params.maxPlayers,
        userId: params.userId,
        displayName: params.displayName,
      })
    })

    socket.on("competitive:matched", async (payload: { matchId: string; role: SocketRole }) => {
      matchId = payload.matchId
      role = payload.role

      if (role === "host") {
        await createRoomAsHost()
      }
    })

    socket.on("competitive:room-ready", async (payload: { matchId: string; roomId: string }) => {
      if (!matchId || payload.matchId !== matchId || role !== "guest") {
        return
      }

      await joinRoomAsGuest(payload.roomId)
    })

    socket.on("competitive:error", (payload: { message?: string }) => {
      if (payload?.message && payload.message.toLowerCase().includes("indispon")) {
        void fallbackToLegacy()
        return
      }

      finish({ ok: false, message: payload?.message || "Erro de matchmaking websocket" })
    })

    socket.on("connect_error", () => {
      void fallbackToLegacy()
    })
  })
}
