"use client"

import { io, type Socket } from "socket.io-client"
import {
  createMultiplayerRoom as createLegacyMultiplayerRoom,
  getPublicCasualLobbies as getLegacyPublicCasualLobbies,
  joinCompetitiveQueue as joinLegacyCompetitiveQueue,
  joinMultiplayerRoom as joinLegacyMultiplayerRoom,
  leaveMultiplayerRoom as leaveLegacyMultiplayerRoom,
  markMultiplayerPlayerFinished as markLegacyMultiplayerPlayerFinished,
  requestMultiplayerRematch as requestLegacyMultiplayerRematch,
  startMultiplayerRoom as startLegacyMultiplayerRoom,
  subscribeMultiplayerRoom as subscribeLegacyMultiplayerRoom,
  setMultiplayerStarterMode as setLegacyMultiplayerStarterMode,
  setMultiplayerPlayerReady as setLegacyMultiplayerPlayerReady,
  updateMultiplayerPlayerWave as updateLegacyMultiplayerPlayerWave,
} from "./multiplayerService"

export type MultiplayerRoomStatus = "waiting" | "active" | "finished"
export type MultiplayerRoomMode = "competitive" | "casual"
export type MultiplayerRoomVisibility = "public" | "private"

export interface MultiplayerRoomPlayer {
  userId: string
  displayName: string
  joinedAt: number
  bestWave: number
  ready?: boolean
  finishedAt?: number
  forfeitAt?: number
}

export interface MultiplayerRoom {
  id: string
  hostUserId: string
  hostDisplayName: string
  mode: MultiplayerRoomMode
  visibility: MultiplayerRoomVisibility
  maxPlayers: 2 | 3
  status: MultiplayerRoomStatus
  createdAt: number
  startedAt?: number
  finishedAt?: number
  starterMode?: "manual" | "roulette"
  winnerUserId?: string
  winnerDisplayName?: string
  winnerReason?: "wave" | "forfeit" | "tie"
  players: Record<string, MultiplayerRoomPlayer>
}

export interface PublicCasualLobbySummary {
  id: string
  hostDisplayName: string
  maxPlayers: 2 | 3
  playersCount: number
  createdAt: number
}

const DEFAULT_REMOTE_SOCKET_SERVER_URL = "https://pokemon-adventure-socket.onrender.com"
const SOCKET_SERVER_URL = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || DEFAULT_REMOTE_SOCKET_SERVER_URL
const SOCKET_TIMEOUT_MS = 10000

function isLocalDevelopmentHost() {
  if (typeof window === "undefined") {
    return false
  }

  const hostname = window.location.hostname.toLowerCase()
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" || hostname.endsWith(".local")
}

function resolveSocketServerUrl() {
  if (typeof window === "undefined") {
    return SOCKET_SERVER_URL
  }

  if (isLocalDevelopmentHost()) {
    const currentPort = Number(window.location.port)
    const socketPort = Number.isFinite(currentPort) && currentPort >= 3000 && currentPort < 4000 ? currentPort + 1000 : 4001
    const hostname = window.location.hostname === "localhost" ? "127.0.0.1" : window.location.hostname
    return `${window.location.protocol}//${hostname}:${socketPort}`
  }

  return SOCKET_SERVER_URL
}

function canUseSocketTransport() {
  return Boolean(resolveSocketServerUrl())
}

function isSocketConnectionError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error || "").toLowerCase()
  return (
    message.includes("timeout") ||
    message.includes("connect_error") ||
    message.includes("websocket") ||
    message.includes("network") ||
    message.includes("socket.io indisponivel") ||
    message.includes("failed to fetch")
  )
}

let socketInstance: Socket | null = null

function getSocket(): Socket {
  const socketServerUrl = resolveSocketServerUrl()
  if (!socketServerUrl) {
    throw new Error("Socket.io indisponivel neste ambiente")
  }

  if (!socketInstance) {
    socketInstance = io(socketServerUrl, {
      autoConnect: false,
      transports: ["polling", "websocket"],
      timeout: SOCKET_TIMEOUT_MS,
      reconnection: true,
      reconnectionAttempts: 5,
    })
  }

  if (!socketInstance.connected && !socketInstance.active) {
    socketInstance.connect()
  }

  return socketInstance
}

async function ensureSocketConnected(): Promise<Socket> {
  if (typeof window === "undefined") {
    throw new Error("Socket.io indisponivel fora do browser")
  }

  const socket = getSocket()
  if (socket.connected) {
    return socket
  }

  return await new Promise<Socket>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup()
      reject(new Error("Socket.io demorou demasiado a responder"))
    }, SOCKET_TIMEOUT_MS)

    const onConnect = () => {
      cleanup()
      resolve(socket)
    }

    const onConnectError = (error: Error) => {
      cleanup()
      reject(error)
    }

    const cleanup = () => {
      window.clearTimeout(timeoutId)
      socket.off("connect", onConnect)
      socket.off("connect_error", onConnectError)
    }

    socket.once("connect", onConnect)
    socket.once("connect_error", onConnectError)

    if (!socket.active) {
      socket.connect()
    }
  })
}

