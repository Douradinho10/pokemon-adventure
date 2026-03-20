"use client"

import { useEffect, useCallback, useRef, useState } from "react"
import { onAuthStateChanged } from "firebase/auth"
import { useGameState } from "./useGameState"
import type { GameState } from "./useGameState"
import { saveGameToFirebase, loadGameFromFirebase, deleteGameFromFirebase } from "../lib/firebaseRtdbService"
import { getFirebaseAuth, initializeFirebase } from "../lib/firebase"
import { starterPokemon, wildPokemon } from "../data/pokemonData"
import { getPokemonSpriteSet, getPokemonSpriteUrl } from "../lib/utils"

const GAME_SAVE_KEY = "pokemon-adventure-saves"

function migrateGameStateSprites(gameState: GameState): GameState {
  const migratedTeam = Object.fromEntries(
    Object.entries(gameState.playerTeam).map(([name, pokemon]) => {
      const datasetSprite = starterPokemon[name]?.sprite || wildPokemon[name]?.sprite
      return [
        name,
        {
          ...pokemon,
          sprite: getPokemonSpriteUrl(name, datasetSprite || pokemon.sprite, "original", Boolean(pokemon.isShiny)),
          spriteSet: getPokemonSpriteSet(name, datasetSprite || pokemon.sprite, Boolean(pokemon.isShiny)),
        },
      ]
    }),
  )

  const migratedBattle = gameState.currentBattle
    ? {
        ...gameState.currentBattle,
        playerSprite: getPokemonSpriteUrl(
          gameState.activePokemon,
          migratedTeam[gameState.activePokemon ?? ""]?.sprite,
          "back",
          Boolean(migratedTeam[gameState.activePokemon ?? ""]?.isShiny),
        ),
        enemyDisplayName: gameState.currentBattle.enemyDisplayName,
        enemySprite: getPokemonSpriteUrl(
          gameState.currentBattle.enemyDisplayName || gameState.currentBattle.enemyName,
          wildPokemon[gameState.currentBattle.enemyDisplayName || gameState.currentBattle.enemyName]?.sprite,
          "front",
          Boolean(gameState.currentBattle.enemyIsShiny),
        ),
      }
    : null

  return {
    ...gameState,
    playerTeam: migratedTeam,
    currentBattle: migratedBattle,
  }
}

function getAuthenticatedUserId(): string | null {
  const auth = getFirebaseAuth()
  return auth?.currentUser?.uid ?? null
}

export interface SaveSlot {
  id: number
  gameState: GameState | null
}

function getDefaultSaveSlots(): SaveSlot[] {
  return Array.from({ length: 5 }, (_, i) => ({ id: i, gameState: null }))
}

function normalizeSaveSlots(slots: unknown): SaveSlot[] {
  if (!Array.isArray(slots)) {
    return getDefaultSaveSlots()
  }

  return getDefaultSaveSlots().map((defaultSlot, index) => {
    const slot = slots[index]

    if (!slot || typeof slot !== "object") {
      return defaultSlot
    }

    const candidate = slot as Partial<SaveSlot>
    return {
      id: typeof candidate.id === "number" ? candidate.id : index,
      gameState: candidate.gameState ?? null,
    }
  })
}

