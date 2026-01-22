import { getFirebaseDb, isFirebaseReady, getFirebaseError } from "./firebase"
import { ref, set, get, remove, push } from "firebase/database"
import type { GameState } from "../hooks/useGameState"

export interface GameSave {
  id: string
  userId: string
  gameState: GameState
  updatedAt: number
  createdAt: number
}

export interface GameRun {
  id: string
  userId: string
  startedAt: number
  endedAt?: number
  totalBattles: number
  totalMoney: number
  pokemonCaught: number
  finalTeam: Record<string, any>
  isActive: boolean
}

function getDb() {
  if (!isFirebaseReady()) {
    const error = getFirebaseError()
    if (error) {
      throw error
    }
    throw new Error("Firebase is not initialized. Please check your Firebase configuration.")
  }

  const db = getFirebaseDb()
  if (!db) {
    throw new Error("Realtime Database instance is not available.")
  }
  return db
}

// Save current game state
export async function saveGameState(userId: string, gameState: GameState): Promise<void> {
  try {
    console.log("[v0] saveGameState: Starting...")
    const db = getDb()
    console.log("[v0] saveGameState: Got database")
    const saveRef = ref(db, `gameSaves/${userId}`)
    console.log("[v0] saveGameState: Created ref")
    await set(saveRef, {
      userId,
      gameState,
      updatedAt: Date.now(),
      createdAt: Date.now(),
    })
    console.log("[v0] saveGameState: Data saved successfully")
  } catch (error) {
    console.error("[v0] saveGameState error:", error)
    throw error
  }
}

// Load saved game state
export async function loadGameState(userId: string): Promise<GameState | null> {
  try {
    const db = getDb()
    const saveRef = ref(db, `gameSaves/${userId}`)
    const snapshot = await get(saveRef)

    if (snapshot.exists()) {
      const data = snapshot.val()
      console.log("[v0] Game state loaded from Realtime Database")
      return data.gameState as GameState
    }

    return null
  } catch (error) {
    console.error("[v0] Error loading game state:", error)
    return null
  }
}

// Start a new game run
export async function startGameRun(userId: string, gameState: GameState): Promise<string> {
  try {
    const db = getDb()
    const runsRef = ref(db, `gameRuns/${userId}`)
    const newRunRef = push(runsRef)

    await set(newRunRef, {
      userId,
      startedAt: Date.now(),
      totalBattles: gameState.battles,
      totalMoney: gameState.money,
      pokemonCaught: gameState.capturedPokemon.length,
      finalTeam: gameState.playerTeam,
      isActive: true,
    })
    console.log("[v0] New game run started:", newRunRef.key)
    return newRunRef.key!
  } catch (error) {
    console.error("[v0] Error starting game run:", error)
    throw error
  }
}

// Update game run
export async function updateGameRun(runId: string, userId: string, gameState: GameState): Promise<void> {
  try {
    const db = getDb()
    const runRef = ref(db, `gameRuns/${userId}/${runId}`)
    await set(
      runRef,
      {
        totalBattles: gameState.battles,
        totalMoney: gameState.money,
        pokemonCaught: gameState.capturedPokemon.length,
        finalTeam: gameState.playerTeam,
      },
      { merge: true },
    )
    console.log("[v0] Game run updated")
  } catch (error) {
    console.error("[v0] Error updating game run:", error)
  }
}

// End game run
export async function endGameRun(runId: string, userId: string, gameState: GameState): Promise<void> {
  try {
    const db = getDb()
    const runRef = ref(db, `gameRuns/${userId}/${runId}`)
    await set(
      runRef,
      {
        endedAt: Date.now(),
        totalBattles: gameState.battles,
        totalMoney: gameState.money,
        pokemonCaught: gameState.capturedPokemon.length,
        finalTeam: gameState.playerTeam,
        isActive: false,
      },
      { merge: true },
    )
    console.log("[v0] Game run ended")
  } catch (error) {
    console.error("[v0] Error ending game run:", error)
  }
}

// Get user's game runs history
export async function getUserGameRuns(userId: string, limitCount = 10): Promise<GameRun[]> {
  try {
    const db = getDb()
    const runsRef = ref(db, `gameRuns/${userId}`)
    const snapshot = await get(runsRef)

    const runs: GameRun[] = []

    if (snapshot.exists()) {
      const data = snapshot.val()
      Object.entries(data).forEach(([key, value]: [string, any]) => {
        runs.push({
          id: key,
          userId: value.userId,
          startedAt: value.startedAt,
          endedAt: value.endedAt,
          totalBattles: value.totalBattles,
          totalMoney: value.totalMoney,
          pokemonCaught: value.pokemonCaught,
          finalTeam: value.finalTeam,
          isActive: value.isActive,
        })
      })
    }

    console.log("[v0] Loaded", runs.length, "game runs")
    return runs.sort((a, b) => b.startedAt - a.startedAt).slice(0, limitCount)
  } catch (error) {
    console.error("[v0] Error getting game runs:", error)
    return []
  }
}

// Delete saved game
export async function deleteSavedGame(userId: string): Promise<void> {
  try {
    const db = getDb()
    const saveRef = ref(db, `gameSaves/${userId}`)
    await remove(saveRef)
    console.log("[v0] Saved game deleted")
  } catch (error) {
    console.error("[v0] Error deleting saved game:", error)
  }
}

export async function clearAllData(): Promise<void> {
  try {
    const db = getDb()
    const rootRef = ref(db)
    await remove(rootRef)
    console.log("[v0] All data cleared from database")
  } catch (error) {
    console.error("[v0] Error clearing database:", error)
  }
}
