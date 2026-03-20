import type { GameState } from "../hooks/useGameState"

const SAVE_KEY = "pokemon_adventure_save"

function safeParseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export function readJsonFromLocalStorage<T>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(key)
    if (!saved) return fallback

    const parsed = safeParseJson(saved, fallback)
    if (parsed === fallback) {
      localStorage.removeItem(key)
      console.warn(`[v0] Invalid JSON found in localStorage key \"${key}\". Resetting stored value.`)
    }

    return parsed
  } catch {
    return fallback
  }
}

// Save game state to localStorage
export function saveGameToLocalStorage(gameState: GameState): void {
  try {
    const saveData = {
      gameState,
      savedAt: new Date().toISOString(),
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify(saveData))
    console.log("[v0] Game saved to localStorage")
  } catch (error) {
    console.error("[v0] Error saving to localStorage:", error)
  }
}

// Load game state from localStorage
export function loadGameFromLocalStorage(): GameState | null {
  try {
    const saved = readJsonFromLocalStorage<{ gameState: GameState } | null>(SAVE_KEY, null)
    if (!saved) return null

    const { gameState } = saved
    console.log("[v0] Game loaded from localStorage")
    return gameState
  } catch (error) {
    console.error("[v0] Error loading from localStorage:", error)
    return null
  }
}

// Check if there's a saved game
export function hasSavedGame(): boolean {
  try {
    const saved = readJsonFromLocalStorage<{ gameState: GameState } | null>(SAVE_KEY, null)
    if (!saved) return false

    const { gameState } = saved
    // Check if there's an active Pokemon (game has started)
    return gameState && gameState.activePokemon !== null
  } catch (error) {
    return false
  }
}

// Clear saved game
export function clearSavedGame(): void {
  try {
    localStorage.removeItem(SAVE_KEY)
    console.log("[v0] Saved game cleared")
  } catch (error) {
    console.error("[v0] Error clearing saved game:", error)
  }
}