export const useLocalGameState = () => {
  const gameStateHook = useGameState()
  const { gameState, setGameState } = gameStateHook
  const [isLoading, setIsLoading] = useState(true)
  const [saveSlots, setSaveSlots] = useState<SaveSlot[]>(getDefaultSaveSlots)
  const [currentSlot, setCurrentSlot] = useState<number | null>(null)
  const [saveSource, setSaveSource] = useState<"firebase" | "local">("local")
  const [authenticatedUserId, setAuthenticatedUserId] = useState<string | null>(null)
  const [authResolved, setAuthResolved] = useState(false)
  const [saveRetryTick, setSaveRetryTick] = useState(0)
  const lastSavedSnapshotRef = useRef<string>("")
  const authRetryTimeoutRef = useRef<number | null>(null)
  const saveRetryTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") {
      setIsLoading(false)
      return
    }

    let cancelled = false
    let unsubscribe: (() => void) | null = null
    let retries = 0

    const connectAuthListener = () => {
      if (cancelled) return

      initializeFirebase()
      const auth = getFirebaseAuth()

      if (!auth) {
        if (retries >= 20) {
          setAuthenticatedUserId(null)
          setAuthResolved(true)
          setIsLoading(false)
          return
        }

        retries += 1
        authRetryTimeoutRef.current = window.setTimeout(connectAuthListener, 250)
        return
      }

      unsubscribe = onAuthStateChanged(auth, (user) => {
        setAuthenticatedUserId(user?.uid ?? null)
        setAuthResolved(true)
      })
    }

    connectAuthListener()

    return () => {
      cancelled = true
      if (unsubscribe) {
        unsubscribe()
      }
      if (authRetryTimeoutRef.current) {
        window.clearTimeout(authRetryTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const loadSlots = async () => {
      try {
        if (!authResolved) {
          return
        }

        if (!authenticatedUserId) {
          setSaveSlots(getDefaultSaveSlots())
          setCurrentSlot(null)
          lastSavedSnapshotRef.current = ""
          setSaveSource("local")
          setIsLoading(false)
          return
        }

        setIsLoading(true)

        console.log("[v0] Loading save slots from Firebase for user:", authenticatedUserId)

        const loadedStates = await Promise.all(
          getDefaultSaveSlots().map((slot) => {
            console.log("[v0] Loading slot", slot.id, "...")
            return loadGameFromFirebase(authenticatedUserId, slot.id)
          }),
        )

        console.log("[v0] All slots loaded, results:", {
          slot0: loadedStates[0] ? "✓" : "empty",
          slot1: loadedStates[1] ? "✓" : "empty",
          slot2: loadedStates[2] ? "✓" : "empty",
          slot3: loadedStates[3] ? "✓" : "empty",
          slot4: loadedStates[4] ? "✓" : "empty",
        })

        const migratedSlots = getDefaultSaveSlots().map((slot, index) => ({
          ...slot,
          gameState: loadedStates[index] ? migrateGameStateSprites(loadedStates[index] as GameState) : null,
        }))

        setSaveSlots(migratedSlots)
        setSaveSource("firebase")
        setIsLoading(false)
      } catch (error) {
        console.error("[v0] Error loading slots:", error)
        setIsLoading(false)
      }
    }

    loadSlots()
  }, [authResolved, authenticatedUserId])

  useEffect(() => {
    if (isLoading || !authenticatedUserId || !gameState.activePokemon || currentSlot === null) {
      if (!authenticatedUserId) console.log("[v0] Save skipped: not authenticated")
      if (currentSlot === null) console.log("[v0] Save skipped: no slot selected")
      if (!gameState.activePokemon) console.log("[v0] Save skipped: no active pokemon")
      if (isLoading) console.log("[v0] Save skipped: still loading slots")
      return
    }

    const snapshot = JSON.stringify(gameState)
    if (snapshot === lastSavedSnapshotRef.current) {
      console.log("[v0] Save skipped: state unchanged")
      return
    }

    console.log("[v0] Save triggered - scheduling auto-save in 250ms", {
      userId: authenticatedUserId,
      slot: currentSlot,
      activePokemon: gameState.activePokemon,
    })

    const timeoutId = window.setTimeout(() => {
      const saveGame = async () => {
        try {
          setSaveSlots((previousSlots) => {
            const nextSlots = [...previousSlots]
            nextSlots[currentSlot] = {
              ...nextSlots[currentSlot],
              gameState: { ...gameState },
            }
            return nextSlots
          })

          console.log("[v0] Calling saveGameToFirebase...", {
            userId: authenticatedUserId,
            slot: currentSlot,
          })

          const saved = await saveGameToFirebase(authenticatedUserId, gameState, currentSlot)

          console.log("[v0] Save result:", {
            success: saved,
            userId: authenticatedUserId,
            slot: currentSlot,
            saveSource: saved ? "firebase" : "local",
          })

          setSaveSource(saved ? "firebase" : "local")
          if (saved) {
            lastSavedSnapshotRef.current = snapshot
            if (saveRetryTimeoutRef.current) {
              window.clearTimeout(saveRetryTimeoutRef.current)
              saveRetryTimeoutRef.current = null
            }
            console.log("[v0] ✓ Save successful, cleared retry timer")
          } else if (!saveRetryTimeoutRef.current) {
            console.log("[v0] Save failed, scheduling retry in 1200ms")
            saveRetryTimeoutRef.current = window.setTimeout(() => {
              saveRetryTimeoutRef.current = null
              console.log("[v0] Retrying save...")
              setSaveRetryTick((previous) => previous + 1)
            }, 1200)
          }
        } catch (error) {
          console.error("[v0] Error saving game:", error)
          if (!saveRetryTimeoutRef.current) {
            console.log("[v0] Exception during save, scheduling retry in 1200ms")
            saveRetryTimeoutRef.current = window.setTimeout(() => {
              saveRetryTimeoutRef.current = null
              setSaveRetryTick((previous) => previous + 1)
            }, 1200)
          }
        }
      }

      saveGame()
    }, 250)

    return () => window.clearTimeout(timeoutId)
  }, [authenticatedUserId, currentSlot, gameState, isLoading, saveRetryTick])

  useEffect(() => {
    return () => {
      if (saveRetryTimeoutRef.current) {
        window.clearTimeout(saveRetryTimeoutRef.current)
      }
    }
  }, [])

  const loadSlotGame = useCallback(
    (slotId: number) => {
      const slot = saveSlots[slotId]
      if (slot.gameState) {
        setGameState(slot.gameState)
        setCurrentSlot(slotId)
        lastSavedSnapshotRef.current = JSON.stringify(slot.gameState)
      }
    },
    [saveSlots, setGameState],
  )

  const startNewGameInSlot = useCallback(
    (slotId: number) => {
      const newGameState: GameState = {
        playerTeam: {},
        activePokemon: null,
        currentEnvironment: "planicie",
        money: 50,
        battles: 0,
        inventory: { Pokébola: 5, "Scanner Tático": 3 },
        capturedPokemon: [],
        currentBattle: null,
      }

      setGameState(newGameState)
      setCurrentSlot(slotId)
      lastSavedSnapshotRef.current = JSON.stringify(newGameState)
    },
    [setGameState],
  )

  const deleteSaveSlot = useCallback(
    async (slotId?: number) => {
      try {
        const slotToDelete = slotId ?? currentSlot

        if (slotToDelete === null) return

        const newSlots = [...saveSlots]
        newSlots[slotToDelete].gameState = null

        setSaveSlots(newSlots)

        if (currentSlot === slotToDelete) {
          setCurrentSlot(null)
          lastSavedSnapshotRef.current = ""
          const defaultGameState: GameState = {
            playerTeam: {},
            activePokemon: null,
            currentEnvironment: "planicie",
            money: 50,
            battles: 0,
            inventory: { Pokébola: 5, "Scanner Tático": 3 },
            capturedPokemon: [],
            currentBattle: null,
          }
          setGameState(defaultGameState)
        }

        if (authenticatedUserId) {
          await deleteGameFromFirebase(authenticatedUserId, slotToDelete)
        }
      } catch (error) {
        console.error("[v0] Error deleting slot:", error)
      }
    },
    [authenticatedUserId, currentSlot, saveSlots, setGameState],
  )

  return {
    ...gameStateHook,
    isLoading,
    saveSlots,
    setSaveSlots,
    currentSlot,
    loadSlotGame,
    startNewGameInSlot,
    deleteSaveSlot,
    saveSource,
    GAME_SAVE_KEY,
  }
}