async function emitWithAck<T>(eventName: string, payload?: unknown, timeoutMs = SOCKET_TIMEOUT_MS): Promise<T> {
  const socket = await ensureSocketConnected()

  return await new Promise<T>((resolve, reject) => {
    socket.timeout(timeoutMs).emit(eventName, payload, (error: Error | null, response: T) => {
      if (error) {
        reject(error)
        return
      }

      resolve(response)
    })
  })
}

function normalizeRoomResponse<T extends { ok: boolean; message?: string }>(response: T): T {
  return response
}

function normalizeRoomVisibility(visibility?: MultiplayerRoomVisibility): MultiplayerRoomVisibility {
  return visibility === "public" ? "public" : "private"
}

export async function createMultiplayerRoom(params: {
  hostUserId: string
  hostDisplayName: string
  maxPlayers: 2 | 3
  mode: MultiplayerRoomMode
  visibility?: MultiplayerRoomVisibility
}): Promise<MultiplayerRoom> {
  if (canUseSocketTransport()) {
    try {
      const response = normalizeRoomResponse(
        await emitWithAck<{ ok: boolean; room?: MultiplayerRoom; message?: string }>("multiplayer:room:create", {
          hostUserId: params.hostUserId,
          hostDisplayName: params.hostDisplayName,
          maxPlayers: params.maxPlayers,
          mode: params.mode,
          visibility: normalizeRoomVisibility(params.visibility),
        }),
      )

      if (!response.ok || !response.room) {
        throw new Error(response.message || "Nao foi possivel criar a sala")
      }

      return response.room
    } catch (error) {
      if (!isSocketConnectionError(error)) {
        throw error
      }
    }
  }

  return await createLegacyMultiplayerRoom(params)
}

export async function joinMultiplayerRoom(params: {
  roomId: string
  userId: string
  displayName: string
}): Promise<{ ok: boolean; room?: MultiplayerRoom; message?: string }> {
  if (canUseSocketTransport()) {
    try {
      const response = await emitWithAck<{ ok: boolean; room?: MultiplayerRoom; message?: string }>("multiplayer:room:join", {
        roomId: params.roomId.trim(),
        userId: params.userId,
        displayName: params.displayName,
      })

      return normalizeRoomResponse(response)
    } catch (error) {
      if (!isSocketConnectionError(error)) {
        throw error
      }
    }
  }

  return await joinLegacyMultiplayerRoom(params)
}

export async function leaveMultiplayerRoom(roomId: string, userId: string): Promise<void> {
  if (canUseSocketTransport()) {
    try {
      await emitWithAck<{ ok: boolean; message?: string }>("multiplayer:room:leave", {
        roomId: roomId.trim(),
        userId,
      })
      return
    } catch (error) {
      if (!isSocketConnectionError(error)) {
        throw error
      }
    }
  }

  await leaveLegacyMultiplayerRoom(roomId, userId)
}

export async function startMultiplayerRoom(roomId: string, hostUserId: string): Promise<{ ok: boolean; message?: string }> {
  if (canUseSocketTransport()) {
    try {
      const response = await emitWithAck<{ ok: boolean; message?: string }>("multiplayer:room:start", {
        roomId: roomId.trim(),
        hostUserId,
      })

      return normalizeRoomResponse(response)
    } catch (error) {
      if (!isSocketConnectionError(error)) {
        throw error
      }
    }
  }

  return await startLegacyMultiplayerRoom(roomId, hostUserId)
}

export async function updateMultiplayerPlayerWave(params: {
  roomId: string
  userId: string
  displayName: string
  wave: number
}): Promise<void> {
  if (canUseSocketTransport()) {
    try {
      await emitWithAck<{ ok: boolean; message?: string }>("multiplayer:room:update-wave", {
        roomId: params.roomId.trim(),
        userId: params.userId,
        displayName: params.displayName,
        wave: Math.max(0, params.wave),
      })
      return
    } catch (error) {
      if (!isSocketConnectionError(error)) {
        throw error
      }
    }
  }

  await updateLegacyMultiplayerPlayerWave(params)
}

export async function markMultiplayerPlayerFinished(params: {
  roomId: string
  userId: string
  wave: number
}): Promise<void> {
  if (canUseSocketTransport()) {
    try {
      await emitWithAck<{ ok: boolean; message?: string }>("multiplayer:room:finish-player", {
        roomId: params.roomId.trim(),
        userId: params.userId,
        wave: Math.max(0, params.wave),
      })
      return
    } catch (error) {
      if (!isSocketConnectionError(error)) {
        throw error
      }
    }
  }

  await markLegacyMultiplayerPlayerFinished(params)
}

export async function requestMultiplayerRematch(params: {
  roomId: string
  hostUserId: string
}): Promise<{ ok: boolean; message?: string }> {
  if (canUseSocketTransport()) {
    try {
      const response = await emitWithAck<{ ok: boolean; message?: string }>("multiplayer:room:rematch", {
        roomId: params.roomId.trim(),
        hostUserId: params.hostUserId,
      })

      return normalizeRoomResponse(response)
    } catch (error) {
      if (!isSocketConnectionError(error)) {
        throw error
      }
    }
  }

  return await requestLegacyMultiplayerRematch(params)
}

