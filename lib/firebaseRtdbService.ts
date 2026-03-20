"use client"

import { getFirebaseDb } from "./firebase"
import type { GameState } from "@/hooks/useGameState"
import { ref, set, get, remove } from "firebase/database"

const DEBUG_FIREBASE = false

type NormalizedFirebaseError = {
  code: string
  message: string
  name?: string
}

let hasWarnedAboutLoadFailure = false
let hasWarnedAboutSaveFailure = false

type SlotPathCandidate = {
  path: string
  shape: "direct-slot" | "wrapped-root"
}

function getSlotPathCandidates(userId: string, slotId: number): SlotPathCandidate[] {
  return [
    { path: `games/${userId}/slot-${slotId}`, shape: "direct-slot" },
    { path: `gameSaves/${userId}/slot-${slotId}`, shape: "direct-slot" },
    { path: `gameSaves/${userId}/slots/slot-${slotId}`, shape: "direct-slot" },
    { path: `gameSaves/${userId}`, shape: "wrapped-root" },
  ]
}

function normalizeFirebaseError(error: unknown): NormalizedFirebaseError {
  if (error instanceof Error) {
    return {
      code: ((error as any)?.code || (error as any)?._code || error.name || "UNKNOWN") as string,
      message: error.message || String(error),
      name: error.name,
    }
  }

  if (error && typeof error === "object") {
    const code = ((error as any)?.code || (error as any)?._code || (error as any)?.name || "UNKNOWN") as string
    const message = ((error as any)?.message || JSON.stringify(error) || String(error)) as string
    const name = (error as any)?.name as string | undefined
    return { code, message, name }
  }

  return {
    code: "UNKNOWN",
    message: String(error),
  }
}

