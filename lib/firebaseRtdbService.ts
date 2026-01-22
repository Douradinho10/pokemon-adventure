"use client"

import { getFirebaseDb } from "./firebase"
import type { GameState } from "@/hooks/useGameState"
import { ref, set, get, remove } from "firebase/database"

export async function saveGameToFirebase(userId: string, gameState: GameState, slotId: number): Promise<boolean> {
  try {
    const database = getFirebaseDb()
    if (!database) {
      console.log("[v0] Firebase database not available, save skipped")
      return false
    }

    const gameRef = ref(database, `games/${userId}/slot-${slotId}`)
    await set(gameRef, {
      ...gameState,
      lastSaved: new Date().toISOString(),
    })
    console.log("[v0] Game saved to Firebase slot:", slotId)
    return true
  } catch (error) {
    console.log("[v0] Failed to save to Firebase:", error instanceof Error ? error.message : String(error))
    return false
  }
}

export async function loadGameFromFirebase(userId: string, slotId: number): Promise<GameState | null> {
  try {
    const database = getFirebaseDb()
    if (!database) {
      console.log("[v0] Firebase database not available, load skipped")
      return null
    }

    const gameRef = ref(database, `games/${userId}/slot-${slotId}`)
    const snapshot = await get(gameRef)

    if (snapshot.exists()) {
      const data = snapshot.val()
      console.log("[v0] Game loaded from Firebase slot:", slotId)
      return data
    }
    return null
  } catch (error) {
    console.log("[v0] Failed to load from Firebase:", error instanceof Error ? error.message : String(error))
    return null
  }
}

export async function deleteGameFromFirebase(userId: string, slotId: number): Promise<boolean> {
  try {
    const database = getFirebaseDb()
    if (!database) {
      console.log("[v0] Firebase database not available, delete skipped")
      return false
    }

    const gameRef = ref(database, `games/${userId}/slot-${slotId}`)
    await remove(gameRef)
    console.log("[v0] Game deleted from Firebase slot:", slotId)
    return true
  } catch (error) {
    console.log("[v0] Failed to delete from Firebase:", error instanceof Error ? error.message : String(error))
    return false
  }
}
