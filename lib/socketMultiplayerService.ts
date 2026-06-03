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

type RoomTransport = "socket" | "legacy"

const DEFAULT_REMOTE_SOCKET_SERVER_URL = "https://pokemon-adventure.onrender.com"
const SOCKET_SERVER_URL = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || DEFAULT_REMOTE_SOCKET_SERVER_URL
const SOCKET_TIMEOUT_MS = 3000
const SOCKET_LOCAL_TIMEOUT_MS = 2000
const LEGACY_TIMEOUT_MS = 30000
const LEGACY_TIMEOUT_MESSAGE = "Falha de rede na base de dados multiplayer. Tenta novamente."
const HAS_EXPLICIT_SOCKET_URL = Boolean(process.env.NEXT_PUBLIC_SOCKET_SERVER_URL)
const roomTransportById = new Map<string, RoomTransport>()

function normalizeRoomId(roomId: string | null | undefined): string {
  return roomId?.trim() || ""
}

function rememberRoomTransport(roomId: string | null | undefined, transport: RoomTransport) {
  const normalizedRoomId = normalizeRoomId(roomId)
  if (!normalizedRoomId) {
    return
  }

  roomTransportById.set(normalizedRoomId, transport)
}

function getRoomTransport(roomId: string | null | undefined): RoomTransport | null {
  const normalizedRoomId = normalizeRoomId(roomId)
  if (!normalizedRoomId) {
    return null
  }

  return roomTransportById.get(normalizedRoomId) || null
}

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

function resolveSocketServerUrl(preferRemote = false) {
  if (typeof window === "undefined") {
    return SOCKET_SERVER_URL
  }

  if (!preferRemote && isLocalDevelopmentHost() && !HAS_EXPLICIT_SOCKET_URL) {
    const currentPort = Number(window.location.port)
    const socketPort = Number.isFinite(currentPort) && currentPort >= 3000 && currentPort < 4000 ? currentPort + 1000 : 4001
    const hostname = resolveLocalSocketHostname()
    return `${window.location.protocol}//${hostname}:${socketPort}`
  }

  return SOCKET_SERVER_URL
}

function canUseSocketTransport() {
  return Boolean(resolveSocketServerUrl())
}

function shouldAttemptRemoteFallback() {
  return typeof window !== "undefined" && isLocalDevelopmentHost() && !HAS_EXPLICIT_SOCKET_URL
}

function isSocketConnectionError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error || "").toLowerCase()
  return (
    message.includes("connect_error") ||
    message.includes("websocket") ||
    message.includes("xhr poll") ||
    message.includes("socket.io indisponivel") ||
    message.includes("socket.io demorou") ||
    message.includes("failed to fetch") ||
    (message.includes("timeout") && !message.includes("base de dados") && !message.includes("database"))
  )
}

function withTimeout<T>(promise: Promise<T>, timeoutMs = LEGACY_TIMEOUT_MS): Promise<T> {
  if (typeof window === "undefined") {
    return promise
  }

  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(LEGACY_TIMEOUT_MESSAGE))
    }, timeoutMs)

    promise.then(
      (value) => {
        window.clearTimeout(timeoutId)
        resolve(value)
      },
      (error) => {
        window.clearTimeout(timeoutId)
        reject(error)
      },
    )
  })
}

let socketInstance: Socket | null = null
let socketServerUrlInUse: string | null = null

function getSocket(preferRemote = false): Socket {
  const socketServerUrl = resolveSocketServerUrl(preferRemote)
  if (!socketServerUrl) {
    throw new Error("Socket.io indisponivel neste ambiente")
  }

  if (!socketInstance || socketServerUrlInUse !== socketServerUrl) {
    if (socketInstance) {
      socketInstance.removeAllListeners()
      socketInstance.disconnect()
    }

    socketInstance = io(socketServerUrl, {
      autoConnect: false,
      transports: ["polling", "websocket"],
      timeout: SOCKET_TIMEOUT_MS,
      reconnection: true,
      reconnectionAttempts: 5,
    })
    socketServerUrlInUse = socketServerUrl
  }

  if (!socketInstance.connected && !socketInstance.active) {
    socketInstance.connect()
  }

  return socketInstance
}

