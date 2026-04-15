"use client"

import { io } from "socket.io-client"
import { createMultiplayerRoom, joinMultiplayerRoom, type MultiplayerRoom } from "./multiplayerService"

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

const SOCKET_SERVER_URL = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || "http://localhost:4001"

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

export async function joinCompetitiveQueueWithSocket(params: SocketQueueParams): Promise<SocketQueueResult> {
  if (typeof window === "undefined") {
    return { ok: false, message: "Socket disponivel apenas no browser" }
  }

  return new Promise<SocketQueueResult>((resolve) => {
    const socket = io(SOCKET_SERVER_URL, {
      transports: ["websocket", "polling"],
      timeout: 5000,
      reconnection: true,
      reconnectionAttempts: 2,
    })

    let resolved = false
    let matchId: string | null = null
    let role: SocketRole | null = null
    const failSafeTimeoutId = window.setTimeout(() => {
      finish({ ok: false, message: "WebSocket indisponivel" })
    }, 12000)

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
      finish({ ok: false, message: payload?.message || "Erro de matchmaking websocket" })
    })

    socket.on("connect_error", () => {
      finish({ ok: false, message: "WebSocket indisponivel" })
    })
  })
}
