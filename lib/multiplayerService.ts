"use client"

import { get, onValue, push, ref, runTransaction, set, type Database } from "firebase/database"
import { getFirebaseDb } from "./firebase"

export type MultiplayerRoomStatus = "waiting" | "active" | "finished"
export type MultiplayerRoomMode = "competitive" | "casual"
export type MultiplayerRoomVisibility = "public" | "private"

export interface MultiplayerRoomPlayer {
  userId: string
  displayName: string
  joinedAt: number
  bestWave: number
  finishedAt?: number
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
  players: Record<string, MultiplayerRoomPlayer>
}

export interface MonthlyLeaderboardEntry {
  runId: string
  userId: string
  displayName: string
  wave: number
  finishedAt: number
  roomId?: string
}

export interface SoloLeaderboardEntry {
  runId: string
  userId: string
  displayName: string
  wave: number
  finishedAt: number
}

export interface PublicCasualLobbySummary {
  id: string
  hostDisplayName: string
  maxPlayers: 2 | 3
  playersCount: number
  createdAt: number
}

const ROOM_ROOT = "multiplayer/rooms"
const COMPETITIVE_QUEUE_ROOT = "multiplayer/competitiveQueue"
const LEADERBOARD_ROOT = "multiplayer/leaderboards"
const SOLO_LEADERBOARD_ROOT = "multiplayer/solo-farthest"
const SOLO_LEADERBOARD_LEGACY_MONTHLY_ROOT = "multiplayer/solo-farthest-monthly"
const SOLO_LOCAL_FALLBACK_KEY = "pokemon-adventure:solo-runs-fallback"
const LOBBY_STALE_MS = 30 * 60 * 1000
const COMPETITIVE_QUEUE_LOCK_STALE_MS = 4 * 1000
const ROOM_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const ROOM_ID_LENGTH = 5

interface CompetitiveQueueSlot {
  roomId: string
  ownerUserId: string
  updatedAt: number
}

function generateRoomId(length = ROOM_ID_LENGTH): string {
  let output = ""
  for (let index = 0; index < length; index++) {
    const randomIndex = Math.floor(Math.random() * ROOM_ID_ALPHABET.length)
    output += ROOM_ID_ALPHABET[randomIndex]
  }
  return output
}

function readSoloFallbackRuns(): SoloLeaderboardEntry[] {
  if (typeof window === "undefined") {
    return []
  }

  try {
    const raw = window.localStorage.getItem(SOLO_LOCAL_FALLBACK_KEY)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return null
        }

        const rawEntry = entry as Partial<SoloLeaderboardEntry>
        if (!rawEntry.runId || !rawEntry.userId || !rawEntry.displayName) {
          return null
        }

        return {
          runId: rawEntry.runId,
          userId: rawEntry.userId,
          displayName: rawEntry.displayName,
          wave: Math.max(0, Number(rawEntry.wave || 0)),
          finishedAt: Number(rawEntry.finishedAt || Date.now()),
        } satisfies SoloLeaderboardEntry
      })
      .filter((entry): entry is SoloLeaderboardEntry => entry !== null)
  } catch {
    return []
  }
}

function writeSoloFallbackRuns(entries: SoloLeaderboardEntry[]) {
  if (typeof window === "undefined") {
    return
  }

  try {
    window.localStorage.setItem(SOLO_LOCAL_FALLBACK_KEY, JSON.stringify(entries))
  } catch {
    // Ignore localStorage quota issues.
  }
}

function appendSoloFallbackRun(entry: SoloLeaderboardEntry) {
  const current = readSoloFallbackRuns()
  current.push(entry)
  writeSoloFallbackRuns(current)
}

function sortSoloEntries(entries: SoloLeaderboardEntry[], limitCount: number): SoloLeaderboardEntry[] {
  return entries
    .sort((a, b) => {
      if (b.wave !== a.wave) {
        return b.wave - a.wave
      }
      return (a.finishedAt || 0) - (b.finishedAt || 0)
    })
    .slice(0, limitCount)
}

