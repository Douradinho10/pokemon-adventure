"use client"

import { getFirebaseDb } from "./firebase"
import type { GameState } from "@/hooks/useGameState"
import { ref, set, get, remove } from "firebase/database"

const DEBUG_FIREBASE = false

function logDebug(message: string, details?: Record<string, unknown>) {
  if (!DEBUG_FIREBASE) {
    return
  }

  if (details) {
    console.log(message, details)
    return
  }

  console.log(message)
}

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .map((item) => stripUndefinedDeep(item))
      .filter((item) => item !== undefined) as T
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([entryKey, entryValue]) => [entryKey, stripUndefinedDeep(entryValue)])

    return Object.fromEntries(entries) as T
  }

  return value
}

function normalizeLoadedGameState(rawState: unknown): GameState | null {
  if (!rawState || typeof rawState !== "object") {
    return null
  }

  const state = rawState as Partial<GameState>

  return {
    playerTeam: state.playerTeam || {},
    activePokemon: state.activePokemon || null,
    currentEnvironment: state.currentEnvironment || "planicie",
    money: typeof state.money === "number" ? state.money : 50,
    battles: typeof state.battles === "number" ? state.battles : 0,
    inventory: state.inventory || { Pokébola: 5, "Scanner Tático": 3 },
    capturedPokemon: Array.isArray(state.capturedPokemon) ? state.capturedPokemon : [],
    currentBattle: state.currentBattle || null,
  }
}

export async function saveGameToFirebase(userId: string, gameState: GameState, slotId: number): Promise<boolean> {
  try {
    const database = getFirebaseDb()
    if (!database) {
      console.warn("[v0] Firebase database not available for save", {
        userId,
        slotId,
      })
      return false
    }

    if (!userId || userId.trim() === "") {
      console.warn("[v0] Skipping Firebase save: missing userId")
      return false
    }

    if (typeof slotId !== "number" || slotId < 0 || slotId > 4) {
      console.warn("[v0] Skipping Firebase save: invalid slotId", { slotId })
      return false
    }

    if (!gameState || typeof gameState !== "object") {
      console.warn("[v0] Skipping Firebase save: invalid gameState")
      return false
    }

    const gameRef = ref(database, `games/${userId}/slot-${slotId}`)
    const payload = stripUndefinedDeep({
      ...gameState,
      lastSaved: new Date().toISOString(),
    })

    logDebug("[v0] Attempting Firebase save", {
      userId,
      slotId,
      payloadSize: JSON.stringify(payload).length,
      activePokemon: gameState.activePokemon,
      battles: gameState.battles,
    })

    await set(gameRef, payload)
    logDebug("[v0] Firebase save success", { slotId })
    return true
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorCode = (error as any)?.code || "UNKNOWN"
    console.error("[v0] Failed to save to Firebase", {
      userId,
      slotId,
      message: errorMessage,
      code: errorCode,
      error,
    })
    return false
  }
}

export async function loadGameFromFirebase(userId: string, slotId: number): Promise<GameState | null> {
  try {
    const database = getFirebaseDb()
    if (!database) {
      console.warn("[v0] Firebase database not available for load", {
        userId,
        slotId,
      })
      return null
    }

    if (!userId || userId.trim() === "") {
      console.warn("[v0] Skipping Firebase load: missing userId")
      return null
    }

    if (typeof slotId !== "number" || slotId < 0 || slotId > 4) {
      console.warn("[v0] Skipping Firebase load: invalid slotId", { slotId })
      return null
    }

    logDebug("[v0] Attempting Firebase load", { userId, slotId })

    const gameRef = ref(database, `games/${userId}/slot-${slotId}`)
    const snapshot = await get(gameRef)

    if (snapshot.exists()) {
      const data = snapshot.val()
      const normalizedState = normalizeLoadedGameState(data)
      logDebug("[v0] Firebase load success", {
        slotId,
        activePokemon: normalizedState?.activePokemon,
        battles: normalizedState?.battles,
      })
      return normalizedState
    }

    logDebug("[v0] No data found in Firebase for slot", { slotId })
    return null
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorCode = (error as any)?.code || "UNKNOWN"
    console.error("[v0] Failed to load from Firebase", {
      userId,
      slotId,
      message: errorMessage,
      code: errorCode,
      error,
    })
    return null
  }
}

export async function deleteGameFromFirebase(userId: string, slotId: number): Promise<boolean> {
  try {
    const database = getFirebaseDb()
    if (!database) {
      console.warn("[v0] Firebase database not available, delete skipped")
      return false
    }

    const gameRef = ref(database, `games/${userId}/slot-${slotId}`)
    await remove(gameRef)
    logDebug("[v0] Firebase delete success", { slotId })
    return true
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorCode = (error as any)?.code || "UNKNOWN"
    console.error("[v0] Failed to delete from Firebase", {
      slotId,
      message: errorMessage,
      code: errorCode,
      error,
    })
    return false
  }
}
