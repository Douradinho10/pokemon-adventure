"use client"

import { useEffect, useCallback, useState } from "react"
import { useGameState } from "./useGameState"
import type { GameState } from "./useGameState"
import { saveGameToFirebase, deleteGameFromFirebase } from "../lib/firebaseRtdbService"

const GAME_SAVE_KEY = "pokemon-adventure-saves"
const USER_ID_KEY = "pokemon-adventure-user-id"
const CURRENT_SLOT_KEY = "pokemon-adventure-current-slot"

function getUserId(): string {
  if (typeof window === "undefined") return "server"

  let userId = localStorage.getItem(USER_ID_KEY)
  if (!userId) {
    userId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    localStorage.setItem(USER_ID_KEY, userId)
  }
  return userId
}

export interface SaveSlot {
  id: number
  gameState: GameState | null
}

export const useLocalGameState = () => {
  const gameStateHook = useGameState()
  const { gameState, setGameState } = gameStateHook
  const [isLoading, setIsLoading] = useState(true)
  const [saveSlots, setSaveSlots] = useState<SaveSlot[]>(
    Array.from({ length: 5 }, (_, i) => ({ id: i, gameState: null })),
  )
  const [currentSlot, setCurrentSlot] = useState<number | null>(null)
  const [lastBattlesSaved, setLastBattlesSaved] = useState(0)
  const [saveSource, setSaveSource] = useState<"firebase" | "local">("local")

  useEffect(() => {
    if (typeof window === "undefined") {
      setIsLoading(false)
      return
    }

    const loadSlots = async () => {
      try {
        const userId = getUserId()
        const saved = localStorage.getItem(GAME_SAVE_KEY)
        const slots: SaveSlot[] = saved
          ? JSON.parse(saved)
          : Array.from({ length: 5 }, (_, i) => ({ id: i, gameState: null }))

        setSaveSlots(slots)
        setIsLoading(false)
      } catch (error) {
        console.error("[v0] Error loading slots:", error)
        setIsLoading(false)
      }
    }

    loadSlots()
  }, [setGameState])

  useEffect(() => {
    if (!gameState.activePokemon || currentSlot === null) return

    if (gameState.battles !== lastBattlesSaved) {
      const saveGame = async () => {
        try {
          const userId = getUserId()
          const newSlots = [...saveSlots]
          newSlots[currentSlot].gameState = { ...gameState }

          setSaveSlots(newSlots)
          localStorage.setItem(GAME_SAVE_KEY, JSON.stringify(newSlots))
          localStorage.setItem(CURRENT_SLOT_KEY, String(currentSlot))

          const saved = await saveGameToFirebase(userId, gameState, currentSlot)
          if (saved) {
            setSaveSource("firebase")
          } else {
            setSaveSource("local")
          }

          setLastBattlesSaved(gameState.battles)
        } catch (error) {
          console.error("[v0] Error saving game:", error)
        }
      }

      saveGame()
    }
  }, [gameState, lastBattlesSaved, currentSlot, saveSlots])

  const loadSlotGame = useCallback(
    (slotId: number) => {
      const slot = saveSlots[slotId]
      if (slot.gameState) {
        setGameState(slot.gameState)
        setCurrentSlot(slotId)
        localStorage.setItem(CURRENT_SLOT_KEY, String(slotId))
        setLastBattlesSaved(slot.gameState.battles || 0)
      }
    },
    [saveSlots, setGameState],
  )

  const startNewGameInSlot = useCallback(
    (slotId: number) => {
      const newGameState = {
        playerTeam: {},
        activePokemon: null,
        money: 50,
        battles: 0,
        inventory: { Pokébola: 5 },
        capturedPokemon: [],
        currentBattle: null,
      }

      setGameState(newGameState)
      setCurrentSlot(slotId)
      localStorage.setItem(CURRENT_SLOT_KEY, String(slotId))
      setLastBattlesSaved(0)
    },
    [setGameState],
  )

  const deleteSaveSlot = useCallback(
    async (slotId?: number) => {
      try {
        const userId = getUserId()
        const slotToDelete = slotId ?? currentSlot

        if (slotToDelete === null) return

        const newSlots = [...saveSlots]
        newSlots[slotToDelete].gameState = null

        setSaveSlots(newSlots)
        localStorage.setItem(GAME_SAVE_KEY, JSON.stringify(newSlots))

        if (currentSlot === slotToDelete) {
          setCurrentSlot(null)
          const defaultGameState: GameState = {
            playerTeam: {},
            activePokemon: null,
            money: 50,
            battles: 0,
            inventory: { Pokébola: 5 },
            capturedPokemon: [],
            currentBattle: null,
            xp: 0,
          }
          setGameState(defaultGameState)
        }

        await deleteGameFromFirebase(userId, slotToDelete)
      } catch (error) {
        console.error("[v0] Error deleting slot:", error)
      }
    },
    [currentSlot, saveSlots, setGameState],
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