function normalizeSoloEntry(raw: unknown): SoloLeaderboardEntry | null {
  if (!raw || typeof raw !== "object") {
    return null
  }

  const candidate = raw as Partial<SoloLeaderboardEntry> & {
    bestWave?: number
    lastUpdatedAt?: number
  }

  if (!candidate.userId || !candidate.displayName) {
    return null
  }

  const wave =
    typeof candidate.wave === "number" ? candidate.wave : typeof candidate.bestWave === "number" ? candidate.bestWave : 0
  const finishedAt =
    typeof candidate.finishedAt === "number"
      ? candidate.finishedAt
      : typeof candidate.lastUpdatedAt === "number"
        ? candidate.lastUpdatedAt
        : 0

  return {
    runId: candidate.runId || `${candidate.userId}-${finishedAt}`,
    userId: candidate.userId,
    displayName: candidate.displayName,
    wave,
    finishedAt,
  }
}

function requireDatabase(): Database {
  const db = getFirebaseDb()
  if (!db) {
    throw new Error("Firebase RTDB indisponivel")
  }
  return db
}

export function getCurrentMonthKey(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

export async function createMultiplayerRoom(params: {
  hostUserId: string
  hostDisplayName: string
  maxPlayers: 2 | 3
  mode: MultiplayerRoomMode
  visibility?: MultiplayerRoomVisibility
}): Promise<MultiplayerRoom> {
  const db = requireDatabase()

  for (let attempt = 0; attempt < 30; attempt++) {
    const roomId = generateRoomId()
    const createdAt = Date.now()
    const room: MultiplayerRoom = {
      id: roomId,
      hostUserId: params.hostUserId,
      hostDisplayName: params.hostDisplayName,
      mode: params.mode,
      visibility: params.visibility || "private",
      maxPlayers: params.maxPlayers,
      status: "waiting",
      createdAt,
      players: {
        [params.hostUserId]: {
          userId: params.hostUserId,
          displayName: params.hostDisplayName,
          joinedAt: createdAt,
          bestWave: 0,
        },
      },
    }

    const roomRef = ref(db, `${ROOM_ROOT}/${roomId}`)
    const transaction = await runTransaction(roomRef, (current: MultiplayerRoom | null) => {
      if (current) {
        return current
      }

      return room
    })

    if (transaction.committed) {
      const createdRoom = transaction.snapshot.val() as MultiplayerRoom | null
      if (createdRoom?.hostUserId === params.hostUserId && createdRoom.id === roomId) {
        return createdRoom
      }
    }
  }

  throw new Error("Falha ao gerar codigo da sala")
}

export async function findAvailableCompetitiveRoom(maxPlayers: 2 | 3): Promise<string | null> {
  const db = requireDatabase()
  const roomsRef = ref(db, ROOM_ROOT)
  const snapshot = await get(roomsRef)

  if (!snapshot.exists()) {
    return null
  }

  const now = Date.now()
  const rooms = (snapshot.val() as Record<string, MultiplayerRoom>) || {}
  const candidates = Object.values(rooms)
    .map((room) => ({ room, playersCount: Object.keys(room.players || {}).length }))
    .filter(({ room, playersCount }) => {
      const isFresh = now - (room.createdAt || 0) <= LOBBY_STALE_MS
      return (
        room.mode === "competitive" &&
        room.maxPlayers === maxPlayers &&
        room.status === "waiting" &&
        playersCount < room.maxPlayers &&
        isFresh
      )
    })
    .sort((a, b) => {
      if (b.playersCount !== a.playersCount) {
        return b.playersCount - a.playersCount
      }
      return (b.room.createdAt || 0) - (a.room.createdAt || 0)
    })

  return candidates[0]?.room.id || null
}

export async function getPublicCasualLobbies(limitCount = 30): Promise<PublicCasualLobbySummary[]> {
  const db = requireDatabase()
  const roomsRef = ref(db, ROOM_ROOT)
  const snapshot = await get(roomsRef)

  if (!snapshot.exists()) {
    return []
  }

  const now = Date.now()
  const rooms = (snapshot.val() as Record<string, MultiplayerRoom>) || {}
  return Object.values(rooms)
    .map((room) => ({ room, playersCount: Object.keys(room.players || {}).length }))
    .filter(({ room, playersCount }) => {
      const isFresh = now - (room.createdAt || 0) <= LOBBY_STALE_MS
      return (
        room.mode === "casual" &&
        room.visibility === "public" &&
        room.status === "waiting" &&
        playersCount < room.maxPlayers &&
        isFresh
      )
    })
    .sort((a, b) => {
      if (b.playersCount !== a.playersCount) {
        return b.playersCount - a.playersCount
      }
      return (b.room.createdAt || 0) - (a.room.createdAt || 0)
    })
    .slice(0, limitCount)
    .map(({ room, playersCount }) => ({
      id: room.id,
      hostDisplayName: room.hostDisplayName,
      maxPlayers: room.maxPlayers,
      playersCount,
      createdAt: room.createdAt,
    }))
}

export async function joinMultiplayerRoom(params: {
  roomId: string
  userId: string
  displayName: string
}): Promise<{ ok: boolean; room?: MultiplayerRoom; message?: string }> {
  const db = requireDatabase()
  const roomRef = ref(db, `${ROOM_ROOT}/${params.roomId}`)

  const transaction = await runTransaction(roomRef, (current: MultiplayerRoom | null) => {
    if (!current) {
      return current
    }

    const players = current.players || {}
    const playerIds = Object.keys(players)
    const normalizedHostUserId = players[current.hostUserId] ? current.hostUserId : playerIds[0] || params.userId
    const normalizedHostDisplayName = players[normalizedHostUserId]?.displayName || current.hostDisplayName || params.displayName
    const normalizedCurrent: MultiplayerRoom = {
      ...current,
      hostUserId: normalizedHostUserId,
      hostDisplayName: normalizedHostDisplayName,
    }
    const currentCount = Object.keys(players).length

    if (normalizedCurrent.status !== "waiting") {
      return normalizedCurrent
    }

    if (players[params.userId]) {
      return normalizedCurrent
    }

    if (currentCount >= normalizedCurrent.maxPlayers) {
      return normalizedCurrent
    }

    const nextPlayers: Record<string, MultiplayerRoomPlayer> = {
      ...players,
      [params.userId]: {
        userId: params.userId,
        displayName: params.displayName,
        joinedAt: Date.now(),
        bestWave: 0,
      },
    }

    const nextCount = Object.keys(nextPlayers).length
    const shouldAutoStartCompetitive = normalizedCurrent.mode === "competitive" && nextCount >= normalizedCurrent.maxPlayers

    return {
      ...normalizedCurrent,
      status: shouldAutoStartCompetitive ? "active" : current.status,
      startedAt: shouldAutoStartCompetitive ? Date.now() : current.startedAt,
      players: shouldAutoStartCompetitive
        ? Object.fromEntries(
            Object.entries(nextPlayers).map(([id, player]) => [
              id,
              {
                ...player,
                bestWave: 0,
                finishedAt: undefined,
              },
            ]),
          )
        : nextPlayers,
    }
  })

  if (!transaction.committed) {
    return { ok: false, message: "Nao foi possivel entrar na sala" }
  }

  const room = transaction.snapshot.val() as MultiplayerRoom | null
  if (!room) {
    return { ok: false, message: "Sala nao encontrada" }
  }

  const players = room.players || {}
  if (!players[params.userId]) {
    if (room.status !== "waiting") {
      return { ok: false, message: "A sala ja foi iniciada" }
    }

    if (Object.keys(players).length >= room.maxPlayers) {
      return { ok: false, message: "Sala cheia" }
    }

    return { ok: false, message: "Nao foi possivel entrar na sala" }
  }

  return { ok: true, room }
}

async function getRoomById(roomId: string): Promise<MultiplayerRoom | null> {
  const db = requireDatabase()
  const snapshot = await get(ref(db, `${ROOM_ROOT}/${roomId}`))
  if (!snapshot.exists()) {
    return null
  }

  return snapshot.val() as MultiplayerRoom
}

async function joinCompetitiveQueueLegacy(params: {
  maxPlayers: 2 | 3
  userId: string
  displayName: string
}): Promise<{ ok: boolean; room?: MultiplayerRoom; message?: string }> {
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

  for (let pass = 0; pass < 30; pass++) {
    const availableRoomId = await findAvailableCompetitiveRoom(params.maxPlayers)

    if (availableRoomId) {
      const joinResult = await joinMultiplayerRoom({
        roomId: availableRoomId,
        userId: params.userId,
        displayName: params.displayName,
      })

      if (joinResult.ok) {
        const joinedRoom = joinResult.room || (await getRoomById(availableRoomId))
        if (joinedRoom) {
          return { ok: true, room: joinedRoom }
        }
      }

      const joinMessage = (joinResult.message || "").toLowerCase()
      const retryable =
        joinMessage.includes("sala cheia") ||
        joinMessage.includes("ja foi iniciada") ||
        joinMessage.includes("sala nao encontrada") ||
        joinMessage.includes("nao foi possivel entrar na sala")

      if (!retryable) {
        // Do not fail hard: if join result is ambiguous, keep trying and create a room as final fallback.
        await sleep(90)
        continue
      }

      await sleep(90)
      continue
    }

    const createdRoom = await createMultiplayerRoom({
      hostUserId: params.userId,
      hostDisplayName: params.displayName,
      maxPlayers: params.maxPlayers,
      mode: "competitive",
      visibility: "private",
    })

    return { ok: true, room: createdRoom }
  }

  const createdRoom = await createMultiplayerRoom({
    hostUserId: params.userId,
    hostDisplayName: params.displayName,
    maxPlayers: params.maxPlayers,
    mode: "competitive",
    visibility: "private",
  })

  return { ok: true, room: createdRoom }
}

async function joinCompetitiveQueueUsingSlot(
  params: { maxPlayers: 2 | 3; userId: string; displayName: string },
  slotRefPath: string,
): Promise<{ ok: boolean; room?: MultiplayerRoom; message?: string }> {
  const db = requireDatabase()
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
  const slotRef = ref(db, slotRefPath)

  for (let pass = 0; pass < 100; pass++) {
    const slotSnapshot = await get(slotRef)
    const slot = (slotSnapshot.val() as CompetitiveQueueSlot | null) || null
    const slotRoomId = slot?.roomId || ""

    if (slotRoomId && !slotRoomId.startsWith("creating:")) {
      const joinResult = await joinMultiplayerRoom({
        roomId: slotRoomId,
        userId: params.userId,
        displayName: params.displayName,
      })

      if (joinResult.ok) {
        const joinedRoom = joinResult.room || (await getRoomById(slotRoomId))
        if (joinedRoom) {
          return { ok: true, room: joinedRoom }
        }
      }

      const joinMessage = (joinResult.message || "").toLowerCase()
      const shouldClearSlot =
        joinMessage.includes("sala cheia") ||
        joinMessage.includes("ja foi iniciada") ||
        joinMessage.includes("sala nao encontrada") ||
        joinMessage.includes("nao foi possivel entrar na sala")

      if (shouldClearSlot) {
        await runTransaction(slotRef, (current: CompetitiveQueueSlot | null) => {
          if (!current || current.roomId !== slotRoomId) {
            return current
          }
          return null
        })
      }

      await sleep(100)
      continue
    }

    const now = Date.now()
    const slotOwner = slot?.ownerUserId || ""
    const slotUpdatedAt = Number(slot?.updatedAt || 0)
    const lockIsStale = now - slotUpdatedAt > COMPETITIVE_QUEUE_LOCK_STALE_MS
    const someoneElseCreating = slotRoomId.startsWith("creating:") && slotOwner && slotOwner !== params.userId && !lockIsStale

    if (someoneElseCreating) {
      await sleep(140)
      continue
    }

    const marker = `creating:${params.userId}:${Date.now()}`
    const acquireTx = await runTransaction(slotRef, (current: CompetitiveQueueSlot | null) => {
      const txNow = Date.now()

      if (!current) {
        return {
          roomId: marker,
          ownerUserId: params.userId,
          updatedAt: txNow,
        }
      }

      const currentRoomId = current.roomId || ""
      const currentOwner = current.ownerUserId || ""
      const currentUpdatedAt = Number(current.updatedAt || 0)
      const currentStale = txNow - currentUpdatedAt > COMPETITIVE_QUEUE_LOCK_STALE_MS

      if (currentRoomId.startsWith("creating:")) {
        if (currentOwner === params.userId || currentStale) {
          return {
            roomId: marker,
            ownerUserId: params.userId,
            updatedAt: txNow,
          }
        }
      }

      return current
    })

    const acquiredSlot = (acquireTx.snapshot.val() as CompetitiveQueueSlot | null) || null
    const lockAcquired = acquiredSlot?.roomId === marker && acquiredSlot.ownerUserId === params.userId

    if (!lockAcquired) {
      await sleep(90)
      continue
    }

    try {
      const createdRoom = await createMultiplayerRoom({
        hostUserId: params.userId,
        hostDisplayName: params.displayName,
        maxPlayers: params.maxPlayers,
        mode: "competitive",
        visibility: "private",
      })

      await runTransaction(slotRef, (current: CompetitiveQueueSlot | null) => {
        if (!current || current.roomId !== marker || current.ownerUserId !== params.userId) {
          return current
        }

        return {
          roomId: createdRoom.id,
          ownerUserId: params.userId,
          updatedAt: Date.now(),
        }
      })

      return { ok: true, room: createdRoom }
    } catch {
      await runTransaction(slotRef, (current: CompetitiveQueueSlot | null) => {
        if (!current || current.roomId !== marker || current.ownerUserId !== params.userId) {
          return current
        }
        return null
      })
    }
  }

  const finalSlotSnapshot = await get(slotRef)
  const finalSlot = (finalSlotSnapshot.val() as CompetitiveQueueSlot | null) || null
  const finalRoomId = finalSlot?.roomId || ""

  if (finalRoomId && !finalRoomId.startsWith("creating:")) {
    const finalJoin = await joinMultiplayerRoom({
      roomId: finalRoomId,
      userId: params.userId,
      displayName: params.displayName,
    })

    if (finalJoin.ok) {
      const joinedRoom = finalJoin.room || (await getRoomById(finalRoomId))
      if (joinedRoom) {
        return { ok: true, room: joinedRoom }
      }
    }
  }

  throw new Error("queue-slot-timeout")
}

export async function joinCompetitiveQueue(params: {
  maxPlayers: 2 | 3
  userId: string
  displayName: string
}): Promise<{ ok: boolean; room?: MultiplayerRoom; message?: string }> {
  try {
    return await joinCompetitiveQueueUsingSlot(params, `${COMPETITIVE_QUEUE_ROOT}/${params.maxPlayers}`)
  } catch {
    try {
      // Fallback to a slot under rooms path for projects with strict rules that block /competitiveQueue.
      return await joinCompetitiveQueueUsingSlot(params, `${ROOM_ROOT}/__queue_slot_${params.maxPlayers}`)
    } catch {
      return joinCompetitiveQueueLegacy(params)
    }
  }
}

export async function leaveMultiplayerRoom(roomId: string, userId: string): Promise<void> {
  const db = requireDatabase()
  const roomRef = ref(db, `${ROOM_ROOT}/${roomId}`)

  await runTransaction(roomRef, (current: MultiplayerRoom | null) => {
    if (!current?.players?.[userId]) {
      return current
    }

    const nextPlayers = { ...current.players }
    delete nextPlayers[userId]

    if (Object.keys(nextPlayers).length === 0) {
      return null
    }

    const nextHostUserId = nextPlayers[current.hostUserId] ? current.hostUserId : Object.keys(nextPlayers)[0]

    return {
      ...current,
      hostUserId: nextHostUserId,
      hostDisplayName: nextPlayers[nextHostUserId]?.displayName || current.hostDisplayName,
      players: nextPlayers,
      status: current.status === "waiting" ? "waiting" : current.status,
    }
  })
}

export async function startMultiplayerRoom(roomId: string, hostUserId: string): Promise<{ ok: boolean; message?: string }> {
  const db = requireDatabase()
  const roomRef = ref(db, `${ROOM_ROOT}/${roomId}`)

  const transaction = await runTransaction(roomRef, (current: MultiplayerRoom | null) => {
    if (!current) {
      return current
    }

    const players = current.players || {}
    const playerIds = Object.keys(players)
    const normalizedHostUserId = players[current.hostUserId] ? current.hostUserId : playerIds[0] || hostUserId
    const normalizedHostDisplayName = players[normalizedHostUserId]?.displayName || current.hostDisplayName
    const normalizedCurrent: MultiplayerRoom = {
      ...current,
      hostUserId: normalizedHostUserId,
      hostDisplayName: normalizedHostDisplayName,
    }

    if (normalizedCurrent.mode !== "competitive" && normalizedCurrent.hostUserId !== hostUserId) {
      return normalizedCurrent
    }

    const count = Object.keys(players).length

    if (normalizedCurrent.status !== "waiting") {
      return normalizedCurrent
    }

    const minimumPlayers = normalizedCurrent.mode === "competitive" ? normalizedCurrent.maxPlayers : 2
    if (count < minimumPlayers) {
      return normalizedCurrent
    }

    return {
      ...normalizedCurrent,
      status: "active" as const,
      startedAt: Date.now(),
      players: Object.fromEntries(
        Object.entries(players).map(([id, player]) => [
          id,
          {
            ...player,
            bestWave: 0,
            finishedAt: undefined,
          },
        ]),
      ),
    }
  })

  if (!transaction.committed) {
    return { ok: false, message: "Nao foi possivel iniciar a sala" }
  }

  const room = transaction.snapshot.val() as MultiplayerRoom | null
  if (!room) {
    return { ok: false, message: "Sala nao encontrada" }
  }

  if (room.status !== "active") {
    if (room.mode !== "competitive" && room.hostUserId !== hostUserId) {
      return { ok: false, message: "Apenas o host pode iniciar" }
    }

    const minPlayers = room.mode === "competitive" ? room.maxPlayers : 2
    if (Object.keys(room.players || {}).length < minPlayers) {
      return {
        ok: false,
        message: room.mode === "competitive" ? `Precisas de ${room.maxPlayers} jogadores para iniciar` : "Precisas de pelo menos 2 jogadores",
      }
    }

    return { ok: false, message: "Sala nao foi iniciada" }
  }

  return { ok: true }
}

export async function updateMultiplayerPlayerWave(params: {
  roomId: string
  userId: string
  displayName: string
  wave: number
}): Promise<void> {
  const db = requireDatabase()
  const playerRef = ref(db, `${ROOM_ROOT}/${params.roomId}/players/${params.userId}`)

  await runTransaction(playerRef, (current: MultiplayerRoomPlayer | null) => {
    const now = Date.now()
    const currentBest = Math.max(0, current?.bestWave || 0)
    return {
      userId: params.userId,
      displayName: params.displayName,
      joinedAt: current?.joinedAt || now,
      bestWave: Math.max(currentBest, Math.max(0, params.wave)),
      finishedAt: current?.finishedAt,
    }
  })
}

export async function markMultiplayerPlayerFinished(params: { roomId: string; userId: string; wave: number }): Promise<void> {
  const db = requireDatabase()
  const roomRef = ref(db, `${ROOM_ROOT}/${params.roomId}`)

  await runTransaction(roomRef, (current: MultiplayerRoom | null) => {
    if (!current?.players?.[params.userId]) {
      return current
    }

    const now = Date.now()
    const player = current.players[params.userId]
    const bestWave = Math.max(player.bestWave || 0, Math.max(0, params.wave))

    const nextPlayers: Record<string, MultiplayerRoomPlayer> = {
      ...current.players,
      [params.userId]: {
        ...player,
        bestWave,
        finishedAt: player.finishedAt || now,
      },
    }

    const everyoneFinished = Object.values(nextPlayers).every((entry) => typeof entry.finishedAt === "number")

    return {
      ...current,
      players: nextPlayers,
      status: everyoneFinished ? "finished" : current.status,
      finishedAt: everyoneFinished ? now : current.finishedAt,
    }
  })
}

export function subscribeMultiplayerRoom(
  roomId: string,
  onRoomUpdate: (room: MultiplayerRoom | null) => void,
  onError?: (error: unknown) => void,
): () => void {
  const db = requireDatabase()
  const roomRef = ref(db, `${ROOM_ROOT}/${roomId}`)

  const unsubscribe = onValue(
    roomRef,
    (snapshot) => {
      onRoomUpdate((snapshot.val() as MultiplayerRoom | null) || null)
    },
    (error) => {
      if (onError) {
        onError(error)
      }
    },
  )

  return () => unsubscribe()
}

export async function submitMonthlyLeaderboardScore(params: {
  userId: string
  displayName: string
  wave: number
  roomId?: string
}): Promise<void> {
  const db = requireDatabase()
  const month = getCurrentMonthKey()
  const monthRef = ref(db, `${LEADERBOARD_ROOT}/${month}`)
  const runRef = push(monthRef)

  if (!runRef.key) {
    throw new Error("Falha ao gerar id da run multiplayer")
  }

  const now = Date.now()
  const payload: MonthlyLeaderboardEntry = {
    runId: runRef.key,
    userId: params.userId,
    displayName: params.displayName,
    wave: Math.max(0, params.wave),
    finishedAt: now,
    roomId: params.roomId,
  }

  await set(runRef, payload)
}

export async function getMonthlyLeaderboard(monthKey: string, limitCount = 50): Promise<MonthlyLeaderboardEntry[]> {
  const db = requireDatabase()
  const leaderboardRef = ref(db, `${LEADERBOARD_ROOT}/${monthKey}`)
  const snapshot = await get(leaderboardRef)

  if (!snapshot.exists()) {
    return []
  }

  const values = (snapshot.val() as Record<string, unknown>) || {}
  const entries: MonthlyLeaderboardEntry[] = Object.values(values)
    .map((entry): MonthlyLeaderboardEntry | null => {
      if (!entry || typeof entry !== "object") {
        return null
      }

      const raw = entry as Partial<MonthlyLeaderboardEntry> & {
        bestWave?: number
        lastUpdatedAt?: number
      }

      const wave = typeof raw.wave === "number" ? raw.wave : typeof raw.bestWave === "number" ? raw.bestWave : 0
      const finishedAt =
        typeof raw.finishedAt === "number" ? raw.finishedAt : typeof raw.lastUpdatedAt === "number" ? raw.lastUpdatedAt : 0

      if (!raw.userId || !raw.displayName) {
        return null
      }

      const normalized: MonthlyLeaderboardEntry = {
        runId: raw.runId || `${raw.userId}-${finishedAt}`,
        userId: raw.userId,
        displayName: raw.displayName,
        wave,
        finishedAt,
      }

      if (raw.roomId) {
        normalized.roomId = raw.roomId
      }

      return normalized
    })
    .filter((entry): entry is MonthlyLeaderboardEntry => entry !== null)

  return entries
    .sort((a, b) => {
      if (b.wave !== a.wave) {
        return b.wave - a.wave
      }
      return (a.finishedAt || 0) - (b.finishedAt || 0)
    })
    .slice(0, limitCount)
}

export async function getAvailableLeaderboardMonths(limitCount = 12): Promise<string[]> {
  const db = requireDatabase()
  const rootRef = ref(db, LEADERBOARD_ROOT)
  const snapshot = await get(rootRef)

  if (!snapshot.exists()) {
    return [getCurrentMonthKey()]
  }

  const months = Object.keys((snapshot.val() as Record<string, unknown>) || {})
    .filter((month) => /^\d{4}-\d{2}$/.test(month))
    .sort((a, b) => b.localeCompare(a))

  if (months.length === 0) {
    return [getCurrentMonthKey()]
  }

  const currentMonth = getCurrentMonthKey()
  if (!months.includes(currentMonth)) {
    months.unshift(currentMonth)
  }

  return months.slice(0, limitCount)
}

export async function submitSoloFarthestRun(params: {
  userId: string
  displayName: string
  wave: number
}): Promise<void> {
  const now = Date.now()
  const fallbackPayload: SoloLeaderboardEntry = {
    runId: `local-${now}-${Math.random().toString(36).slice(2, 8)}`,
    userId: params.userId,
    displayName: params.displayName,
    wave: Math.max(0, params.wave),
    finishedAt: now,
  }

  const db = getFirebaseDb()
  if (!db) {
    appendSoloFallbackRun(fallbackPayload)
    return
  }

  try {
    const rootRef = ref(db, SOLO_LEADERBOARD_ROOT)
    const runRef = push(rootRef)

    if (!runRef.key) {
      appendSoloFallbackRun(fallbackPayload)
      return
    }

    await set(runRef, { ...fallbackPayload, runId: runRef.key })
  } catch {
    appendSoloFallbackRun(fallbackPayload)
  }
}

export async function getSoloFarthestLeaderboard(limitCount = 50): Promise<SoloLeaderboardEntry[]> {
  const localEntries = readSoloFallbackRuns()
  const firebaseEntries: SoloLeaderboardEntry[] = []

  const db = getFirebaseDb()
  if (!db) {
    return sortSoloEntries(localEntries, limitCount)
  }

  try {
    const [newRootSnapshot, legacyMonthlySnapshot] = await Promise.all([
      get(ref(db, SOLO_LEADERBOARD_ROOT)),
      get(ref(db, SOLO_LEADERBOARD_LEGACY_MONTHLY_ROOT)),
    ])

    if (newRootSnapshot.exists()) {
      const values = (newRootSnapshot.val() as Record<string, unknown>) || {}
      Object.values(values).forEach((entry) => {
        const normalized = normalizeSoloEntry(entry)
        if (normalized) {
          firebaseEntries.push(normalized)
        }
      })
    }

    if (legacyMonthlySnapshot.exists()) {
      const monthBuckets = (legacyMonthlySnapshot.val() as Record<string, unknown>) || {}
      Object.values(monthBuckets).forEach((monthEntry) => {
        if (!monthEntry || typeof monthEntry !== "object") {
          return
        }

        Object.values(monthEntry as Record<string, unknown>).forEach((runEntry) => {
          const normalized = normalizeSoloEntry(runEntry)
          if (normalized) {
            firebaseEntries.push(normalized)
          }
        })
      })
    }
  } catch {
    return sortSoloEntries(localEntries, limitCount)
  }

  const mergedByRunId = new Map<string, SoloLeaderboardEntry>()
  firebaseEntries.forEach((entry) => mergedByRunId.set(entry.runId, entry))
  localEntries.forEach((entry) => {
    if (!mergedByRunId.has(entry.runId)) {
      mergedByRunId.set(entry.runId, entry)
    }
  })

  return sortSoloEntries(Array.from(mergedByRunId.values()), limitCount)
}
