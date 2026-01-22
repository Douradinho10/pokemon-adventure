"use client"

import { useState, useCallback } from "react"

export interface Pokemon {
  HP: number
  maxHP: number
  attacks: Record<string, [number, number]>
  attackPP?: Record<string, { current: number; max: number }>
  level: number
  xp: number
  sprite: string
  type?: string
  pendingAttacks?: Record<string, [number, number]>
  speed?: number
}

export interface Battle {
  enemyName: string
  enemyType: string
  enemyHP: number
  enemyMaxHP: number
  enemyLevel: number
  enemyAttacks: Record<string, [number, number]>
  enemySpeed?: number
}

export interface GameState {
  playerTeam: Record<string, Pokemon>
  activePokemon: string | null
  money: number
  battles: number
  inventory: Record<string, number>
  capturedPokemon: string[]
  currentBattle: Battle | null
}

export const useGameState = () => {
  const [gameState, setGameState] = useState<GameState>({
    playerTeam: {},
    activePokemon: null,
    money: 50,
    battles: 0,
    inventory: { Pokébola: 5 },
    capturedPokemon: [],
    currentBattle: null,
  })

  const updateGameState = useCallback((updates: Partial<GameState>) => {
    setGameState((prev) => ({ ...prev, ...updates }))
  }, [])

  const updatePokemon = useCallback((name: string, updates: Partial<Pokemon>) => {
    setGameState((prev) => ({
      ...prev,
      playerTeam: {
        ...prev.playerTeam,
        [name]: { ...prev.playerTeam[name], ...updates },
      },
    }))
  }, [])

  const updateBattle = useCallback((updates: Partial<Battle>) => {
    setGameState((prev) => ({
      ...prev,
      currentBattle: prev.currentBattle ? { ...prev.currentBattle, ...updates } : null,
    }))
  }, [])

  return {
    gameState,
    updateGameState,
    updatePokemon,
    updateBattle,
    setGameState,
  }
}