async function ensureSocketConnected(preferRemote = false): Promise<Socket> {
  if (typeof window === "undefined") {
    throw new Error("Socket.io indisponivel fora do browser")
  }

  const socket = getSocket(preferRemote)
  if (socket.connected) {
    return socket
  }

  return await new Promise<Socket>((resolve, reject) => {
    const timeoutMs = !preferRemote && isLocalDevelopmentHost() ? SOCKET_LOCAL_TIMEOUT_MS : SOCKET_TIMEOUT_MS
    const timeoutId = window.setTimeout(() => {
      cleanup()
      reject(new Error("Socket.io demorou demasiado a responder"))
    }, timeoutMs)

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

async function ensureSocketConnectedWithFallback(): Promise<Socket> {
  try {
    return await ensureSocketConnected(false)
  } catch (error) {
    if (!shouldAttemptRemoteFallback() || !isSocketConnectionError(error)) {
      throw error
    }

    return await ensureSocketConnected(true)
  }
}

async function emitWithAckOnSocket<T>(socket: Socket, eventName: string, payload?: unknown, timeoutMs = SOCKET_TIMEOUT_MS): Promise<T> {
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

async function emitWithAck<T>(eventName: string, payload?: unknown, timeoutMs = SOCKET_TIMEOUT_MS): Promise<T> {
  const socket = await ensureSocketConnectedWithFallback()

  return await emitWithAckOnSocket(socket, eventName, payload, timeoutMs)
}

async function runRoomOperation<T>(params: {
  roomId?: string
  socketOperation: () => Promise<T>
  legacyOperation: () => Promise<T>
  rememberRoomId?: string
  rememberFromResult?: (result: T, transport: RoomTransport) => string | null | undefined
}): Promise<T> {
  const preferredTransport = getRoomTransport(params.roomId)
  const useLegacyFirst = preferredTransport === "legacy" || !canUseSocketTransport()

  const rememberTransport = (result: T, transport: RoomTransport) => {
    const roomId = params.rememberFromResult?.(result, transport) || params.rememberRoomId
    if (roomId) {
      rememberRoomTransport(roomId, transport)
    }
  }

  if (useLegacyFirst) {
    const legacyResult = await params.legacyOperation()
    rememberTransport(legacyResult, "legacy")
    return legacyResult
  }

  try {
    const socketResult = await params.socketOperation()
    rememberTransport(socketResult, "socket")
    return socketResult
  } catch {
    const legacyResult = await params.legacyOperation()
    rememberTransport(legacyResult, "legacy")
    return legacyResult
  }
}

function normalizeRoomResponse<T extends { ok: boolean; message?: string }>(response: T): T {
  return response
}

function normalizeRoomVisibility(visibility?: MultiplayerRoomVisibility): MultiplayerRoomVisibility {
  return visibility === "public" ? "public" : "private"
}

export async function createMultiplayerRoom(params: {
  hostUserId: string;
  hostDisplayName: string;
  maxPlayers: 2 | 3;
  mode: MultiplayerRoomMode;
  visibility?: MultiplayerRoomVisibility;
}): Promise<MultiplayerRoom> {
  const room = await runRoomOperation({
    socketOperation: async () => {
      const response = normalizeRoomResponse(
        await emitWithAck<{ ok: boolean; room?: MultiplayerRoom; message?: string }>(
          "multiplayer:room:create",
          {
            hostUserId: params.hostUserId,
            hostDisplayName: params.hostDisplayName,
            maxPlayers: params.maxPlayers,
            mode: params.mode,
            visibility: normalizeRoomVisibility(params.visibility),
          }
        )
      );
      if (!response.ok || !response.room) {
        throw new Error(response.message || "Nao foi possivel criar a sala");
      }
      // ✅ ADICIONA ESTAS LINHAS:
      if (typeof window !== "undefined") {
        window.location.href = `/multiplayer?roomId=${response.room.id}`;
      }
      return response.room;
    },
    legacyOperation: async () => {
      return await withTimeout(createLegacyMultiplayerRoom(params));
    },
    rememberFromResult: (room) => room.id,
  });
  return room; // ✅ Adiciona esta linha para retornar a sala
}

export async function joinMultiplayerRoom(params: {
  roomId: string
  userId: string
  displayName: string
}): Promise<{ ok: boolean; room?: MultiplayerRoom; message?: string }> {
  return await runRoomOperation({
    roomId: params.roomId,
    socketOperation: async () => {
      const response = await emitWithAck<{ ok: boolean; room?: MultiplayerRoom; message?: string }>("multiplayer:room:join", {
        roomId: params.roomId.trim(),
        userId: params.userId,
        displayName: params.displayName,
      })

      if (!response.ok || !response.room) {
        throw new Error(response.message || "Nao foi possivel entrar na sala")
      }

      return normalizeRoomResponse(response)
    },
    legacyOperation: async () => {
      return await withTimeout(joinLegacyMultiplayerRoom(params))
    },
    rememberFromResult: (response) => response.room?.id,
  })
}

export async function leaveMultiplayerRoom(roomId: string, userId: string): Promise<void> {
  await runRoomOperation({
    roomId,
    socketOperation: async () => {
      await emitWithAck<{ ok: boolean; message?: string }>("multiplayer:room:leave", {
        roomId: roomId.trim(),
        userId,
      })
      return undefined
    },
    legacyOperation: async () => {
      await withTimeout(leaveLegacyMultiplayerRoom(roomId, userId))
      return undefined
    },
    rememberRoomId: roomId,
  })
}

export async function startMultiplayerRoom(roomId: string, hostUserId: string): Promise<{ ok: boolean; message?: string }> {
  return await runRoomOperation({
    roomId,
    socketOperation: async () => {
      const response = await emitWithAck<{ ok: boolean; message?: string }>("multiplayer:room:start", {
        roomId: roomId.trim(),
        hostUserId,
      })

      return normalizeRoomResponse(response)
    },
    legacyOperation: async () => {
      return await withTimeout(startLegacyMultiplayerRoom(roomId, hostUserId))
    },
    rememberRoomId: roomId,
  })
}

export async function updateMultiplayerPlayerWave(params: {
  roomId: string
  userId: string
  displayName: string
  wave: number
}): Promise<void> {
  await runRoomOperation({
    roomId: params.roomId,
    socketOperation: async () => {
      await emitWithAck<{ ok: boolean; message?: string }>("multiplayer:room:update-wave", {
        roomId: params.roomId.trim(),
        userId: params.userId,
        displayName: params.displayName,
        wave: Math.max(0, params.wave),
      })
      return undefined
    },
    legacyOperation: async () => {
      await withTimeout(updateLegacyMultiplayerPlayerWave(params))
      return undefined
    },
    rememberRoomId: params.roomId,
  })
}

export async function markMultiplayerPlayerFinished(params: {
  roomId: string
  userId: string
  wave: number
}): Promise<void> {
  await runRoomOperation({
    roomId: params.roomId,
    socketOperation: async () => {
      await emitWithAck<{ ok: boolean; message?: string }>("multiplayer:room:finish-player", {
        roomId: params.roomId.trim(),
        userId: params.userId,
        wave: Math.max(0, params.wave),
      })
      return undefined
    },
    legacyOperation: async () => {
      await withTimeout(markLegacyMultiplayerPlayerFinished(params))
      return undefined
    },
    rememberRoomId: params.roomId,
  })
}

export async function requestMultiplayerRematch(params: {
  roomId: string
  hostUserId: string
}): Promise<{ ok: boolean; message?: string }> {
  return await runRoomOperation({
    roomId: params.roomId,
    socketOperation: async () => {
      const response = await emitWithAck<{ ok: boolean; message?: string }>("multiplayer:room:rematch", {
        roomId: params.roomId.trim(),
        hostUserId: params.hostUserId,
      })

      return normalizeRoomResponse(response)
    },
    legacyOperation: async () => {
      return await withTimeout(requestLegacyMultiplayerRematch(params))
    },
    rememberRoomId: params.roomId,
  })
}

export async function setMultiplayerPlayerReady(params: {
  roomId: string
  userId: string
  ready: boolean
}): Promise<void> {
  await runRoomOperation({
    roomId: params.roomId,
    socketOperation: async () => {
      await emitWithAck<{ ok: boolean; message?: string }>("multiplayer:room:set-ready", {
        roomId: params.roomId.trim(),
        userId: params.userId,
        ready: params.ready,
      })
      return undefined
    },
    legacyOperation: async () => {
      await withTimeout(setLegacyMultiplayerPlayerReady(params))
      return undefined
    },
    rememberRoomId: params.roomId,
  })
}

export async function setMultiplayerStarterMode(params: {
  roomId: string
  userId: string
  starterMode: "manual" | "roulette"
}): Promise<void> {
  await runRoomOperation({
    roomId: params.roomId,
    socketOperation: async () => {
      await emitWithAck<{ ok: boolean; message?: string }>("multiplayer:room:set-starter-mode", {
        roomId: params.roomId.trim(),
        userId: params.userId,
        starterMode: params.starterMode,
      })
      return undefined
    },
    legacyOperation: async () => {
      await withTimeout(setLegacyMultiplayerStarterMode(params))
      return undefined
    },
    rememberRoomId: params.roomId,
  })
}

export async function addBotToRoom(params: { roomId: string; hostUserId: string; displayName?: string }): Promise<{ ok: boolean; room?: MultiplayerRoom; botId?: string; message?: string }> {
  if (!canUseSocketTransport()) {
    return { ok: false, message: "Bots only available when socket transport is active" }
  }

  const socket = await ensureSocketConnectedWithFallback()
  return await emitWithAckOnSocket(socket, "multiplayer:room:add-bot", params)
}

export async function kickPlayerFromRoom(params: { roomId: string; hostUserId: string; targetUserId: string }): Promise<{ ok: boolean; message?: string }> {
  if (!canUseSocketTransport()) {
    return { ok: false, message: "Kick requires socket transport" }
  }

  const socket = await ensureSocketConnectedWithFallback()
  return await emitWithAckOnSocket(socket, "multiplayer:room:kick", params)
}

export function subscribeMultiplayerRoom(
  roomId: string,
  onRoomUpdate: (room: MultiplayerRoom | null) => void,
  onError?: (error: unknown) => void,
): () => void {
  const normalizedRoomId = roomId.trim()
  const preferredTransport = getRoomTransport(normalizedRoomId)

  if (!canUseSocketTransport() || preferredTransport === "legacy") {
    return subscribeLegacyMultiplayerRoom(roomId, onRoomUpdate, onError)
  }

  let active = true
  let legacyUnsubscribe: (() => void) | null = null
  let socket: Socket | null = null

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

  const attachListeners = (target: Socket) => {
    target.on("multiplayer:room:update", handleRoomUpdate)
    target.on("multiplayer:room:deleted", handleRoomDeleted)
  }

  const detachListeners = (target: Socket) => {
    target.off("multiplayer:room:update", handleRoomUpdate)
    target.off("multiplayer:room:deleted", handleRoomDeleted)
  }

  const subscribeWithSocket = async () => {
    try {
      const connectedSocket = await ensureSocketConnectedWithFallback()
      if (!active) {
        return
      }

      socket = connectedSocket
      attachListeners(connectedSocket)

      const response = await emitWithAckOnSocket<{ ok: boolean; room?: MultiplayerRoom | null; message?: string }>(
        connectedSocket,
        "multiplayer:room:subscribe",
        {
          roomId: normalizedRoomId,
        },
      )

      if (!active) {
        return
      }

      if (!response.ok) {
        throw new Error(response.message || "Nao foi possivel sincronizar a sala")
      }

      rememberRoomTransport(normalizedRoomId, "socket")
      onRoomUpdate(response.room || null)
    } catch (error) {
      if (!active) {
        return
      }

      if (socket) {
        detachListeners(socket)
        socket.emit("multiplayer:room:unsubscribe", {
          roomId: normalizedRoomId,
        })
      }

      try {
        legacyUnsubscribe = subscribeLegacyMultiplayerRoom(roomId, onRoomUpdate, onError)
        rememberRoomTransport(normalizedRoomId, "legacy")
      } catch (legacyError) {
        onError?.(legacyError ?? error)
      }
    }
  }

  void subscribeWithSocket()

  return () => {
    active = false
    if (socket) {
      detachListeners(socket)
      socket.emit("multiplayer:room:unsubscribe", {
        roomId: normalizedRoomId,
      })
    }
    legacyUnsubscribe?.()
  }
}

export async function getPublicCasualLobbies(limitCount = 30): Promise<PublicCasualLobbySummary[]> {
  if (!canUseSocketTransport()) {
    return await withTimeout(getLegacyPublicCasualLobbies(limitCount))
  }

  let socketLobbies: PublicCasualLobbySummary[] = []
  let socketError: unknown = null

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

    socketLobbies = response.lobbies || []
  } catch (error) {
    socketError = error
  }

  try {
    const legacyLobbies = await withTimeout(getLegacyPublicCasualLobbies(limitCount))
    if (socketLobbies.length === 0) {
      return legacyLobbies
    }

    const mergedLobbies = new Map<string, PublicCasualLobbySummary>()
    for (const lobby of socketLobbies) {
      mergedLobbies.set(lobby.id, lobby)
    }
    for (const lobby of legacyLobbies) {
      if (!mergedLobbies.has(lobby.id)) {
        mergedLobbies.set(lobby.id, lobby)
      }
    }

    return [...mergedLobbies.values()]
      .sort((left, right) => {
        const leftCount = left.playersCount || 0
        const rightCount = right.playersCount || 0
        if (rightCount !== leftCount) {
          return rightCount - leftCount
        }

        return right.createdAt - left.createdAt
      })
      .slice(0, limitCount)
  } catch (legacyError) {
    if (socketLobbies.length > 0) {
      return socketLobbies
    }

    if (socketError) {
      throw socketError
    }

    throw legacyError
  }
}

export async function joinCompetitiveQueue(params: {
  maxPlayers: 2 | 3
  userId: string
  displayName: string
}): Promise<{ ok: boolean; room?: MultiplayerRoom; message?: string }> {
  try {
    if (canUseSocketTransport()) {
      const response = await emitWithAck<{ ok: boolean; room?: MultiplayerRoom; message?: string }>(
        "multiplayer:competitive:join",
        {
          maxPlayers: params.maxPlayers,
          userId: params.userId,
          displayName: params.displayName,
        },
      )

      if (response.ok && response.room) {
        rememberRoomTransport(response.room.id, "socket")
        return normalizeRoomResponse(response)
      }

      throw new Error(response.message || "Nao foi possivel entrar na fila competitiva")
    }
  } catch {
    // Fall back to the legacy queue whenever the socket path cannot complete the join.
  }

  const legacyResult = await withTimeout(joinLegacyCompetitiveQueue(params))
  if (legacyResult.room?.id) {
    rememberRoomTransport(legacyResult.room.id, "legacy")
  }

  return legacyResult
}