function isNonFatalFirebaseError(code: string, message: string): boolean {
  const normalizedCode = code.toLowerCase()
  const normalizedMessage = message.toLowerCase()

  return (
    normalizedCode.includes("permission") ||
    normalizedCode.includes("unauthorized") ||
    normalizedCode.includes("unavailable") ||
    normalizedCode.includes("network") ||
    normalizedMessage.includes("permission") ||
    normalizedMessage.includes("insufficient") ||
    normalizedMessage.includes("network") ||
    normalizedMessage.includes("offline") ||
    normalizedMessage.includes("database")
  )
}

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

    const pathCandidates = getSlotPathCandidates(userId, slotId)
    let lastError: NormalizedFirebaseError | null = null

    for (const candidate of pathCandidates) {
      try {
        const gameRef = ref(database, candidate.path)
        const writePayload =
          candidate.shape === "wrapped-root"
            ? {
                userId,
                slotId,
                gameState: payload,
                updatedAt: Date.now(),
              }
            : payload

        await set(gameRef, writePayload)
        logDebug("[v0] Firebase save success", { slotId, path: candidate.path })
        return true
      } catch (attemptError) {
        const normalizedAttemptError = normalizeFirebaseError(attemptError)
        lastError = normalizedAttemptError
        logDebug("[v0] Firebase save path failed", {
          path: candidate.path,
          code: normalizedAttemptError.code,
        })
      }
    }

    if (lastError) {
      const shouldWarnOnly = isNonFatalFirebaseError(lastError.code, lastError.message)

      if (shouldWarnOnly) {
        if (!hasWarnedAboutSaveFailure) {
          hasWarnedAboutSaveFailure = true
          console.warn("[v0] Firebase save unavailable, using local fallback", {
            userId,
            slotId,
            code: lastError.code,
            message: lastError.message,
            triedPaths: pathCandidates.map((candidate) => candidate.path),
          })
        }
        return false
      }
    }

    return false
  } catch (error) {
    const normalizedError = normalizeFirebaseError(error)
    const shouldWarnOnly = isNonFatalFirebaseError(normalizedError.code, normalizedError.message)

    if (shouldWarnOnly) {
      if (!hasWarnedAboutSaveFailure) {
        hasWarnedAboutSaveFailure = true
        console.warn("[v0] Firebase save unavailable, using local fallback", {
          userId,
          slotId,
          code: normalizedError.code,
          message: normalizedError.message,
        })
      } else {
        logDebug("[v0] Firebase save skipped after previous non-fatal failure", {
          slotId,
          code: normalizedError.code,
        })
      }
      return false
    }

    console.error("[v0] Failed to save to Firebase", {
      userId,
      slotId,
      message: normalizedError.message,
      code: normalizedError.code,
      name: normalizedError.name,
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

    const pathCandidates = getSlotPathCandidates(userId, slotId)
    let lastError: NormalizedFirebaseError | null = null

    for (const candidate of pathCandidates) {
      try {
        const gameRef = ref(database, candidate.path)
        const snapshot = await get(gameRef)

        if (!snapshot.exists()) {
          continue
        }

        const rawData = snapshot.val()
        const slotPayload =
          candidate.shape === "wrapped-root" ? (rawData?.slotId === slotId ? rawData?.gameState : null) : rawData

        const normalizedState = normalizeLoadedGameState(slotPayload)

        if (!normalizedState) {
          continue
        }

        logDebug("[v0] Firebase load success", {
          slotId,
          path: candidate.path,
          activePokemon: normalizedState.activePokemon,
          battles: normalizedState.battles,
        })
        return normalizedState
      } catch (attemptError) {
        const normalizedAttemptError = normalizeFirebaseError(attemptError)
        lastError = normalizedAttemptError
        logDebug("[v0] Firebase load path failed", {
          path: candidate.path,
          code: normalizedAttemptError.code,
        })
      }
    }

    if (lastError) {
      const shouldWarnOnly = isNonFatalFirebaseError(lastError.code, lastError.message)

      if (shouldWarnOnly) {
        if (!hasWarnedAboutLoadFailure) {
          hasWarnedAboutLoadFailure = true
          console.warn("[v0] Firebase load unavailable, continuing with empty slots", {
            userId,
            code: lastError.code,
            message: lastError.message,
            triedPaths: pathCandidates.map((candidate) => candidate.path),
          })
        }
        return null
      }
    }

    logDebug("[v0] No data found in Firebase for slot", { slotId })
    return null
  } catch (error) {
    const normalizedError = normalizeFirebaseError(error)
    const shouldWarnOnly = isNonFatalFirebaseError(normalizedError.code, normalizedError.message)

    if (shouldWarnOnly) {
      if (!hasWarnedAboutLoadFailure) {
        hasWarnedAboutLoadFailure = true
        console.warn("[v0] Firebase load unavailable, continuing with empty slots", {
          userId,
          code: normalizedError.code,
          message: normalizedError.message,
        })
      } else {
        logDebug("[v0] Firebase load skipped after previous non-fatal failure", {
          slotId,
          code: normalizedError.code,
        })
      }
      return null
    }

    console.error("[v0] Failed to load from Firebase", {
      userId,
      slotId,
      message: normalizedError.message,
      code: normalizedError.code,
      name: normalizedError.name,
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

    const pathCandidates = getSlotPathCandidates(userId, slotId)
    let deleted = false

    for (const candidate of pathCandidates) {
      try {
        const gameRef = ref(database, candidate.path)
        await remove(gameRef)
        deleted = true
      } catch (attemptError) {
        const normalizedAttemptError = normalizeFirebaseError(attemptError)
        logDebug("[v0] Firebase delete path failed", {
          path: candidate.path,
          code: normalizedAttemptError.code,
        })
      }
    }

    if (deleted) {
      logDebug("[v0] Firebase delete success", { slotId })
    }

    return deleted
  } catch (error) {
    const normalizedError = normalizeFirebaseError(error)
    console.error("[v0] Failed to delete from Firebase", {
      slotId,
      message: normalizedError.message,
      code: normalizedError.code,
      name: normalizedError.name,
      error,
    })
    return false
  }
}
