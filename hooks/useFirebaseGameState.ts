"use client"

import { useEffect, useRef, useCallback, useState } from "react"
import { useGameState } from "./useGameState"
import {
  saveGameState,
  loadGameState,
  startGameRun,
  updateGameRun,
  endGameRun,
  deleteSavedGame,
} from "../lib/gameService"
import { initializeFirebase, isFirebaseReady } from "../lib/firebase"

export const useFirebaseGameState = (userId: string | null) => {
  const gameStateHook = useGameState()
  const { gameState, setGameState } = gameStateHook
  const currentRunId = useRef<string | null>(null)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastSavedState = useRef<string>("")
  const [firebaseReady, setFirebaseReady] = useState(false)
  const [firebaseError, setFirebaseError] = useState<Error | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return

    const { error } = initializeFirebase()

    if (error) {
      // Silently handle Firebase unavailability - expected in v0 preview
      setFirebaseError(error)
      setFirebaseReady(false)
    } else if (isFirebaseReady()) {
      setFirebaseReady(true)
      setFirebaseError(null)
    }
  }, [])

  useEffect(() => {
    if (!userId || !firebaseReady) return

    const loadSavedGame = async () => {
      try {
        const savedState = await loadGameState(userId)
        if (savedState && savedState.activePokemon) {
          setGameState(savedState)

          // Start a new run if there's an active game
          const runId = await startGameRun(userId, savedState)
          currentRunId.current = runId
        }
      } catch (error) {
        // Silently handle errors
      }
    }

    loadSavedGame()
  }, [userId, firebaseReady, setGameState])

  useEffect(() => {
    if (!userId || !gameState.activePokemon || !firebaseReady) return

    const stateString = JSON.stringify(gameState)

    // Skip if state hasn't changed
    if (stateString === lastSavedState.current) return

    lastSavedState.current = stateString

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    // Debounce save for 2 seconds
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await saveGameState(userId, gameState)

        // Update current run if exists
        if (currentRunId.current) {
          await updateGameRun(currentRunId.current, userId, gameState)
        } else {
          // Start new run if none exists
          const runId = await startGameRun(userId, gameState)
          currentRunId.current = runId
        }
      } catch (error) {
        // Silently handle save errors
      }
    }, 2000)

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [userId, gameState, firebaseReady])

  // End run on game over
  const handleGameOver = useCallback(async () => {
    if (!userId || !currentRunId.current) return

    try {
      await endGameRun(currentRunId.current, userId, gameState)
      await deleteSavedGame(userId)
      currentRunId.current = null
    } catch (error) {
      // Silently handle errors
    }
  }, [userId, gameState])

  return {
    ...gameStateHook,
    handleGameOver,
    currentRunId: currentRunId.current,
    firebaseReady,
    firebaseError,
  }
}
