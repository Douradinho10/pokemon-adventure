import type { GameState } from "../hooks/useGameState"

const SAVE_KEY = "pokemon_adventure_save"

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
    const saved = localStorage.getItem(SAVE_KEY)
    if (!saved) return null

    const { gameState } = JSON.parse(saved)
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
    const saved = localStorage.getItem(SAVE_KEY)
    if (!saved) return false

    const { gameState } = JSON.parse(saved)
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