export async function setMultiplayerPlayerReady(params: {
  roomId: string
  userId: string
  ready: boolean
}): Promise<void> {
  if (canUseSocketTransport()) {
    try {
      await emitWithAck<{ ok: boolean; message?: string }>("multiplayer:room:set-ready", {
        roomId: params.roomId.trim(),
        userId: params.userId,
        ready: params.ready,
      })
      return
    } catch (error) {
      if (!isSocketConnectionError(error)) {
        throw error
      }
    }
  }

  await setLegacyMultiplayerPlayerReady(params)
}

export async function setMultiplayerStarterMode(params: {
  roomId: string
  userId: string
  starterMode: "manual" | "roulette"
}): Promise<void> {
  if (canUseSocketTransport()) {
    try {
      await emitWithAck<{ ok: boolean; message?: string }>("multiplayer:room:set-starter-mode", {
        roomId: params.roomId.trim(),
        userId: params.userId,
        starterMode: params.starterMode,
      })
      return
    } catch (error) {
      if (!isSocketConnectionError(error)) {
        throw error
      }
    }
  }

  await setLegacyMultiplayerStarterMode(params)
}

export function subscribeMultiplayerRoom(
  roomId: string,
  onRoomUpdate: (room: MultiplayerRoom | null) => void,
  onError?: (error: unknown) => void,
): () => void {
  if (!canUseSocketTransport()) {
    return subscribeLegacyMultiplayerRoom(roomId, onRoomUpdate, onError)
  }

  let socket: Socket
  try {
    socket = getSocket()
  } catch (error) {
    return subscribeLegacyMultiplayerRoom(roomId, onRoomUpdate, onError)
  }

  const normalizedRoomId = roomId.trim()
  let active = true
  let legacyUnsubscribe: (() => void) | null = null

  const handleRoomUpdate = (payload: { roomId?: string; room?: MultiplayerRoom | null }) => {
    if (!active || payload.roomId !== normalizedRoomId) {
      return
    }

    onRoomUpdate(payload.room || null)
  }

  const handleRoomDeleted = (payload: { roomId?: string }) => {
    if (!active || payload.roomId !== normalizedRoomId) {
      return
    }

    onRoomUpdate(null)
  }

  socket.on("multiplayer:room:update", handleRoomUpdate)
  socket.on("multiplayer:room:deleted", handleRoomDeleted)

  void emitWithAck<{ ok: boolean; room?: MultiplayerRoom | null; message?: string }>("multiplayer:room:subscribe", {
    roomId: normalizedRoomId,
  })
    .then((response) => {
      if (!active) {
        return
      }

      if (!response.ok) {
        onError?.(new Error(response.message || "Nao foi possivel sincronizar a sala"))
        return
      }

      onRoomUpdate(response.room || null)
    })
    .catch((error) => {
      if (!active) {
        return
      }

      if (isSocketConnectionError(error)) {
        socket.off("multiplayer:room:update", handleRoomUpdate)
        socket.off("multiplayer:room:deleted", handleRoomDeleted)
        socket.emit("multiplayer:room:unsubscribe", {
          roomId: normalizedRoomId,
        })
        legacyUnsubscribe = subscribeLegacyMultiplayerRoom(roomId, onRoomUpdate, onError)
        return
      }

      onError?.(error)
    })

  return () => {
    active = false
    socket.off("multiplayer:room:update", handleRoomUpdate)
    socket.off("multiplayer:room:deleted", handleRoomDeleted)
    socket.emit("multiplayer:room:unsubscribe", {
      roomId: normalizedRoomId,
    })
    legacyUnsubscribe?.()
  }
}

export async function getPublicCasualLobbies(limitCount = 30): Promise<PublicCasualLobbySummary[]> {
  if (canUseSocketTransport()) {
    try {
      const response = await emitWithAck<{ ok: boolean; lobbies?: PublicCasualLobbySummary[]; message?: string }>(
        "multiplayer:lobbies:list",
        {
          limitCount,
        },
      )

      if (!response.ok) {
        throw new Error(response.message || "Nao foi possivel carregar os grupos publicos")
      }

      return response.lobbies || []
    } catch (error) {
      if (!isSocketConnectionError(error)) {
        throw error
      }
    }
  }

  return await getLegacyPublicCasualLobbies(limitCount)
}

export async function joinCompetitiveQueue(params: {
  maxPlayers: 2 | 3
  userId: string
  displayName: string
}): Promise<{ ok: boolean; room?: MultiplayerRoom; message?: string }> {
  if (canUseSocketTransport()) {
    try {
      const response = await emitWithAck<{ ok: boolean; room?: MultiplayerRoom; message?: string }>(
        "multiplayer:competitive:join",
        {
          maxPlayers: params.maxPlayers,
          userId: params.userId,
          displayName: params.displayName,
        },
      )

      return normalizeRoomResponse(response)
    } catch (error) {
      if (!isSocketConnectionError(error)) {
        throw error
      }
    }
  }

  return await joinLegacyCompetitiveQueue(params)
}
