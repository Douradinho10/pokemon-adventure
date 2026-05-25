"use client"

import { useState, useCallback } from "react"
import type { PokemonSpriteSet } from "../lib/utils"

export type StatusCondition = "poisoned" | "burned" | "paralyzed" | "asleep" | "frozen" | "confused"

export interface PendingMove {
  name: string
  power: [number, number]
}

export interface PokemonIVs {
  hp: number
  attack: number
  defense: number
  speed: number
}

export type BattleStatStageKey = "attack" | "defense" | "speed" | "accuracy" | "evasion"

export interface BattleStatStages {
  attack: number
  defense: number
  speed: number
  accuracy: number
  evasion: number
}

export interface Pokemon {
  HP: number
  maxHP: number
  attacks: Record<string, [number, number]>
  attackPP?: Record<string, { current: number; max: number }>
  level: number
  xp: number
  sprite: string
  spriteSet?: PokemonSpriteSet
  type?: string
  pendingAttacks?: Record<string, [number, number]>
  pendingMove?: PendingMove
  speed?: number
  statusCondition?: StatusCondition | null
  statusTurns?: number
  statusWavesRemaining?: number
  isShiny?: boolean
  ivs?: PokemonIVs
}

export interface Battle {
  enemyName: string
  enemyType: string
  enemyDisplayName?: string
  enemyIsBoss?: boolean
  enemyDisplayType?: string
  enemyIsDisguised?: boolean
  enemyIsShiny?: boolean
  enemyHP: number
  enemyMaxHP: number
  enemyLevel: number
  enemyIVs?: PokemonIVs
  enemyAttacks: Record<string, [number, number]>
  enemySpeed?: number
  enemySprite?: string
  playerSprite?: string
  enemyStatusCondition?: StatusCondition | null
  enemyStatusTurns?: number
  playerStatStages?: BattleStatStages
  enemyStatStages?: BattleStatStages
  // last-damage tracking for reflection moves (Counter, Mirror Coat)
  playerLastDamageTaken?: number
  playerLastDamageMove?: string | undefined
  enemyLastDamageTaken?: number
  enemyLastDamageMove?: string | undefined
}

export interface GameState {
  playerTeam: Record<string, Pokemon>
  activePokemon: string | null
  currentEnvironment: "planicie" | "vulcanico" | "costeiro" | "floresta" | "caverna" | "alturas" | "ultrabeast_zone"
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
    currentEnvironment: "planicie",
    money: 50,
    battles: 0,
    inventory: { Pokébola: 5, "Scanner Tático": 3 },
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
