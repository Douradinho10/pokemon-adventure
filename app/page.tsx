"use client"

import { useState, useCallback, useMemo, useEffect, useRef } from "react"
import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Link2, MessageSquare, ShieldCheck, Sparkles, Trophy, User, Users } from "lucide-react"
import { onAuthStateChanged } from "firebase/auth"
import { useLocalGameState } from "../hooks/useLocalGameState"
import {
  starterPokemon,
  wildPokemon,
  pokeballs,
  calculateHP,
  calculateAttackPower,
  getEvolutionForPokemon,
  getPokemonBattleTemplate,
  getLevelUpMoveForPokemon,
  getLearnableMovesForPokemon,
  getLegalBattleAttacksForPokemon,
  getMoveStatusEffect,
  wildPokemonStats,
  getRandomWildPokemon,
  getDamageMultiplier,
  getAttackType,
  getMovePriority,
  getMoveAccuracy,
  initializePP, // Import new helper
  MAX_TEAM_SIZE,
  scaleAttackSetForLevel,
  typeChart,
  typeColors,
} from "../data/pokemonData"
import { BattleArena } from "../components/BattleArena"
import { PokemonCard } from "../components/PokemonCard"
import { AnimatedSprite } from "../components/AnimatedSprite"
import { getFirebaseAuth, initializeFirebase } from "../lib/firebase"
import { saveGameToFirebase } from "../lib/firebaseRtdbService"
import {
  getAvailableLeaderboardMonths,
  getCurrentMonthKey,
  getMonthlyLeaderboard,
  getSoloFarthestLeaderboard,
  calculateMultiplayerPoints,
  submitMonthlyLeaderboardScore,
  submitSoloFarthestRun,
  type MonthlyLeaderboardEntry,
  type SoloLeaderboardEntry,
} from "../lib/multiplayerService"
import {
  createMultiplayerRoom,
  getPublicCasualLobbies,
  joinCompetitiveQueue,
  joinMultiplayerRoom,
  leaveMultiplayerRoom,
  markMultiplayerPlayerFinished,
  requestMultiplayerRematch,
  startMultiplayerRoom,
  setMultiplayerPlayerReady,
  subscribeMultiplayerRoom,
  updateMultiplayerPlayerWave,
  type MultiplayerRoom,
  type MultiplayerRoomVisibility,
  type PublicCasualLobbySummary,
} from "../lib/socketMultiplayerService"
import { getPokemonSpriteSet, getPokemonSpriteUrl, normalizeDisplayText, normalizeTypeText } from "../lib/utils"
import type { StatusCondition } from "../hooks/useGameState"

type Screen =
  | "main-menu"
  | "solo-menu"
  | "leaderboards"
  | "menu"
  | "battle"
  | "shop"
  | "select-slot"
  | "select-continue"
  | "game"
  | "multiplayer"
type Modal =
  | "starter"
  | "attacks"
  | "battle-sim"
  | "capture"
  | "capture-success"
  | "switch"
  | "team"
  | "heal"
  | "inventory"
  | "evolution"
  | "evolution-attacks"
  | "destination"
  | "type-chart"
  | "move-vendor"
  | null

type BattleEnvironment = "planicie" | "vulcanico" | "costeiro" | "floresta" | "caverna" | "alturas"

type AttackAnimationState = {
  id: number
  attacker: "player" | "enemy"
  target: "player" | "enemy"
  moveName: string
  attackType: string
}

type MoveVendorOffer = {
  pokemonName: string
  moveName: string
  power: [number, number]
  requiredLevel: number
  price: number
}

type CaptureCelebration = {
  pokemonName: string
  sprite: string
  rarity: string
  isShiny?: boolean
}

type CaptureThrowAnimation = {
  ballType: string
  throwId: number
}

type NextEncounterPreview = {
  forBattles: number
  forActivePokemon: string
  enemyName: string
  enemyDisplayName: string
  isBoss: boolean
  enemyLevel: number
  enemyType: string
  enemyDisplayType: string
  enemyAttacks: Record<string, [number, number]>
  isImpostor: boolean
  isShiny: boolean
}

const BATTLE_SIM_ITEM = "Scanner Tático"
const LEGACY_BATTLE_SIM_ITEM = "Simulador Tático"
const XP_SHARE_ITEM = "XP Share"
const IMPOSTOR_CHANCE = 0.08
const ZOROARK_MIN_LEVEL = 28
const SHINY_CHANCE = 1 / 256
const BOSS_WAVE_INTERVAL = 10
const BOSS_MULTIPLIER = 1.5
// Lower base XP multiplier to reduce XP per battle significantly
const XP_GAIN_MULTIPLIER = 0.6
const BOSS_XP_MULTIPLIER = 1.25
const EARLY_GAME_TARGET_ROUND = 10
const EARLY_GAME_TARGET_LEVEL = 10
const FULL_RUN_XP_MULTIPLIER = 1.0
const CLASSIC_BASE_XP_YIELD: Record<string, number> = {
  comum: 24,
  raro: 42,
  lendario: 80,
}

const LOCAL_ROOM_PREFIX = "LOCAL-"

const getClassicTotalXpForLevel = (level: number) => {
  const safeLevel = Math.max(1, level)
  return Math.floor((4 * Math.pow(safeLevel, 3)) / 5)
}

const getXpNeededForNextLevel = (level: number) => {
  const safeLevel = Math.max(1, level)
  const currentTotal = getClassicTotalXpForLevel(safeLevel)
  const nextTotal = getClassicTotalXpForLevel(safeLevel + 1)
  return clamp(nextTotal - currentTotal, 50, 400)
}

const getWaveLevelCap = (battleCount: number) => {
  const wave = Math.max(1, battleCount)
  const tier = Math.floor((wave - 1) / 10)
  return clamp(10 + tier * 7, 10, 100)
}

const getXpNeededForNextLevelByWaveCap = (level: number, waveLevelCap: number) => {
  const baseXpNeeded = getXpNeededForNextLevel(level)
  const levelDelta = level - waveLevelCap

  const multiplier =
    levelDelta <= -8
      ? 0.68
      : levelDelta <= -4
        ? 0.78
        : levelDelta <= 0
          ? 0.9
          : levelDelta <= 3
            ? 1
            : levelDelta <= 7
              ? 1.15
              : 1.35

  return clamp(Math.round(baseXpNeeded * multiplier), 40, 720)
}

const GAME_SAVE_KEY = "pokemon-adventure-save-slots"

const saveSource = "firebase"

const getStabMultiplier = (attackType: string, pokemonType?: string) => {
  const normalizedAttackType = normalizeTypeText(attackType)
  const pokemonTypes = normalizeTypeText(pokemonType).split("/").filter(Boolean)

  return pokemonTypes.includes(normalizedAttackType) ? 1.25 : 1
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const getScaledEnemyLevel = (battleCount: number, random: (min: number, max: number) => number) => {
  const nextWave = Math.max(1, battleCount + 1)
  const currentTier = Math.floor((nextWave - 1) / 10)
  const currentWaveCap = getWaveLevelCap(nextWave)
  const previousWaveCap = currentTier <= 0 ? 1 : getWaveLevelCap(currentTier * 10)
  const minLevel = Math.min(previousWaveCap, currentWaveCap)
  const maxLevel = Math.max(previousWaveCap, currentWaveCap)

  // Start progression at roughly half of the current cap so early waves are lower
  const startLevel = Math.max(minLevel, Math.floor(currentWaveCap / 2))
  const waveIndexInTier = ((nextWave - 1) % 10) + 1 // 1..10

  // Linear interpolation from startLevel to currentWaveCap across the 10 waves
  const t = (waveIndexInTier - 1) / Math.max(1, 10 - 1)
  const interpolated = Math.round(startLevel + (currentWaveCap - startLevel) * t)

  // Small jitter for variety but keep levels clamped
  const jitter = random(-1, 1)
  const candidate = Math.round(interpolated + jitter)
  return clamp(candidate, minLevel, maxLevel)
}

const scaleDamageRange = (range: [number, number], multiplier: number): [number, number] => {
  if (range[0] === 0 && range[1] === 0) {
    return range
  }

  const min = Math.max(1, Math.floor(range[0] * multiplier))
  const max = Math.max(min, Math.floor(range[1] * multiplier))
  return [min, max]
}

const getLevelBalanceMultiplier = (
  attackerLevel: number,
  defenderLevel: number,
  minMultiplier = 0.88,
  maxMultiplier = 1.12,
) => {
  const levelDelta = attackerLevel - defenderLevel
  return clamp(1 + levelDelta * 0.025, minMultiplier, maxMultiplier)
}

const statusLabels: Record<StatusCondition, string> = {
  poisoned: "Envenenado",
  burned: "Queimado",
  paralyzed: "Paralisado",
  asleep: "Adormecido",
  frozen: "Congelado",
  confused: "Confuso",
}

function normalizeMultiplayerRoomCode(rawValue: string): string {
  const trimmed = rawValue.trim()
  if (!trimmed) {
    return ""
  }

  if (/^[a-z][a-z\d+\-.]*:\/\//i.test(trimmed)) {
    try {
      const parsedUrl = new URL(trimmed)
      const roomParam = parsedUrl.searchParams.get("room")?.trim()
      if (roomParam) {
        return roomParam
      }
    } catch {
      // Fall through to the generic room extractor.
    }
  }

  const roomMatch = trimmed.match(/[?&]room=([^&#]+)/i)
  if (roomMatch?.[1]) {
    return decodeURIComponent(roomMatch[1]).trim()
  }

  return trimmed
}

function buildMultiplayerInviteUrl(roomId: string): string {
  if (typeof window === "undefined") {
    return roomId
  }

  const inviteUrl = new URL(window.location.href)
  inviteUrl.searchParams.set("room", roomId)
  inviteUrl.searchParams.delete("from")
  inviteUrl.hash = ""
  return inviteUrl.toString()
}

const getEffectiveSpeed = (speed = 50, statusCondition?: StatusCondition | null) => {
  if (statusCondition === "paralyzed") {
    return Math.max(1, Math.floor(speed * 0.25))
  }

  return speed
}

const persistentStatusWaveDuration: Partial<Record<StatusCondition, number>> = {
  poisoned: 3,
  burned: 3,
  paralyzed: 4,
  asleep: 3,
  frozen: 3,
  confused: 2,
}

const getClassicCatchChance = (
  ballType: string,
  rarity: "comum" | "raro" | "lendario",
  enemyHP: number,
  enemyMaxHP: number,
  statusCondition?: StatusCondition | null,
) => {
  if (ballType === "Master Ball") {
    return 1
  }

  const baseCatchRate = rarity === "lendario" ? 25 : rarity === "raro" ? 90 : 160
  const ballMultiplier = ballType === "Ultra Ball" ? 2 : ballType === "Great Ball" ? 1.5 : 1

  const maxHP = Math.max(1, enemyMaxHP)
  const currentHP = clamp(enemyHP, 1, maxHP)
  const captureValue = ((3 * maxHP - 2 * currentHP) * baseCatchRate * ballMultiplier) / (3 * maxHP)

  const statusMultiplier = statusCondition === "asleep" || statusCondition === "frozen"
    ? 2.5
    : statusCondition === "paralyzed" || statusCondition === "burned" || statusCondition === "poisoned"
      ? 1.5
      : 1

  return clamp((captureValue * statusMultiplier) / 255, 0.01, 0.95)
}

const trainerBarTypeColors: Record<string, string> = {
  normal: "#d7cec2",
  fogo: "#f0ba96",
  fire: "#f0ba96",
  agua: "#9fcaea",
  water: "#9fcaea",
  grama: "#b7d99a",
  grass: "#b7d99a",
  eletrico: "#f2df7d",
  electric: "#f2df7d",
  gelo: "#bfe7ef",
  ice: "#bfe7ef",
  lutador: "#d8b0a4",
  fighting: "#d8b0a4",
  veneno: "#c4b0db",
  poison: "#c4b0db",
  terra: "#d8c095",
  ground: "#d8c095",
  voador: "#ccd7ee",
  flying: "#ccd7ee",
  psiquico: "#efb2c2",
  psychic: "#efb2c2",
  inseto: "#cad78c",
  bug: "#cad78c",
  pedra: "#cdbb9b",
  rock: "#cdbb9b",
  fantasma: "#b5b0d3",
  ghost: "#b5b0d3",
  dragao: "#b7bee7",
  dragon: "#b7bee7",
  sombrio: "#bfc4c9",
  dark: "#bfc4c9",
  aco: "#c8d2da",
  steel: "#c8d2da",
  fada: "#efc5d6",
  fairy: "#efc5d6",
}

const normalizeTypeKey = (value: string | undefined | null) =>
  normalizeTypeText(value)
    .split("/")[0]
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")

const normalizeMoveNameKey = (moveName: string) =>
  normalizeDisplayText(moveName).replace(/_/g, " ").replace(/\s+/g, " ").trim().toLowerCase()

const getStarterEnvironment = (_starterName: string): BattleEnvironment => {
  return "planicie"
}

const environmentLabels: Record<BattleEnvironment, string> = {
  planicie: "Planicie",
  vulcanico: "Terras Vulcanicas",
  costeiro: "Costa",
  floresta: "Floresta",
  caverna: "Caverna",
  alturas: "Alturas",
}

const allBattleEnvironments: BattleEnvironment[] = ["planicie", "vulcanico", "costeiro", "floresta", "caverna", "alturas"]

const environmentRoutes: Record<BattleEnvironment, [BattleEnvironment, BattleEnvironment]> = {
  planicie: ["floresta", "costeiro"],
  floresta: ["planicie", "caverna"],
  caverna: ["floresta", "vulcanico"],
  vulcanico: ["caverna", "alturas"],
  alturas: ["vulcanico", "costeiro"],
  costeiro: ["planicie", "alturas"],
}

const getDestinationChoices = (currentEnvironment: BattleEnvironment, battles: number): [BattleEnvironment, BattleEnvironment] => {
  const fixedRoutes = environmentRoutes[currentEnvironment]
  if (fixedRoutes) {
    return fixedRoutes
  }

  const candidates = allBattleEnvironments.filter((environment) => environment !== currentEnvironment)

  if (candidates.length < 2) {
    return ["floresta", "caverna"]
  }

  const baseIndex = Math.abs(battles) % candidates.length
  const firstChoice = candidates[baseIndex]
  const secondChoice = candidates[(baseIndex + 2) % candidates.length]

  if (firstChoice === secondChoice) {
    return [firstChoice, candidates[(baseIndex + 1) % candidates.length]]
  }

  return [firstChoice, secondChoice]
}

const normalizeTypeToken = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")

const environmentPreferredTypes: Record<BattleEnvironment, string[]> = {
  planicie: ["normal", "grama", "inseto", "voador"],
  vulcanico: ["fogo", "pedra", "terra"],
  costeiro: ["agua", "gelo"],
  floresta: ["grama", "inseto", "veneno"],
  caverna: ["pedra", "terra", "veneno", "fantasma"],
  alturas: ["voador", "dragao", "eletrico"],
}

const environmentTypeWeights: Record<BattleEnvironment, Record<string, number>> = {
  planicie: {
    inseto: 3.2,
    grama: 3.0,
    normal: 1.8,
    voador: 1.6,
  },
  vulcanico: {
    fogo: 3.0,
    pedra: 2.4,
    terra: 2.2,
    dragao: 1.5,
  },
  costeiro: {
    agua: 3.0,
    gelo: 2.2,
    voador: 1.5,
    eletrico: 1.3,
  },
  floresta: {
    grama: 3.2,
    inseto: 2.8,
    veneno: 2.0,
    fada: 1.5,
  },
  caverna: {
    pedra: 2.8,
    terra: 2.5,
    veneno: 2.2,
    fantasma: 2.0,
  },
  alturas: {
    voador: 3.0,
    dragao: 2.4,
    eletrico: 2.0,
    gelo: 1.4,
  },
}

const pickWeightedPokemon = (candidates: string[], environment: BattleEnvironment) => {
  if (candidates.length === 0) {
    return null
  }

  const typeWeights = environmentTypeWeights[environment]
  const weighted = candidates.map((name) => {
    const typeTokens = normalizeTypeText(wildPokemon[name].type)
      .split("/")
      .map(normalizeTypeToken)
      .filter(Boolean)

    const highestTypeWeight = typeTokens.reduce((best, token) => Math.max(best, typeWeights[token] || 1), 1)
    return { name, weight: highestTypeWeight }
  })

  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0)
  let roll = Math.random() * totalWeight

  for (const entry of weighted) {
    roll -= entry.weight
    if (roll <= 0) {
      return entry.name
    }
  }

  return weighted[weighted.length - 1].name
}

const getEnvironmentWildPool = (environment: BattleEnvironment) => {
  const preferredTypes = new Set(environmentPreferredTypes[environment])

  return Object.keys(wildPokemon).filter((name) => {
    const typeTokens = normalizeTypeText(wildPokemon[name].type)
      .split("/")
      .map(normalizeTypeToken)
      .filter(Boolean)

    return typeTokens.some((token) => preferredTypes.has(token))
  })
}

const getTargetRarityForBattle = (battleCount: number) => {
  const rarityRoll = Math.random()

  if (battleCount > 0 && battleCount % 100 === 0) {
    return "lendario" as const
  }

  if (rarityRoll < 0.2) {
    return "raro" as const
  }

  return "comum" as const
}

const buildMinWildLevelBySpecies = () => {
  const speciesNames = Object.keys(wildPokemon)
  const cache = new Map<string, number>()
  const visiting = new Set<string>()

  const resolveMinLevel = (species: string): number => {
    const cached = cache.get(species)
    if (cached !== undefined) {
      return cached
    }

    if (visiting.has(species)) {
      return 1
    }

    visiting.add(species)

    const preEvolutionLevels = speciesNames
      .map((candidate) => {
        const candidateRule = getEvolutionForPokemon(candidate, 100)
        if (!candidateRule || candidateRule.evolvesTo !== species) {
          return null
        }

        const preMin = resolveMinLevel(candidate)
        return Math.max(candidateRule.level, preMin)
      })
      .filter((value): value is number => value !== null)

    visiting.delete(species)

    const minLevel = preEvolutionLevels.length > 0 ? Math.max(...preEvolutionLevels) : 1
    cache.set(species, minLevel)
    return minLevel
  }

  const result: Record<string, number> = {}
  speciesNames.forEach((species) => {
    result[species] = resolveMinLevel(species)
  })
  return result
}

const minWildLevelOverrides: Record<string, number> = {
  Raichu: 30,
  Clefable: 30,
  Wigglytuff: 30,
  Vileplume: 36,
  Victreebel: 36,
  Poliwrath: 36,
  Bellossom: 36,
  Slowking: 37,
  Steelix: 36,
  Scizor: 30,
  Kingdra: 45,
}

const minWildLevelBySpecies = (() => {
  const computed = buildMinWildLevelBySpecies()

  Object.entries(minWildLevelOverrides).forEach(([species, minLevel]) => {
    computed[species] = Math.max(computed[species] || 1, minLevel)
  })

  return computed
})()

const getRandomWildPokemonForEnvironment = (battleCount: number, environment: BattleEnvironment, enemyLevel: number) => {
  const targetRarity = getTargetRarityForBattle(battleCount)
  const environmentPool = getEnvironmentWildPool(environment)
  const levelFilteredPool = environmentPool.filter((name) => enemyLevel >= (minWildLevelBySpecies[name] || 1))

  const rarityPool = levelFilteredPool.filter((name) => wildPokemon[name].rarity === targetRarity)
  const selectedPool = rarityPool.length > 0 ? rarityPool : levelFilteredPool

  if (selectedPool.length === 0) {
    const fallbackByLevel = Object.keys(wildPokemon).filter((name) => enemyLevel >= (minWildLevelBySpecies[name] || 1))
    const fallbackPick = pickWeightedPokemon(fallbackByLevel, environment)
    if (fallbackPick) {
      return fallbackPick
    }
  }

  const weightedPick = pickWeightedPokemon(selectedPool, environment)

  if (weightedPick) {
    return weightedPick
  }

  return environmentPool[0] || getRandomWildPokemon(battleCount)
}

const getRandomWildPokemonForEnvironmentWithType = (
  battleCount: number,
  environment: BattleEnvironment,
  enemyLevel: number,
  preferredTypeToken: string | null,
) => {
  const targetRarity = getTargetRarityForBattle(battleCount)
  const environmentPool = getEnvironmentWildPool(environment)
  const levelFilteredPool = environmentPool.filter((name) => enemyLevel >= (minWildLevelBySpecies[name] || 1))

  const rarityPool = levelFilteredPool.filter((name) => wildPokemon[name].rarity === targetRarity)
  const selectedPool = rarityPool.length > 0 ? rarityPool : levelFilteredPool

  const typeFilteredPool = preferredTypeToken
    ? selectedPool.filter((name) =>
        normalizeTypeText(wildPokemon[name].type)
          .split("/")
          .map(normalizeTypeToken)
          .includes(preferredTypeToken),
      )
    : selectedPool

  const finalPool = typeFilteredPool.length > 0 ? typeFilteredPool : selectedPool

  if (finalPool.length === 0) {
    const fallbackByLevel = Object.keys(wildPokemon).filter((name) => enemyLevel >= (minWildLevelBySpecies[name] || 1))
    const fallbackByType = preferredTypeToken
      ? fallbackByLevel.filter((name) =>
          normalizeTypeText(wildPokemon[name].type)
            .split("/")
            .map(normalizeTypeToken)
            .includes(preferredTypeToken),
        )
      : fallbackByLevel
    const fallbackPool = fallbackByType.length > 0 ? fallbackByType : fallbackByLevel

    const fallbackPick = pickWeightedPokemon(fallbackPool, environment)
    if (fallbackPick) {
      return fallbackPick
    }
  }

  const weightedPick = pickWeightedPokemon(finalPool, environment)

  if (weightedPick) {
    return weightedPick
  }

  return environmentPool[0] || getRandomWildPokemon(battleCount)
}

export default function PokemonAdventure() {
  const {
    gameState,
    updateGameState,
    updatePokemon,
    updateBattle,
    setGameState,
    isLoading,
    saveSlots,
    setSaveSlots,
    currentSlot,
    loadSlotGame,
    startNewGameInSlot,
    deleteSaveSlot,
    clearSelectedSlot,
  } = useLocalGameState()

  const addLog = useCallback((_message: string) => {}, [])
  const clearLog = useCallback(() => {}, [])

  const [currentScreen, setCurrentScreen] = useState<Screen>("main-menu")
  const [showModal, setShowModal] = useState<Modal>(null)
  const [isAnimating, setIsAnimating] = useState(false)
  const [attackToReplace, setAttackToReplace] = useState<string | null>(null)
  const [recentEvolution, setRecentEvolution] = useState<{ from: string; to: string } | null>(null)
  const [attackAnimation, setAttackAnimation] = useState<AttackAnimationState | null>(null)
  const [attackAnimationCounter, setAttackAnimationCounter] = useState(0)
  const [moveVendorOffer, setMoveVendorOffer] = useState<MoveVendorOffer | null>(null)
  const [moveVendorReplaceAttack, setMoveVendorReplaceAttack] = useState<string | null>(null)
  const [vendorLastBattleRoll, setVendorLastBattleRoll] = useState<number>(-1)
  const [captureCelebration, setCaptureCelebration] = useState<CaptureCelebration | null>(null)
  const [captureThrowAnimation, setCaptureThrowAnimation] = useState<CaptureThrowAnimation | null>(null)
  const [nextEncounterPreview, setNextEncounterPreview] = useState<NextEncounterPreview | null>(null)
  const [hiddenEncounterPreview, setHiddenEncounterPreview] = useState<NextEncounterPreview | null>(null)
  const [inventoryTab, setInventoryTab] = useState<"pokeballs" | "items">("pokeballs")
  const [pendingEnemyTurnAfterSwitch, setPendingEnemyTurnAfterSwitch] = useState(false)
  const [destinationChoices, setDestinationChoices] = useState<[BattleEnvironment, BattleEnvironment]>(["floresta", "caverna"])
  const [screenNotice, setScreenNotice] = useState<string | null>(null)
  const [defeatAnimationVisible, setDefeatAnimationVisible] = useState(false)
  const [isAuthChecking, setIsAuthChecking] = useState(true)
  const [accountUserId, setAccountUserId] = useState<string | null>(null)
  const [accountName, setAccountName] = useState("Treinador")
  const [accountEmail, setAccountEmail] = useState<string | null>(null)
  const [multiplayerRoomCodeInput, setMultiplayerRoomCodeInput] = useState("")
  const [multiplayerSection, setMultiplayerSection] = useState<"competitive" | "casual">("competitive")
  const [casualLobbyVisibility, setCasualLobbyVisibility] = useState<MultiplayerRoomVisibility>("private")
  const [competitiveQueueSize, setCompetitiveQueueSize] = useState<2 | 3>(2)
  const [publicCasualLobbies, setPublicCasualLobbies] = useState<PublicCasualLobbySummary[]>([])
  const [publicCasualLoading, setPublicCasualLoading] = useState(false)
  const [multiplayerJoinedRoomId, setMultiplayerJoinedRoomId] = useState<string | null>(null)
  const [multiplayerRoom, setMultiplayerRoom] = useState<MultiplayerRoom | null>(null)
  const [multiplayerMode, setMultiplayerMode] = useState(false)
  const [multiplayerIsCasual, setMultiplayerIsCasual] = useState(false)
  const [multiplayerBusy, setMultiplayerBusy] = useState(false)
  const [multiplayerError, setMultiplayerError] = useState<string | null>(null)
  const [leaderboardMonth, setLeaderboardMonth] = useState(getCurrentMonthKey())
  const [leaderboardViewMode, setLeaderboardViewMode] = useState<"solo" | "multiplayer">("solo")
  const [leaderboardMonths, setLeaderboardMonths] = useState<string[]>([getCurrentMonthKey()])
  const [leaderboardEntries, setLeaderboardEntries] = useState<MonthlyLeaderboardEntry[]>([])
  const [soloLeaderboardEntries, setSoloLeaderboardEntries] = useState<SoloLeaderboardEntry[]>([])
  const screenNoticeTimeoutRef = useRef<number | null>(null)
  const defeatResetTimeoutRef = useRef<number | null>(null)
  const defeatHideTimeoutRef = useRef<number | null>(null)
  const captureThrowTimeoutRef = useRef<number | null>(null)
  const loginRedirectTimeoutRef = useRef<number | null>(null)
  const hasAutoRoutedAfterAuthRef = useRef(false)
  const forceMainMenuAfterPerfilRef = useRef(false)
  const previousAccountEmailRef = useRef<string | null>(null)
  const previousAccountUserIdRef = useRef<string | null>(null)
  const latestGameStateRef = useRef(gameState)
  const autoActivatedCompetitiveRoomRef = useRef<string | null>(null)
  const autoStartedCompetitiveRoomRef = useRef<string | null>(null)
  const multiplayerResultSubmittedRef = useRef<string | null>(null)
  const pendingInviteRoomIdRef = useRef<string | null>(null)
  const pendingInviteRetryCountRef = useRef(0)
  const pendingInviteRetryTimeoutRef = useRef<number | null>(null)
  const random = useCallback((min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min, [])

  const delay = useCallback((ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms)), [])

  const redirectToLogin = useCallback(() => {
    if (typeof window === "undefined") {
      return
    }

    if (window.location.pathname === "/login") {
      return
    }

    const nextPath = `${window.location.pathname}${window.location.search}${window.location.hash || ""}`
    window.location.replace(`/login?next=${encodeURIComponent(nextPath)}`)

    if (loginRedirectTimeoutRef.current) {
      window.clearTimeout(loginRedirectTimeoutRef.current)
    }

    loginRedirectTimeoutRef.current = window.setTimeout(() => {
      if (window.location.pathname !== "/login") {
        window.location.replace("/login")
      }
    }, 250)
  }, [])

  const showScreenNotice = useCallback((message: string, duration = 3200) => {
    setScreenNotice(message)

    if (screenNoticeTimeoutRef.current) {
      window.clearTimeout(screenNoticeTimeoutRef.current)
    }

    screenNoticeTimeoutRef.current = window.setTimeout(() => {
      setScreenNotice(null)
      screenNoticeTimeoutRef.current = null
    }, duration)
  }, [])

  const clearPendingInviteJoin = useCallback(() => {
    if (pendingInviteRetryTimeoutRef.current !== null) {
      window.clearTimeout(pendingInviteRetryTimeoutRef.current)
      pendingInviteRetryTimeoutRef.current = null
    }

    pendingInviteRoomIdRef.current = null
    pendingInviteRetryCountRef.current = 0
  }, [])

  const leaveCurrentMultiplayerRoomIfNeeded = useCallback(
    async (targetRoomId?: string) => {
      if (!multiplayerJoinedRoomId || !accountUserId) {
        return
      }

      if (targetRoomId && multiplayerJoinedRoomId === targetRoomId) {
        return
      }

      clearPendingInviteJoin()
      multiplayerResultSubmittedRef.current = null

      if (multiplayerJoinedRoomId.startsWith(LOCAL_ROOM_PREFIX)) {
        setMultiplayerJoinedRoomId(null)
        setMultiplayerRoom(null)
        setMultiplayerMode(false)
        setMultiplayerIsCasual(false)
        setMultiplayerBusy(false)
        setMultiplayerError(null)
        return
      }

      try {
        await leaveMultiplayerRoom(multiplayerJoinedRoomId, accountUserId)
      } catch {
        // Ignore best-effort cleanup failures so the new join can continue.
      }

      setMultiplayerJoinedRoomId(null)
      setMultiplayerRoom(null)
      setMultiplayerMode(false)
      setMultiplayerIsCasual(false)
      setMultiplayerBusy(false)
      setMultiplayerError(null)
    },
    [accountUserId, clearPendingInviteJoin, multiplayerJoinedRoomId],
  )

  const getMultiplayerErrorMessage = useCallback((error: unknown, fallbackMessage: string) => {
    const code =
      error && typeof error === "object"
        ? String((error as { code?: string }).code || (error as { name?: string }).name || "")
        : ""
    const raw = error instanceof Error ? error.message : String(error || "")
    const normalized = raw.toLowerCase()
    const technicalDetail = [code.trim(), raw.trim()]
      .filter(Boolean)
      .join(" | ")
      .slice(0, 180)

    const withDetail = (message: string) => (technicalDetail ? `${message} [detalhe: ${technicalDetail}]` : message)

    if (normalized.includes("permission") || normalized.includes("denied") || normalized.includes("unauthorized")) {
      return withDetail("O servidor Socket.io recusou a operacao. Confirma que o multiplayer esta online.")
    }

    if (normalized.includes("indisponivel") || normalized.includes("database") || normalized.includes("config")) {
      return withDetail(
        "Socket.io indisponivel para multiplayer. Confirma NEXT_PUBLIC_SOCKET_SERVER_URL e se o servidor Socket.io esta a correr.",
      )
    }

    if (
      normalized.includes("network") ||
      normalized.includes("offline") ||
      normalized.includes("timeout") ||
      normalized.includes("demorou")
    ) {
      return withDetail("Falha de rede no multiplayer Socket.io. Tenta novamente em alguns segundos.")
    }

    return withDetail(fallbackMessage)
  }, [])

  const joinMultiplayerRoomByCode = useCallback(
    async (rawRoomCode: string, options?: { autoRetry?: boolean }) => {
      if (!accountUserId) {
        setMultiplayerError("Faz login para entrar num grupo multiplayer.")
        return false
      }

      const roomCode = normalizeMultiplayerRoomCode(rawRoomCode)
      if (!roomCode) {
        setMultiplayerError("Indica um codigo ou link de grupo.")
        return false
      }

      const isInviteAutoJoin = options?.autoRetry === true && pendingInviteRoomIdRef.current === roomCode
      const maxInviteAttempts = 6

      await leaveCurrentMultiplayerRoomIfNeeded(roomCode)
      multiplayerResultSubmittedRef.current = null

      setMultiplayerBusy(true)
      setMultiplayerError(null)

      try {
        const result = await joinMultiplayerRoom({
          roomId: roomCode,
          userId: accountUserId,
          displayName: accountName,
        })

        if (!result.ok) {
          if (isInviteAutoJoin && pendingInviteRetryCountRef.current < maxInviteAttempts - 1) {
            pendingInviteRetryCountRef.current += 1

            if (pendingInviteRetryTimeoutRef.current !== null) {
              window.clearTimeout(pendingInviteRetryTimeoutRef.current)
            }

            pendingInviteRetryTimeoutRef.current = window.setTimeout(() => {
              pendingInviteRetryTimeoutRef.current = null
              void joinMultiplayerRoomByCode(roomCode, { autoRetry: true })
            }, 700)

            return false
          }

          if (isInviteAutoJoin) {
            pendingInviteRoomIdRef.current = null
            pendingInviteRetryCountRef.current = 0
          }

          setMultiplayerError(result.message || "Nao foi possivel entrar no grupo.")
          return false
        }

        if (isInviteAutoJoin) {
          clearPendingInviteJoin()
        }

        setMultiplayerJoinedRoomId(roomCode)
        if (result.room) {
          setMultiplayerRoom(result.room)
        }
        setMultiplayerMode(false)
        setMultiplayerIsCasual(true)
        setMultiplayerSection("casual")
        setMultiplayerRoomCodeInput(roomCode)
        showScreenNotice("Entraste no grupo por convite!")
        return true
      } catch (error) {
        setMultiplayerError(getMultiplayerErrorMessage(error, "Erro ao entrar no grupo."))
        return false
      } finally {
        setMultiplayerBusy(false)
      }
    },
    [accountName, accountUserId, clearPendingInviteJoin, getMultiplayerErrorMessage, leaveCurrentMultiplayerRoomIfNeeded, showScreenNotice],
  )

  const handleShareMultiplayerInvite = useCallback(async () => {
    if (!multiplayerRoom) {
      return
    }

    const inviteUrl = buildMultiplayerInviteUrl(multiplayerRoom.id)

    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({
          title: "Pokemon Adventure",
          text: `Entra no meu grupo multiplayer: ${inviteUrl}`,
          url: inviteUrl,
        })
        showScreenNotice("Convite partilhado.")
        return
      }

      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteUrl)
        showScreenNotice("Link do grupo copiado.")
        return
      }

      setMultiplayerError("O navegador nao suporta partilhar este convite.")
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return
      }

      setMultiplayerError(getMultiplayerErrorMessage(error, "Nao foi possivel partilhar o convite."))
    }
  }, [getMultiplayerErrorMessage, multiplayerRoom, showScreenNotice])

  useEffect(() => {
    latestGameStateRef.current = gameState
  }, [gameState])

  useEffect(() => {
    initializeFirebase()
    const auth = getFirebaseAuth()

    if (!auth) {
      hasAutoRoutedAfterAuthRef.current = false
      setAccountUserId(null)
      setAccountEmail(null)
      setAccountName("Treinador")
      setIsAuthChecking(false)
      return
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        hasAutoRoutedAfterAuthRef.current = false
        setAccountUserId(null)
        setAccountEmail(null)
        setAccountName("Treinador")
        setIsAuthChecking(false)
        return
      }

      const displayName = user.displayName || user.email?.split("@")[0] || "Treinador"
      setAccountUserId(user.uid)
      setAccountEmail(user.email || null)
      setAccountName(displayName)
      setIsAuthChecking(false)
    })

    return () => unsubscribe()
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const params = new URLSearchParams(window.location.search)
    const fromPerfil = params.get("from") === "perfil"

    if (!fromPerfil) {
      return
    }

    forceMainMenuAfterPerfilRef.current = true
    hasAutoRoutedAfterAuthRef.current = true
    setCurrentScreen("main-menu")

    const cleanUrl = `${window.location.pathname}${window.location.hash || ""}`
    window.history.replaceState({}, "", cleanUrl)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const params = new URLSearchParams(window.location.search)
    const inviteRoom = normalizeMultiplayerRoomCode(params.get("room") || "")

    if (!inviteRoom) {
      return
    }

    pendingInviteRoomIdRef.current = inviteRoom
    pendingInviteRetryCountRef.current = 0
    if (pendingInviteRetryTimeoutRef.current !== null) {
      window.clearTimeout(pendingInviteRetryTimeoutRef.current)
      pendingInviteRetryTimeoutRef.current = null
    }
    setMultiplayerRoomCodeInput(inviteRoom)
    setMultiplayerSection("casual")
    setCurrentScreen("multiplayer")
  }, [])

  useEffect(() => {
    if (isAuthChecking) {
      return
    }

    if (!accountEmail) {
      redirectToLogin()
    }
  }, [accountEmail, isAuthChecking, redirectToLogin])

  useEffect(() => {
    if (isAuthChecking || isLoading) {
      return
    }

    if (!accountEmail) {
      return
    }

    if (forceMainMenuAfterPerfilRef.current) {
      hasAutoRoutedAfterAuthRef.current = true
      if (currentScreen !== "main-menu") {
        setCurrentScreen("main-menu")
      }
      return
    }

    if (hasAutoRoutedAfterAuthRef.current) {
      return
    }

    const hasSavedRun = saveSlots.some((slot) => slot.gameState?.activePokemon)

    if (gameState.activePokemon) {
      hasAutoRoutedAfterAuthRef.current = true
      if (
        currentScreen !== "menu" &&
        currentScreen !== "battle" &&
        currentScreen !== "shop" &&
        currentScreen !== "game" &&
        currentScreen !== "multiplayer" &&
        currentScreen !== "leaderboards" &&
        currentScreen !== "solo-menu"
      ) {
        setCurrentScreen("menu")
      }
      return
    }

    if (hasSavedRun) {
      hasAutoRoutedAfterAuthRef.current = true
      if (currentScreen === "main-menu" || currentScreen === "select-slot" || currentScreen === "game") {
        setCurrentScreen("main-menu")
      }
      return
    }

    hasAutoRoutedAfterAuthRef.current = true
    if (currentScreen === "select-slot" || currentScreen === "select-continue" || currentScreen === "game") {
      setCurrentScreen("main-menu")
    }
  }, [accountEmail, currentScreen, gameState.activePokemon, isAuthChecking, isLoading, saveSlots])

  useEffect(() => {
    if (forceMainMenuAfterPerfilRef.current) {
      return
    }

    if (previousAccountEmailRef.current && previousAccountEmailRef.current !== accountEmail) {
      const previousUserId = previousAccountUserIdRef.current
      const previousRoomId = multiplayerJoinedRoomId

      if (previousUserId && previousRoomId && !previousRoomId.startsWith(LOCAL_ROOM_PREFIX)) {
        void leaveMultiplayerRoom(previousRoomId, previousUserId).catch(() => {})
      }

      hasAutoRoutedAfterAuthRef.current = false
      previousAccountEmailRef.current = accountEmail
      clearPendingInviteJoin()
      setMultiplayerJoinedRoomId(null)
      setMultiplayerRoom(null)
      setMultiplayerMode(false)
      setMultiplayerIsCasual(false)
      setMultiplayerBusy(false)
      setMultiplayerError(null)
      setMultiplayerRoomCodeInput("")
      setCurrentScreen("main-menu")
      setMultiplayerSection("competitive")
      return
    }

    if (previousAccountEmailRef.current !== accountEmail) {
      hasAutoRoutedAfterAuthRef.current = false
      previousAccountEmailRef.current = accountEmail
    }
  }, [accountEmail, clearPendingInviteJoin, leaveMultiplayerRoom, multiplayerJoinedRoomId])

  useEffect(() => {
    previousAccountUserIdRef.current = accountUserId
  }, [accountUserId])

  useEffect(() => {
    return () => {
      if (screenNoticeTimeoutRef.current) {
        window.clearTimeout(screenNoticeTimeoutRef.current)
      }
      if (defeatResetTimeoutRef.current) {
        window.clearTimeout(defeatResetTimeoutRef.current)
      }
      if (defeatHideTimeoutRef.current) {
        window.clearTimeout(defeatHideTimeoutRef.current)
      }
      if (captureThrowTimeoutRef.current) {
        window.clearTimeout(captureThrowTimeoutRef.current)
      }
      if (loginRedirectTimeoutRef.current) {
        window.clearTimeout(loginRedirectTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!multiplayerJoinedRoomId) {
      setMultiplayerRoom(null)
      return
    }

    if (multiplayerJoinedRoomId.startsWith(LOCAL_ROOM_PREFIX)) {
      return
    }

    let cancelled = false
    const unsubscribe = subscribeMultiplayerRoom(
      multiplayerJoinedRoomId,
      (room) => {
        if (cancelled) {
          return
        }

        // Ignore transient null snapshots to avoid false lobby desync errors.
        if (!room) {
          return
        }

        setMultiplayerError(null)
        setMultiplayerRoom(room)

        if (accountUserId && room.status === "finished" && !room.players?.[accountUserId]) {
          setMultiplayerJoinedRoomId(null)
          setMultiplayerMode(false)
        }
      },
      (error) => {
        if (cancelled) {
          return
        }

        setMultiplayerError(
          getMultiplayerErrorMessage(error, "Nao foi possivel sincronizar esta sala em tempo real. Verifica o Firebase RTDB."),
        )
      },
    )

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [accountUserId, getMultiplayerErrorMessage, multiplayerJoinedRoomId])

  useEffect(() => {
    if (currentScreen !== "leaderboards") {
      return
    }

    let cancelled = false

    const loadLeaderboardData = async () => {
      if (leaderboardViewMode === "solo") {
        try {
          const entries = await getSoloFarthestLeaderboard(100)

          if (cancelled) {
            return
          }

          setSoloLeaderboardEntries(entries)
          setMultiplayerError(null)
        } catch {
          if (!cancelled) {
            setMultiplayerError("Nao foi possivel carregar a tabela solo.")
          }
        }
        return
      }

      try {
        const [months, entries] = await Promise.all([
          getAvailableLeaderboardMonths(12),
          getMonthlyLeaderboard(leaderboardMonth, 100),
        ])

        if (cancelled) {
          return
        }

        setLeaderboardMonths(months)
        setLeaderboardEntries(entries)
        setMultiplayerError(null)
      } catch {
        if (!cancelled) {
          setMultiplayerError("Nao foi possivel carregar a tabela multiplayer.")
        }
      }
    }

    loadLeaderboardData()

    return () => {
      cancelled = true
    }
  }, [currentScreen, leaderboardMonth, leaderboardViewMode])

  useEffect(() => {
    if (!multiplayerMode || !multiplayerJoinedRoomId || !accountUserId) {
      return
    }

    if (gameState.battles <= 0) {
      return
    }

    if (multiplayerJoinedRoomId.startsWith(LOCAL_ROOM_PREFIX)) {
      setMultiplayerRoom((prev) => {
        if (!prev || !prev.players?.[accountUserId]) {
          return prev
        }

        const currentPlayer = prev.players[accountUserId]
        return {
          ...prev,
          players: {
            ...prev.players,
            [accountUserId]: {
              ...currentPlayer,
              bestWave: Math.max(currentPlayer.bestWave, gameState.battles),
            },
          },
        }
      })
      return
    }

    updateMultiplayerPlayerWave({
      roomId: multiplayerJoinedRoomId,
      userId: accountUserId,
      displayName: accountName,
      wave: gameState.battles,
    }).catch(() => {
      return
    })
  }, [accountName, accountUserId, gameState.battles, multiplayerJoinedRoomId, multiplayerMode])

  const handleCreateMultiplayerRoom = useCallback(
    async (maxPlayers: 2 | 3, visibility: MultiplayerRoomVisibility = "private") => {
      if (!accountUserId) {
        setMultiplayerError("Faz login para criar um grupo multiplayer.")
        return
      }

      await leaveCurrentMultiplayerRoomIfNeeded()

      clearPendingInviteJoin()
      multiplayerResultSubmittedRef.current = null

      setMultiplayerBusy(true)
      setMultiplayerError(null)

      try {
        const room = await createMultiplayerRoom({
          hostUserId: accountUserId,
          hostDisplayName: accountName,
          maxPlayers,
          mode: "casual",
          visibility,
        })

        setMultiplayerJoinedRoomId(room.id)
        setMultiplayerRoom(room)
        setMultiplayerRoomCodeInput(room.id)
        setMultiplayerMode(false)
        setMultiplayerIsCasual(true)
        showScreenNotice(`Grupo criado! Convite: ${room.id}`)
      } catch (error) {
        if (visibility === "public") {
          setMultiplayerError(getMultiplayerErrorMessage(error, "Nao foi possivel criar o grupo agora. Verifica o Firebase e tenta novamente."))
          return
        }

        const localCode = `${LOCAL_ROOM_PREFIX}${Math.random().toString(36).slice(2, 8).toUpperCase()}`
        const createdAt = Date.now()

        setMultiplayerJoinedRoomId(localCode)
        setMultiplayerRoom({
          id: localCode,
          hostUserId: accountUserId,
          hostDisplayName: accountName,
          mode: "casual",
          visibility,
          maxPlayers,
          status: "waiting",
          createdAt,
          players: {
            [accountUserId]: {
              userId: accountUserId,
              displayName: accountName,
              joinedAt: createdAt,
              bestWave: 0,
              ready: false,
            },
          },
        })
        setMultiplayerRoomCodeInput(localCode)
        setMultiplayerMode(false)
        setMultiplayerIsCasual(true)
        setMultiplayerError("Grupo criado em modo local. O realtime do Firebase esta indisponivel agora.")
        showScreenNotice(`Grupo local criado! Codigo: ${localCode}`)
      } finally {
        setMultiplayerBusy(false)
      }
    },
    [accountName, accountUserId, clearPendingInviteJoin, getMultiplayerErrorMessage, leaveCurrentMultiplayerRoomIfNeeded, showScreenNotice],
  )

  const handleJoinMultiplayerRoom = useCallback(async () => {
    if (!accountUserId) {
      setMultiplayerError("Faz login para entrar num grupo multiplayer.")
      return
    }

    const roomCode = multiplayerRoomCodeInput.trim()
    if (!roomCode) {
      setMultiplayerError("Introduz o codigo ou link do grupo.")
      return
    }

    clearPendingInviteJoin()
    multiplayerResultSubmittedRef.current = null

    void joinMultiplayerRoomByCode(roomCode)
  }, [accountUserId, clearPendingInviteJoin, joinMultiplayerRoomByCode, multiplayerRoomCodeInput])

  const handleEnterCompetitiveMatch = useCallback(async (maxPlayers: 2 | 3) => {
    if (!accountUserId) {
      setMultiplayerError("Faz login para entrar em competitivo.")
      return
    }

    await leaveCurrentMultiplayerRoomIfNeeded()

    clearPendingInviteJoin()
    multiplayerResultSubmittedRef.current = null

    setMultiplayerBusy(true)
    setMultiplayerError(null)

    try {
      const queueResult = await joinCompetitiveQueue({
        maxPlayers,
        userId: accountUserId,
        displayName: accountName,
      })

      if (!queueResult.ok || !queueResult.room) {
        throw new Error(queueResult.message || "Nao foi possivel entrar na fila competitiva.")
      }

      setMultiplayerJoinedRoomId(queueResult.room.id)
      setMultiplayerRoom(queueResult.room)
      setMultiplayerMode(false)
      setMultiplayerIsCasual(false)
      setMultiplayerSection("competitive")
      showScreenNotice(`Entraste na fila competitiva (${maxPlayers} jogadores).`)
    } catch (error) {
      const friendlyMessage = getMultiplayerErrorMessage(error, "Falha ao entrar no competitivo online.")

      setMultiplayerJoinedRoomId(null)
      setMultiplayerRoom(null)
      setMultiplayerMode(false)
      setMultiplayerIsCasual(false)
      setMultiplayerSection("competitive")
      setMultiplayerError(friendlyMessage)
      showScreenNotice(friendlyMessage)
    } finally {
      setMultiplayerBusy(false)
    }
  }, [accountName, accountUserId, clearPendingInviteJoin, getMultiplayerErrorMessage, leaveCurrentMultiplayerRoomIfNeeded, showScreenNotice])

  const refreshPublicCasualLobbies = useCallback(async () => {
    setPublicCasualLoading(true)
    try {
      const lobbies = await getPublicCasualLobbies(30)
      setPublicCasualLobbies(lobbies)
      if (multiplayerError && multiplayerError.includes("lobbies")) {
        setMultiplayerError(null)
      }
    } catch (error) {
      setPublicCasualLobbies([])
      setMultiplayerError(getMultiplayerErrorMessage(error, "Nao foi possivel carregar os grupos publicos agora."))
    } finally {
      setPublicCasualLoading(false)
    }
  }, [getMultiplayerErrorMessage, multiplayerError])

  useEffect(() => {
    if (currentScreen !== "multiplayer" || multiplayerSection !== "casual" || Boolean(multiplayerJoinedRoomId)) {
      return
    }
  }, [currentScreen, multiplayerJoinedRoomId, multiplayerSection])

  useEffect(() => {
    const pendingInviteRoomId = pendingInviteRoomIdRef.current
    if (!pendingInviteRoomId || isAuthChecking || !accountUserId) {
      return
    }

    if (pendingInviteRetryTimeoutRef.current !== null || pendingInviteRetryCountRef.current > 0) {
      return
    }

    setCurrentScreen("multiplayer")
    setMultiplayerSection("casual")
    setMultiplayerRoomCodeInput(pendingInviteRoomId)
    void joinMultiplayerRoomByCode(pendingInviteRoomId, { autoRetry: true })
  }, [accountUserId, isAuthChecking, joinMultiplayerRoomByCode])

  useEffect(() => {
    return () => {
      if (pendingInviteRetryTimeoutRef.current !== null) {
        window.clearTimeout(pendingInviteRetryTimeoutRef.current)
        pendingInviteRetryTimeoutRef.current = null
      }
    }
  }, [])

  const handleJoinPublicCasualLobby = useCallback(
    async (roomId: string) => {
      if (!accountUserId) {
        setMultiplayerError("Faz login para entrar num grupo multiplayer.")
        return
      }

      await leaveCurrentMultiplayerRoomIfNeeded(roomId)

      multiplayerResultSubmittedRef.current = null

      setMultiplayerBusy(true)
      setMultiplayerError(null)

      try {
        const result = await joinMultiplayerRoom({
          roomId,
          userId: accountUserId,
          displayName: accountName,
        })

        if (!result.ok) {
          setMultiplayerError(result.message || "Nao foi possivel entrar no grupo.")
          refreshPublicCasualLobbies()
          return
        }

        setMultiplayerJoinedRoomId(roomId)
        if (result.room) {
          setMultiplayerRoom(result.room)
        }
        setMultiplayerMode(false)
        setMultiplayerIsCasual(true)
        setMultiplayerSection("casual")
        showScreenNotice("Entraste no grupo!")
      } catch (error) {
        setMultiplayerError(getMultiplayerErrorMessage(error, "Erro ao entrar no grupo."))
        refreshPublicCasualLobbies()
      } finally {
        setMultiplayerBusy(false)
      }
    },
    [accountName, accountUserId, getMultiplayerErrorMessage, leaveCurrentMultiplayerRoomIfNeeded, refreshPublicCasualLobbies, showScreenNotice],
  )

  const handleLeaveMultiplayerRoom = useCallback(async () => {
    if (!multiplayerJoinedRoomId || !accountUserId) {
      return
    }

    clearPendingInviteJoin()
    multiplayerResultSubmittedRef.current = null

    setMultiplayerBusy(true)
    setMultiplayerError(null)

    try {
      if (multiplayerJoinedRoomId.startsWith(LOCAL_ROOM_PREFIX)) {
        setMultiplayerJoinedRoomId(null)
        setMultiplayerRoom(null)
        setMultiplayerMode(false)
        setMultiplayerIsCasual(false)
        showScreenNotice("Saida da sala concluida.")
        return
      }

      await leaveMultiplayerRoom(multiplayerJoinedRoomId, accountUserId)
      setMultiplayerJoinedRoomId(null)
      setMultiplayerRoom(null)
      setMultiplayerMode(false)
      setMultiplayerIsCasual(false)
      showScreenNotice("Saida da sala concluida.")
    } catch {
      setMultiplayerError("Erro ao sair da sala.")
    } finally {
      setMultiplayerBusy(false)
    }
  }, [accountUserId, clearPendingInviteJoin, multiplayerJoinedRoomId, showScreenNotice])

  const handleToggleMultiplayerReady = useCallback(async () => {
    if (!multiplayerJoinedRoomId || !accountUserId || !multiplayerRoom) {
      return
    }

    if (multiplayerRoom.status !== "waiting") {
      return
    }

    const currentPlayer = multiplayerRoom.players?.[accountUserId]
    if (!currentPlayer || currentPlayer.finishedAt || currentPlayer.forfeitAt) {
      return
    }

    const nextReady = !currentPlayer.ready

    if (multiplayerJoinedRoomId.startsWith(LOCAL_ROOM_PREFIX)) {
      setMultiplayerRoom((prev) => {
        if (!prev?.players?.[accountUserId]) {
          return prev
        }

        return {
          ...prev,
          players: {
            ...prev.players,
            [accountUserId]: {
              ...prev.players[accountUserId],
              ready: nextReady,
            },
          },
        }
      })
      showScreenNotice(nextReady ? "Ficaste pronto para jogar." : "Desmarcaste o estado pronto.")
      return
    }

    setMultiplayerBusy(true)
    setMultiplayerError(null)

    try {
      await setMultiplayerPlayerReady({
        roomId: multiplayerJoinedRoomId,
        userId: accountUserId,
        ready: nextReady,
      })
      showScreenNotice(nextReady ? "Ficaste pronto para jogar." : "Desmarcaste o estado pronto.")
    } catch (error) {
      setMultiplayerError(getMultiplayerErrorMessage(error, "Nao foi possivel atualizar o estado pronto."))
    } finally {
      setMultiplayerBusy(false)
    }
  }, [accountUserId, getMultiplayerErrorMessage, multiplayerJoinedRoomId, multiplayerRoom, showScreenNotice])

  const handleRequestMultiplayerRematch = useCallback(async () => {
    if (!multiplayerJoinedRoomId || !accountUserId || !multiplayerRoom) {
      return
    }

    if (multiplayerRoom.status !== "finished") {
      return
    }

    if (multiplayerRoom.hostUserId !== accountUserId) {
      setMultiplayerError("Apenas o host pode preparar a revanche.")
      return
    }

    clearPendingInviteJoin()
    setMultiplayerBusy(true)
    setMultiplayerError(null)

    try {
      if (multiplayerJoinedRoomId.startsWith(LOCAL_ROOM_PREFIX)) {
        setMultiplayerRoom((prev) => {
          if (!prev) {
            return prev
          }

          return {
            ...prev,
            status: "waiting",
            startedAt: undefined,
            finishedAt: undefined,
            winnerUserId: undefined,
            winnerDisplayName: undefined,
            winnerReason: undefined,
            players: Object.fromEntries(
              Object.entries(prev.players || {}).map(([id, player]) => [
                id,
                {
                  ...player,
                  bestWave: 0,
                  finishedAt: undefined,
                  forfeitAt: undefined,
                  ready: false,
                },
              ]),
            ),
          }
        })
        multiplayerResultSubmittedRef.current = null
        showScreenNotice("Revanche preparada! Marquem pronto para voltar a competir.")
        return
      }

      const result = await requestMultiplayerRematch({ roomId: multiplayerJoinedRoomId, hostUserId: accountUserId })
      if (!result.ok) {
        setMultiplayerError(result.message || "Nao foi possivel preparar a revanche.")
        return
      }

      multiplayerResultSubmittedRef.current = null
      showScreenNotice("Revanche preparada! Marquem pronto para voltar a competir.")
    } catch (error) {
      setMultiplayerError(getMultiplayerErrorMessage(error, "Nao foi possivel preparar a revanche."))
    } finally {
      setMultiplayerBusy(false)
    }
  }, [accountUserId, clearPendingInviteJoin, getMultiplayerErrorMessage, multiplayerJoinedRoomId, multiplayerRoom, showScreenNotice])

  const handleExitMultiplayerToMainMenu = useCallback(async () => {
    clearPendingInviteJoin()

    if (multiplayerJoinedRoomId) {
      await handleLeaveMultiplayerRoom()
      setMultiplayerJoinedRoomId(null)
      setMultiplayerRoom(null)
      setMultiplayerMode(false)
      setMultiplayerIsCasual(false)
    }

    setCurrentScreen("main-menu")
  }, [clearPendingInviteJoin, handleLeaveMultiplayerRoom, multiplayerJoinedRoomId])

  const handleStartMultiplayerRoom = useCallback(async () => {
    if (!multiplayerJoinedRoomId || !accountUserId) {
      return false
    }

    const allPlayersReady = multiplayerRoom
      ? Object.values(multiplayerRoom.players || {}).every((player) => player.ready !== false)
      : false

    if (multiplayerRoom?.status === "waiting" && !allPlayersReady) {
      setMultiplayerError("Todos os jogadores precisam de estar prontos antes de iniciar.")
      return false
    }

    setMultiplayerBusy(true)
    setMultiplayerError(null)

    try {
      if (multiplayerJoinedRoomId.startsWith(LOCAL_ROOM_PREFIX)) {
        setMultiplayerRoom((prev) => (prev ? { ...prev, status: "active", startedAt: Date.now() } : prev))
        showScreenNotice("Disputa local iniciada!")
        return true
      }

      const result = await startMultiplayerRoom(multiplayerJoinedRoomId, accountUserId)
      if (!result.ok) {
        setMultiplayerError(result.message || "Nao foi possivel iniciar a sala.")
        return false
      }

      showScreenNotice("Disputa iniciada! Cada jogador pode comecar a run multiplayer.")
      return true
    } catch {
      setMultiplayerError("Erro ao iniciar a sala.")
      return false
    } finally {
      setMultiplayerBusy(false)
    }
  }, [accountUserId, multiplayerJoinedRoomId, multiplayerRoom, showScreenNotice])

  useEffect(() => {
    if (!multiplayerRoom || !multiplayerJoinedRoomId) {
      autoActivatedCompetitiveRoomRef.current = null
      return
    }

    if (multiplayerRoom.mode !== "competitive") {
      autoActivatedCompetitiveRoomRef.current = null
      return
    }

    const playersCount = Object.keys(multiplayerRoom.players || {}).length
    const lobbyIsFull = playersCount >= multiplayerRoom.maxPlayers

    if (multiplayerRoom.status !== "waiting" || !lobbyIsFull) {
      autoActivatedCompetitiveRoomRef.current = null
      return
    }

    if (autoActivatedCompetitiveRoomRef.current === multiplayerJoinedRoomId) {
      return
    }

    autoActivatedCompetitiveRoomRef.current = multiplayerJoinedRoomId
    void handleStartMultiplayerRoom().then((started) => {
      if (!started) {
        autoActivatedCompetitiveRoomRef.current = null
      }
    })
  }, [accountUserId, handleStartMultiplayerRoom, multiplayerJoinedRoomId, multiplayerRoom])

  const handleStartMultiplayerRun = useCallback(() => {
    if (!multiplayerRoom || multiplayerRoom.status !== "active") {
      setMultiplayerError("A sala precisa de estar iniciada para comecar a run.")
      return
    }

    // Online multiplayer runs are session-based and must not write to save slots.
    clearSelectedSlot()
    setGameState({
      playerTeam: {},
      activePokemon: null,
      currentEnvironment: "planicie",
      money: 50,
      battles: 0,
      inventory: { Pokébola: 5, "Scanner Tático": 3 },
      capturedPokemon: [],
      currentBattle: null,
    })

    multiplayerResultSubmittedRef.current = null
    setMultiplayerMode(true)
    setCurrentScreen("menu")
    setShowModal("starter")
    showScreenNotice(
      multiplayerIsCasual
        ? "Disputa casual ativa: vence quem chegar mais longe (nao conta no ranking mensal)!"
        : "Modo multiplayer rankeado ativo: cada run soma pontos e desistir conta como derrota!",
    )
  }, [clearSelectedSlot, multiplayerIsCasual, multiplayerRoom, setGameState, showScreenNotice])

  useEffect(() => {
    if (!multiplayerRoom || !multiplayerJoinedRoomId || multiplayerMode) {
      autoStartedCompetitiveRoomRef.current = null
      return
    }

    const currentPlayer = accountUserId && multiplayerRoom.players?.[accountUserId] ? multiplayerRoom.players[accountUserId] : null

    if (
      multiplayerRoom.status !== "active" ||
      !currentPlayer ||
      currentPlayer.finishedAt ||
      currentPlayer.forfeitAt ||
      multiplayerRoom.players?.[accountUserId || ""]?.ready === false
    ) {
      autoStartedCompetitiveRoomRef.current = null
      return
    }

    if (autoStartedCompetitiveRoomRef.current === multiplayerJoinedRoomId) {
      return
    }

    autoStartedCompetitiveRoomRef.current = multiplayerJoinedRoomId
    handleStartMultiplayerRun()
  }, [accountUserId, handleStartMultiplayerRun, multiplayerJoinedRoomId, multiplayerMode, multiplayerRoom])

  useEffect(() => {
    const legacyCharges = Number(gameState.inventory[LEGACY_BATTLE_SIM_ITEM] || 0)
    if (legacyCharges <= 0) {
      return
    }

    const newInventory = { ...gameState.inventory }
    newInventory[BATTLE_SIM_ITEM] = Number(newInventory[BATTLE_SIM_ITEM] || 0) + legacyCharges
    delete newInventory[LEGACY_BATTLE_SIM_ITEM]

    updateGameState({ inventory: newInventory })
  }, [gameState.inventory, updateGameState])

  const closeModal = useCallback(() => {
    if (showModal === "move-vendor") {
      setMoveVendorOffer(null)
      setMoveVendorReplaceAttack(null)
    }

    if (showModal === "capture-success") {
      setCaptureCelebration(null)
    }

    setShowModal(null)
    setAttackToReplace(null)
    setRecentEvolution(null)
  }, [showModal])

  const playAttackAnimation = useCallback((nextAnimation: AttackAnimationState, duration = 900) => {
    setAttackAnimation(nextAnimation)
    setIsAnimating(true)

    return new Promise<void>((resolve) => {
      window.setTimeout(() => {
        setAttackAnimation(null)
        setIsAnimating(false)
        resolve()
      }, duration)
    })
  }, [])

  const syncAttackPP = (
    existingPP: Record<string, { current: number; max: number }> | undefined,
    attacks: Record<string, [number, number]>,
  ) => {
    const nextPP = initializePP(attacks)

    if (!existingPP) {
      return nextPP
    }

    Object.keys(nextPP).forEach((moveName) => {
      const existingMovePP = existingPP[moveName]
      if (existingMovePP) {
        nextPP[moveName] = {
          current: Math.min(existingMovePP.current, existingMovePP.max),
          max: existingMovePP.max,
        }
      }
    })

    return nextPP
  }

  const buildNextEncounterPreview = useCallback(
    (
      activePokemonName: string,
      activePokemonLevel: number,
      options?: { preferredTypeToken?: string | null; fixedEnemyLevel?: number },
    ): NextEncounterPreview => {
      const nextWave = gameState.battles + 1
      const isBossWave = nextWave % BOSS_WAVE_INTERVAL === 0
      const enemyLevel = options?.fixedEnemyLevel ?? getScaledEnemyLevel(gameState.battles, random)
      const preferredTypeToken = options?.preferredTypeToken || null
      const baseEnemyName = getRandomWildPokemonForEnvironmentWithType(
        nextWave,
        gameState.currentEnvironment,
        enemyLevel,
        preferredTypeToken,
      )

      let enemyName = baseEnemyName
      for (let i = 0; i < 4; i++) {
        const evolution = getEvolutionForPokemon(enemyName, enemyLevel - 1)
        if (!evolution || !wildPokemon[evolution.evolvesTo]) {
          break
        }
        enemyName = evolution.evolvesTo
      }

      const canRollImpostor = enemyName !== "Ditto" && enemyName !== "Zoroark" && wildPokemon[enemyName]?.rarity !== "lendario"
      const impostorRoll = random(1, 1000) / 1000
      const shouldUseImpostor = canRollImpostor && impostorRoll < IMPOSTOR_CHANCE

      const canUseZoroark = enemyLevel >= ZOROARK_MIN_LEVEL && Boolean(wildPokemon.Zoroark)
      const impostorName = shouldUseImpostor ? (canUseZoroark && random(0, 1) === 1 ? "Zoroark" : "Ditto") : enemyName
      const displayEnemyName = shouldUseImpostor ? enemyName : impostorName
      const isShiny = Math.random() < SHINY_CHANCE

      const legalEnemyAttacks = getLegalBattleAttacksForPokemon(
        impostorName,
        wildPokemon[impostorName].type,
        enemyLevel,
      )
      const enemyAttacks = Object.fromEntries(
        Object.entries(legalEnemyAttacks).map(([name, power]) => [name, calculateAttackPower(power, enemyLevel)]),
      )

      return {
        forBattles: gameState.battles,
        forActivePokemon: activePokemonName,
        enemyName: impostorName,
        enemyDisplayName: displayEnemyName,
        isBoss: isBossWave,
        enemyLevel,
        enemyType: wildPokemon[impostorName].type,
        enemyDisplayType: wildPokemon[displayEnemyName].type,
        enemyAttacks,
        isImpostor: shouldUseImpostor,
        isShiny,
      }
    },
    [gameState.battles, gameState.currentEnvironment, random],
  )

  const chooseAnotherPath = useCallback(() => {
    if (!gameState.activePokemon || !nextEncounterPreview) {
      return
    }

    const activePokemon = gameState.playerTeam[gameState.activePokemon]
    if (!activePokemon) {
      showScreenNotice("🛰️ Pokémon ativo inválido para o scanner.")
      return
    }

    const previousDisplayName = nextEncounterPreview.enemyDisplayName

    let rerolledPreview = buildNextEncounterPreview(gameState.activePokemon, activePokemon.level, {
      fixedEnemyLevel: nextEncounterPreview.enemyLevel,
    })

    for (let i = 0; i < 5 && rerolledPreview.enemyDisplayName === previousDisplayName; i++) {
      rerolledPreview = buildNextEncounterPreview(gameState.activePokemon, activePokemon.level, {
        fixedEnemyLevel: nextEncounterPreview.enemyLevel,
      })
    }

    setHiddenEncounterPreview(rerolledPreview)
    setNextEncounterPreview(null)
    setShowModal(null)

    showScreenNotice(
      rerolledPreview.enemyDisplayName === previousDisplayName
        ? "🧭 Seguiste por outro caminho. O próximo encontro foi ocultado."
        : "🧭 Novo caminho escolhido. O próximo encontro foi ocultado.",
    )
  }, [gameState, nextEncounterPreview, buildNextEncounterPreview, showScreenNotice])

  const clearPokemonStatus = useCallback(
    (pokemonName: string) => {
      updatePokemon(pokemonName, {
        statusCondition: null,
        statusTurns: undefined,
        statusWavesRemaining: undefined,
      })
    },
    [updatePokemon],
  )

  const advanceStatusWaves = useCallback(() => {
    Object.entries(gameState.playerTeam).forEach(([pokemonName, pokemon]) => {
      if (!pokemon.statusCondition || !pokemon.statusWavesRemaining) {
        return
      }

      const nextRemaining = pokemon.statusWavesRemaining - 1

      if (nextRemaining <= 0) {
        clearPokemonStatus(pokemonName)
        addLog(`✨ ${pokemonName} recuperou de ${statusLabels[pokemon.statusCondition].toLowerCase()}!`)
        return
      }

      updatePokemon(pokemonName, { statusWavesRemaining: nextRemaining })
    })
  }, [gameState.playerTeam, updatePokemon, clearPokemonStatus, addLog])

  const handleGameOver = useCallback(
    (options?: { silent?: boolean; forfeit?: boolean }) => {
      const finalWave = Math.max(0, latestGameStateRef.current.battles)
      const shouldForfeit = Boolean(options?.forfeit)
      const isRankedMultiplayer = Boolean(
        multiplayerMode &&
          accountUserId &&
          multiplayerJoinedRoomId &&
          !multiplayerIsCasual &&
          !multiplayerJoinedRoomId.startsWith(LOCAL_ROOM_PREFIX),
      )

      if (multiplayerMode && accountUserId && multiplayerJoinedRoomId) {
        const currentRoomId = multiplayerJoinedRoomId
        const points = calculateMultiplayerPoints({ wave: finalWave, forfeit: shouldForfeit })

        if (multiplayerResultSubmittedRef.current !== currentRoomId) {
          multiplayerResultSubmittedRef.current = currentRoomId

          if (isRankedMultiplayer) {
            submitMonthlyLeaderboardScore({
              userId: accountUserId,
              displayName: accountName,
              wave: finalWave,
              points,
              result: shouldForfeit ? "forfeit" : "finished",
              roomId: currentRoomId,
            }).catch(() => {
              // Ignore monthly submission failures to keep game flow responsive.
            })
          }

          if (currentRoomId.startsWith(LOCAL_ROOM_PREFIX)) {
            setMultiplayerRoom((prev) => {
              if (!prev || !prev.players?.[accountUserId]) {
                return prev
              }

              const now = Date.now()
              const currentPlayer = prev.players[accountUserId]
              const nextPlayers = {
                ...prev.players,
                [accountUserId]: {
                  ...currentPlayer,
                  bestWave: Math.max(currentPlayer.bestWave || 0, finalWave),
                  finishedAt: currentPlayer.finishedAt || now,
                  forfeitAt: shouldForfeit ? currentPlayer.forfeitAt || now : currentPlayer.forfeitAt,
                  ready: false,
                },
              }

              const allResolved = Object.values(nextPlayers).every(
                (player) => typeof player.finishedAt === "number" || typeof player.forfeitAt === "number",
              )

              return {
                ...prev,
                players: nextPlayers,
                status: allResolved ? "finished" : prev.status,
                finishedAt: allResolved ? now : prev.finishedAt,
              }
            })
          } else if (shouldForfeit) {
            leaveMultiplayerRoom(currentRoomId, accountUserId).catch(() => {
              // Ignore forfeit sync failures; disconnect cleanup can still catch up.
            })
          } else {
            markMultiplayerPlayerFinished({
              roomId: currentRoomId,
              userId: accountUserId,
              wave: finalWave,
            }).catch(() => {
              // Ignore finish sync failures; room can still continue.
            })
          }
        }

        if (options?.silent) {
          return
        }

        if (screenNoticeTimeoutRef.current) {
          window.clearTimeout(screenNoticeTimeoutRef.current)
          screenNoticeTimeoutRef.current = null
        }

        if (defeatResetTimeoutRef.current) {
          window.clearTimeout(defeatResetTimeoutRef.current)
          defeatResetTimeoutRef.current = null
        }

        if (defeatHideTimeoutRef.current) {
          window.clearTimeout(defeatHideTimeoutRef.current)
          defeatHideTimeoutRef.current = null
        }

        setDefeatAnimationVisible(false)
        setScreenNotice(
          shouldForfeit
            ? "🏳️ A tua partida terminou. A sala continua aberta."
            : `🏁 Ficaste pela wave ${finalWave}. A sala continua aberta.`,
        )
        clearLog()
        setGameState({
          playerTeam: {},
          activePokemon: null,
          currentEnvironment: "planicie",
          money: 50,
          battles: 0,
          inventory: { Pokébola: 5, "Scanner Tático": 3 },
          capturedPokemon: [],
          currentBattle: null,
        })
        setShowModal(null)
        setMultiplayerMode(false)
        setCurrentScreen("multiplayer")
        return
      }

      if (!multiplayerMode && accountUserId) {
        submitSoloFarthestRun({
          userId: accountUserId,
          displayName: accountName,
          wave: finalWave,
        }).catch(() => {
          // Ignore solo leaderboard failures to preserve game flow.
        })
      }

      if (options?.silent) {
        return
      }

      setDefeatAnimationVisible(true)
      setScreenNotice(null)

      if (screenNoticeTimeoutRef.current) {
        window.clearTimeout(screenNoticeTimeoutRef.current)
        screenNoticeTimeoutRef.current = null
      }

      if (defeatResetTimeoutRef.current) {
        window.clearTimeout(defeatResetTimeoutRef.current)
      }
      if (defeatHideTimeoutRef.current) {
        window.clearTimeout(defeatHideTimeoutRef.current)
      }

      defeatResetTimeoutRef.current = window.setTimeout(() => {
        deleteSaveSlot(currentSlot ?? undefined)

        setGameState({
          playerTeam: {},
          activePokemon: null,
          currentEnvironment: "planicie",
          money: 50,
          battles: 0,
          inventory: { Pokébola: 5, "Scanner Tático": 3 },
          capturedPokemon: [],
          currentBattle: null,
        })
        clearLog()
        setCurrentScreen("main-menu")
        setShowModal(null)
        setMultiplayerMode(false)
        setMultiplayerIsCasual(false)
        multiplayerResultSubmittedRef.current = null
        defeatResetTimeoutRef.current = null
      }, 2300)

      defeatHideTimeoutRef.current = window.setTimeout(() => {
        setDefeatAnimationVisible(false)
        defeatHideTimeoutRef.current = null
      }, 3200)
    },
    [
      accountName,
      accountUserId,
      calculateMultiplayerPoints,
      clearLog,
      currentSlot,
      deleteSaveSlot,
      leaveMultiplayerRoom,
      markMultiplayerPlayerFinished,
      multiplayerIsCasual,
      multiplayerJoinedRoomId,
      multiplayerMode,
      submitMonthlyLeaderboardScore,
      setGameState,
      setMultiplayerMode,
      setMultiplayerRoom,
      setMultiplayerIsCasual,
      setScreenNotice,
      setShowModal,
      submitSoloFarthestRun,
    ],
  )

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const handlePageExit = () => {
      if (!multiplayerMode || !accountUserId || !multiplayerJoinedRoomId) {
        return
      }

      void handleGameOver({ silent: true, forfeit: true })
    }

    window.addEventListener("pagehide", handlePageExit)
    window.addEventListener("beforeunload", handlePageExit)

    return () => {
      window.removeEventListener("pagehide", handlePageExit)
      window.removeEventListener("beforeunload", handlePageExit)
    }
  }, [accountUserId, handleGameOver, multiplayerJoinedRoomId, multiplayerMode])

  const handlePlayerKnockout = (pokemonName: string, nextHP = 0) => {
    const alivePokemon = Object.keys(gameState.playerTeam).filter((name) => {
      if (name === pokemonName) {
        return nextHP > 0
      }
      return gameState.playerTeam[name].HP > 0
    })

    if (alivePokemon.length > 0) {
      setShowModal("switch")
      return
    }

    handleGameOver()
  }

  const handleEnemyDefeat = (enemyName: string) => {
    const rarity = wildPokemon[enemyName].rarity
    const reward = rarity === "lendario" ? 100 : rarity === "raro" ? 50 : 15

    addLog(`🎉 ${enemyName} derrotado! +${reward} moedas`)
    updateGameState({ money: gameState.money + reward })

    levelUp()
    setTimeout(() => endBattle(), 900)
  }

  const applyStatusEffect = (moveName: string, target: "player" | "enemy") => {
    const effect = getMoveStatusEffect(moveName)
    if (!effect) return

    if (Math.random() > effect.chance) return

    const turns = effect.turns ? random(effect.turns[0], effect.turns[1]) : undefined

    if (target === "player") {
      if (!gameState.activePokemon) return
      const currentPokemon = gameState.playerTeam[gameState.activePokemon]
      if (!currentPokemon || currentPokemon.statusCondition) return

      updatePokemon(gameState.activePokemon, {
        statusCondition: effect.status,
        statusTurns: turns,
        statusWavesRemaining: persistentStatusWaveDuration[effect.status],
      })
      addLog(`⚠️ ${gameState.activePokemon} ficou ${statusLabels[effect.status].toLowerCase()}!`)
      return
    }

    if (gameState.currentBattle?.enemyStatusCondition) return

    updateBattle({
      enemyStatusCondition: effect.status,
      enemyStatusTurns: turns,
    })
    addLog(`⚠️ ${gameState.currentBattle?.enemyName} ficou ${statusLabels[effect.status].toLowerCase()}!`)
  }

  const processStatusAtTurnStart = (target: "player" | "enemy") => {
    if (target === "player") {
      if (!gameState.activePokemon) return { canAct: true, fainted: false }
      const pokemon = gameState.playerTeam[gameState.activePokemon]
      if (!pokemon?.statusCondition) return { canAct: true, fainted: false }

      const currentStatus = pokemon.statusCondition
      const currentTurns = pokemon.statusTurns ?? 0

      if (currentStatus === "poisoned" || currentStatus === "burned") {
        const chipDamage = Math.max(1, Math.floor(pokemon.maxHP * 0.125))
        const nextHP = Math.max(0, pokemon.HP - chipDamage)
        updatePokemon(gameState.activePokemon, { HP: nextHP })
        addLog(`☠️ ${gameState.activePokemon} sofreu ${chipDamage} de dano por ${statusLabels[currentStatus].toLowerCase()}!`)
        if (nextHP <= 0) {
          handlePlayerKnockout(gameState.activePokemon, nextHP)
          return { canAct: false, fainted: true }
        }
      }

      if (currentStatus === "asleep") {
        if (currentTurns > 1) {
          updatePokemon(gameState.activePokemon, { statusTurns: currentTurns - 1 })
          return { canAct: false, fainted: false }
        }

        updatePokemon(gameState.activePokemon, { statusCondition: null, statusTurns: undefined, statusWavesRemaining: undefined })
      }

      if (currentStatus === "frozen") {
        if (Math.random() < 0.2) {
          updatePokemon(gameState.activePokemon, { statusCondition: null, statusTurns: undefined, statusWavesRemaining: undefined })
        } else {
          return { canAct: false, fainted: false }
        }
      }

      if (currentStatus === "paralyzed" && Math.random() < 0.25) {
        return { canAct: false, fainted: false }
      }

      if (currentStatus === "confused") {
        if (currentTurns > 1) {
          updatePokemon(gameState.activePokemon, { statusTurns: currentTurns - 1 })
        } else {
          updatePokemon(gameState.activePokemon, { statusCondition: null, statusTurns: undefined, statusWavesRemaining: undefined })
        }

        if (Math.random() < 0.33) {
          const selfDamage = Math.max(1, Math.floor(pokemon.maxHP * 0.08))
          const nextHP = Math.max(0, pokemon.HP - selfDamage)
          updatePokemon(gameState.activePokemon, { HP: nextHP })
          if (nextHP <= 0) {
            handlePlayerKnockout(gameState.activePokemon, nextHP)
            return { canAct: false, fainted: true }
          }
          return { canAct: false, fainted: false }
        }
      }

      return { canAct: true, fainted: false }
    }

    if (!gameState.currentBattle?.enemyStatusCondition) return { canAct: true, fainted: false }

    const currentStatus = gameState.currentBattle.enemyStatusCondition
    const currentTurns = gameState.currentBattle.enemyStatusTurns ?? 0

    if (currentStatus === "poisoned" || currentStatus === "burned") {
      const chipDamage = Math.max(1, Math.floor(gameState.currentBattle.enemyMaxHP * 0.125))
      const nextHP = Math.max(0, gameState.currentBattle.enemyHP - chipDamage)
      updateBattle({ enemyHP: nextHP })
      if (nextHP <= 0) {
        handleEnemyDefeat(gameState.currentBattle.enemyName)
        return { canAct: false, fainted: true }
      }
    }

    if (currentStatus === "asleep") {
      if (currentTurns > 1) {
        updateBattle({ enemyStatusTurns: currentTurns - 1 })
        return { canAct: false, fainted: false }
      }

      updateBattle({ enemyStatusCondition: null, enemyStatusTurns: undefined })
    }

    if (currentStatus === "frozen") {
      if (Math.random() < 0.2) {
        updateBattle({ enemyStatusCondition: null, enemyStatusTurns: undefined })
      } else {
        return { canAct: false, fainted: false }
      }
    }

    if (currentStatus === "paralyzed" && Math.random() < 0.25) {
      return { canAct: false, fainted: false }
    }

    if (currentStatus === "confused") {
      if (currentTurns > 1) {
        updateBattle({ enemyStatusTurns: currentTurns - 1 })
      } else {
        updateBattle({ enemyStatusCondition: null, enemyStatusTurns: undefined })
      }

      if (Math.random() < 0.33) {
        const selfDamage = Math.max(1, Math.floor(gameState.currentBattle.enemyMaxHP * 0.08))
        const nextHP = Math.max(0, gameState.currentBattle.enemyHP - selfDamage)
        updateBattle({ enemyHP: nextHP })
        if (nextHP <= 0) {
          handleEnemyDefeat(gameState.currentBattle.enemyName)
          return { canAct: false, fainted: true }
        }
        return { canAct: false, fainted: false }
      }
    }

    return { canAct: true, fainted: false }
  }

  useEffect(() => {
    Object.keys(gameState.playerTeam).forEach((pokemonName) => {
      const pokemon = gameState.playerTeam[pokemonName]
      if (!pokemon.attackPP || Object.keys(pokemon.attackPP).length === 0) {
        const newPP = initializePP(pokemon.attacks)
        updatePokemon(pokemonName, { attackPP: newPP })
      }
    })
  }, [gameState.playerTeam, updatePokemon])

  useEffect(() => {
    if (!gameState.currentBattle || !gameState.activePokemon) return

    const activePokemon = gameState.playerTeam[gameState.activePokemon]
    if (!activePokemon) return

    const expectedPlayerSprite = getPokemonSpriteUrl(
      gameState.activePokemon,
      activePokemon.sprite,
      "back",
      Boolean(activePokemon.isShiny),
    )
    const visibleEnemyName = gameState.currentBattle.enemyDisplayName || gameState.currentBattle.enemyName
    const expectedEnemySprite = getPokemonSpriteUrl(
      visibleEnemyName,
      wildPokemon[visibleEnemyName]?.sprite,
      "front",
      Boolean(gameState.currentBattle.enemyIsShiny),
    )

    if (
      gameState.currentBattle.playerSprite !== expectedPlayerSprite ||
      gameState.currentBattle.enemySprite !== expectedEnemySprite
    ) {
      updateBattle({
        playerSprite: expectedPlayerSprite,
        enemySprite: expectedEnemySprite,
      })
    }
  }, [gameState.activePokemon, gameState.currentBattle, gameState.playerTeam, updateBattle])

  const withAnimation = useCallback(async (callback: () => void) => {
    setIsAnimating(true)
    await new Promise((resolve) => setTimeout(resolve, 300))
    callback()
    await new Promise((resolve) => setTimeout(resolve, 300))
    setIsAnimating(false)
  }, [])

  const loadSavedGame = useCallback(() => {
    if (gameState.activePokemon) {
      setCurrentScreen("menu")
      addLog("🎮 Jogo carregado! Bem-vindo de volta!")
    }
  }, [gameState.activePokemon, addLog])

  const returnToMenu = useCallback(() => {
    if (currentSlot !== null && gameState.activePokemon) {
      // O salvamento já ocorre automaticamente via useLocalGameState
      // que sincroniza com localStorage e Firebase se configurado
    }

    setCurrentScreen("main-menu")
    addLog("🏠 Voltou ao menu principal!")
  }, [currentSlot, gameState, saveSlots, setSaveSlots, GAME_SAVE_KEY, addLog])

  const trainerBarColor = useMemo(() => {
    if (!gameState.activePokemon) return "#b7d99a"

    const activeType = gameState.playerTeam[gameState.activePokemon]?.type
    return trainerBarTypeColors[normalizeTypeKey(activeType)] || "#b7d99a"
  }, [gameState.activePokemon, gameState.playerTeam])

  const activePokemonLabel = useMemo(() => {
    if (!gameState.activePokemon) {
      return "Nenhum"
    }

    const isShiny = Boolean(gameState.playerTeam[gameState.activePokemon]?.isShiny)
    return `${gameState.activePokemon}${isShiny ? " ✨" : ""}`
  }, [gameState.activePokemon, gameState.playerTeam])

  const statusBar = useMemo(
    () =>
      currentScreen !== "main-menu" && gameState.activePokemon ? (
        <div className="pixel-window mb-5 px-4 py-3">
          <div className="pixel-band mb-3 flex items-center justify-between px-4 py-2" style={{ backgroundColor: trainerBarColor }}>
            <span className="pixel-text text-[10px] leading-relaxed text-slate-900 sm:text-xs">Treinador</span>
            <span className="pixel-text text-[10px] leading-relaxed text-slate-900 sm:text-xs">{activePokemonLabel}</span>
          </div>
          <div className="flex flex-wrap justify-between items-center gap-2">
          <Badge className="pixel-badge bg-[linear-gradient(180deg,#fde047_0%,#fde047_50%,#eab308_50%,#eab308_100%)] px-3 py-1 text-slate-900">
            💰 {gameState.money}
          </Badge>
          <Badge className="pixel-badge bg-[linear-gradient(180deg,#f87171_0%,#f87171_50%,#ef4444_50%,#ef4444_100%)] px-3 py-1 text-white">⚔️ {gameState.battles}</Badge>
          <Badge className="pixel-badge bg-[linear-gradient(180deg,#60a5fa_0%,#60a5fa_50%,#2563eb_50%,#2563eb_100%)] px-3 py-1 text-white">
            🎯 {activePokemonLabel}
          </Badge>
          <Badge className="pixel-badge bg-[linear-gradient(180deg,#4ade80_0%,#4ade80_50%,#16a34a_50%,#16a34a_100%)] px-3 py-1 text-white">
            👥 {Object.keys(gameState.playerTeam).length}/{MAX_TEAM_SIZE}
          </Badge>
          {gameState.activePokemon && (
            <div className="pixel-band flex items-center gap-3 bg-white px-3 py-1 text-sm">
              {(() => {
                const activePokemon = gameState.playerTeam[gameState.activePokemon]
                const waveLevelCap = getWaveLevelCap(gameState.battles)
                const xpNeeded = getXpNeededForNextLevelByWaveCap(activePokemon.level, waveLevelCap)

                return (
                  <>
              <span className="pixel-text text-[10px] leading-relaxed text-green-600 sm:text-xs">
                ❤️ {activePokemon.HP}/
                {activePokemon.maxHP}
              </span>
              <span className="pixel-text text-[10px] leading-relaxed text-blue-600 sm:text-xs">⭐ {activePokemon.xp}/{xpNeeded}</span>
              <span className="pixel-text text-[10px] leading-relaxed text-amber-600 sm:text-xs">🧭 Cap Nv.{waveLevelCap}</span>
                  </>
                )
              })()}
            </div>
          )}
          </div>
        </div>
      ) : null,
    [gameState, currentScreen, trainerBarColor, activePokemonLabel],
  )

  const chooseStarter = useCallback(
    (starterName: string) => {
      const basePokemon = { ...starterPokemon[starterName] }
      const calculatedHP = calculateHP(basePokemon.HP, basePokemon.level, starterName)
      const legalStarterAttacks = getLegalBattleAttacksForPokemon(
        starterName,
        basePokemon.type,
        basePokemon.level,
      )
      const starterAttackTemplate = Object.keys(legalStarterAttacks).length > 0 ? legalStarterAttacks : basePokemon.attacks

      const newPokemon = {
        ...basePokemon,
        HP: calculatedHP,
        maxHP: calculatedHP,
        spriteSet: basePokemon.spriteSet || getPokemonSpriteSet(starterName, basePokemon.sprite),
        attacks: Object.fromEntries(
          Object.entries(starterAttackTemplate).map(([name, power]) => [
            name,
            calculateAttackPower(power, basePokemon.level),
          ]),
        ),
        attackPP: initializePP(starterAttackTemplate),
      }

      updateGameState({
        playerTeam: { [starterName]: newPokemon },
        activePokemon: starterName,
        currentEnvironment: getStarterEnvironment(starterName),
      })

      setShowModal(null)
      setCurrentScreen("menu")
      addLog(`🎉 ${starterName} escolhido como seu companheiro!`)
    },
    [updateGameState, addLog],
  )

  const startBattle = useCallback(() => {
    if (!gameState.activePokemon) {
      addLog("⚠️ Erro: Nenhum Pokémon ativo!")
      return
    }

    const activePokemon = gameState.playerTeam[gameState.activePokemon]
    if (!activePokemon) {
      addLog("⚠️ Erro: Pokémon ativo inválido!")
      return
    }

    const nextWave = gameState.battles + 1
    const hasValidHiddenPreview =
      hiddenEncounterPreview &&
      hiddenEncounterPreview.forBattles === gameState.battles &&
      hiddenEncounterPreview.forActivePokemon === gameState.activePokemon

    const hasValidPreview =
      nextEncounterPreview &&
      nextEncounterPreview.forBattles === gameState.battles &&
      nextEncounterPreview.forActivePokemon === gameState.activePokemon

    const encounterPreview = hasValidHiddenPreview
      ? hiddenEncounterPreview
      : hasValidPreview
        ? nextEncounterPreview
        : buildNextEncounterPreview(gameState.activePokemon, activePokemon.level)

    const enemyName = encounterPreview.enemyName
    const enemyDisplayName = encounterPreview.enemyDisplayName
    const enemyLevel = encounterPreview.enemyLevel
    const isBossWave = encounterPreview.isBoss

    const enemyStats = wildPokemonStats[enemyName] || { baseHP: 40, hpMultiplier: 1.0 }
    const baseEnemyMaxHP = calculateHP(enemyStats.baseHP, enemyLevel, enemyName)
    const enemyMaxHP = isBossWave ? Math.max(1, Math.floor(baseEnemyMaxHP * BOSS_MULTIPLIER)) : baseEnemyMaxHP

    const enemyAttacks = isBossWave
      ? Object.fromEntries(
          Object.entries(encounterPreview.enemyAttacks).map(([attackName, damageRange]) => [
            attackName,
            scaleDamageRange(damageRange, BOSS_MULTIPLIER),
          ]),
        )
      : encounterPreview.enemyAttacks

    const enemySpeed = wildPokemon[enemyName].speed || 50
    const playerBattleSprite = getPokemonSpriteUrl(
      gameState.activePokemon,
      activePokemon.sprite,
      "back",
      Boolean(activePokemon.isShiny),
    )
    const enemyBattleSprite = getPokemonSpriteUrl(
      enemyDisplayName,
      wildPokemon[enemyDisplayName].sprite,
      "front",
      encounterPreview.isShiny,
    )

    const newBattle = {
      enemyName,
      enemyType: wildPokemon[enemyName].type,
      enemyDisplayName,
      enemyIsBoss: isBossWave,
      enemyDisplayType: encounterPreview.enemyDisplayType,
      enemyIsDisguised: encounterPreview.isImpostor,
      enemyIsShiny: encounterPreview.isShiny,
      enemyHP: enemyMaxHP,
      enemyMaxHP: enemyMaxHP,
      enemyLevel,
      enemyAttacks,
      enemySpeed,
      enemySprite: enemyBattleSprite,
      playerSprite: playerBattleSprite,
    }

    updateGameState({
      battles: gameState.battles + 1,
      currentBattle: newBattle,
    })
    setNextEncounterPreview(null)
    setHiddenEncounterPreview(null)

    setCurrentScreen("battle")

    const rarity = wildPokemon[enemyName].rarity
    const rarityEmoji = rarity === "lendario" ? "🌟" : rarity === "raro" ? "💎" : "🌿"

    if (rarity === "lendario") {
      showScreenNotice(`👑 O Chefe Lendário ${enemyName} apareceu na Onda ${nextWave}!`, 3800)
    } else if (isBossWave) {
      showScreenNotice(`👑 Boss de Onda ${nextWave}: ${enemyName} entrou em campo!`, 3200)
    }

    const bossTag = isBossWave ? " 👑BOSS" : ""
    const shinyTag = encounterPreview.isShiny ? " ✨SHINY✨" : ""
    addLog(`${rarityEmoji}${bossTag}${shinyTag} ${enemyName} ${rarity} apareceu! (Nv.${enemyLevel}, ${enemyMaxHP}HP)`)
  }, [gameState, updateGameState, addLog, showScreenNotice, nextEncounterPreview, hiddenEncounterPreview, buildNextEncounterPreview])

  const handleAttack = useCallback(
    async (attackName: string) => {
      if (!gameState.activePokemon || !gameState.currentBattle) return

      const activePokemonName = gameState.activePokemon
      const currentBattle = gameState.currentBattle
      const pokemon = gameState.playerTeam[activePokemonName]
      setShowModal(null)

      const executePlayerAttack = async () => {
        const playerTurnState = processStatusAtTurnStart("player")
        if (!playerTurnState.canAct) {
          return { shouldEnemyAttack: !playerTurnState.fainted, enemyDefeated: false }
        }

        if (!pokemon.attackPP?.[attackName] || pokemon.attackPP[attackName].current <= 0) {
          addLog(`⚠️ ${attackName} não tem PP restante!`)
          return { shouldEnemyAttack: false, enemyDefeated: false }
        }

        const [minDamage, maxDamage] = pokemon.attacks[attackName]
        const baseDamage = random(minDamage, maxDamage)

        const attackType = getAttackType(attackName)
        const typeMultiplier = getDamageMultiplier(attackType, currentBattle.enemyType || "Normal")
        const stabMultiplier = getStabMultiplier(attackType, pokemon.type)
        const burnMultiplier = pokemon.statusCondition === "burned" ? 0.8 : 1
        const levelMultiplier = getLevelBalanceMultiplier(pokemon.level, currentBattle.enemyLevel, 0.92, 1.18)
        const finalDamage = Math.max(
          0,
          Math.floor(baseDamage * typeMultiplier * stabMultiplier * levelMultiplier * burnMultiplier),
        )

        const newPP = { ...pokemon.attackPP }
        newPP[attackName] = {
          ...newPP[attackName],
          current: newPP[attackName].current - 1,
        }
        updatePokemon(activePokemonName, { attackPP: newPP })

        await playAttackAnimation({
          id: attackAnimationCounter + 1,
          attacker: "player",
          target: "enemy",
          moveName: attackName,
          attackType,
        })
        setAttackAnimationCounter((current) => current + 1)

        const latestEnemyHP = latestGameStateRef.current.currentBattle?.enemyHP ?? currentBattle.enemyHP
        const newEnemyHP = Math.max(0, latestEnemyHP - finalDamage)
        updateBattle({ enemyHP: newEnemyHP })

        const damageTags = []
        if (stabMultiplier > 1) damageTags.push("STAB")
        if (typeMultiplier > 1) damageTags.push("super efetivo")
        if (typeMultiplier > 0 && typeMultiplier < 1) damageTags.push("resistido")
        if (typeMultiplier === 0) damageTags.push("sem efeito")
        if (burnMultiplier < 1) damageTags.push("queimado")
        if (levelMultiplier > 1.06) damageTags.push("vantagem de nível")

        addLog(
          `⚔️ ${normalizeDisplayText(attackName)} [${attackType}]${damageTags.length ? ` ${damageTags.join(" • ")}` : ""}: ${finalDamage} dano!`,
        )

        applyStatusEffect(attackName, "enemy")

        if (newEnemyHP <= 0) {
          handleEnemyDefeat(currentBattle.enemyName)
          return { shouldEnemyAttack: false, enemyDefeated: true }
        }

        return { shouldEnemyAttack: true, enemyDefeated: false }
      }

      const playerSpeed = getEffectiveSpeed(pokemon.speed || 50, pokemon.statusCondition)
      const enemySpeed = getEffectiveSpeed(
        currentBattle.enemySpeed || 50,
        currentBattle.enemyStatusCondition,
      )
      const enemyAttackNames = Object.keys(currentBattle.enemyAttacks)
      const enemySelectedAttack = enemyAttackNames[Math.floor(Math.random() * enemyAttackNames.length)]
      const playerMovePriority = getMovePriority(attackName)
      const enemyMovePriority = getMovePriority(enemySelectedAttack)

      const enemyMovesFirst =
        enemyMovePriority > playerMovePriority ||
        (enemyMovePriority === playerMovePriority &&
          (enemySpeed > playerSpeed || (enemySpeed === playerSpeed && Math.random() < 0.5)))

      if (enemyMovesFirst) {
        if (enemyMovePriority > playerMovePriority) {
          addLog(`⚡ ${normalizeDisplayText(enemySelectedAttack)} tem prioridade e atacou primeiro!`)
        } else {
          const speedHint =
            enemySpeed > playerSpeed
              ? `🐌 ${currentBattle.enemyName} é mais rápido! (${enemySpeed} vs ${playerSpeed})`
              : `⚖️ Velocidade empatada! ${currentBattle.enemyName} atacou primeiro.`
          addLog(speedHint)
        }

        const enemyTurnResult = await enemyAttack(enemySelectedAttack)
        if (enemyTurnResult.playerFainted || enemyTurnResult.enemyFainted) {
          return
        }

        await executePlayerAttack()
        return
      }

      if (playerMovePriority > enemyMovePriority) {
        addLog(`⚡ ${normalizeDisplayText(attackName)} tem prioridade e atacou primeiro!`)
      } else {
        const speedHint =
          playerSpeed > enemySpeed
            ? `💨 ${activePokemonName} é mais rápido! (${playerSpeed} vs ${enemySpeed})`
            : `⚖️ Velocidade empatada! ${activePokemonName} atacou primeiro.`
        addLog(speedHint)
      }

      const playerResult = await executePlayerAttack()
      if (playerResult.shouldEnemyAttack && !playerResult.enemyDefeated) {
        setTimeout(() => enemyAttack(enemySelectedAttack), 1000)
      }
    },
    [gameState, updateBattle, updatePokemon, addLog, random, playAttackAnimation, attackAnimationCounter],
  )

  const restoreAllPP = useCallback(() => {
    if (!gameState.activePokemon) return

    Object.keys(gameState.playerTeam).forEach((pokemonName) => {
      const pokemon = gameState.playerTeam[pokemonName]
      if (pokemon.attackPP) {
        const restoredPP = Object.fromEntries(
          Object.entries(pokemon.attackPP).map(([move, pp]) => [move, { current: pp.max, max: pp.max }]),
        )
        updatePokemon(pokemonName, { attackPP: restoredPP })
      }
    })
  }, [gameState, updatePokemon])

  const restoreTeamAtCheckpoint = useCallback(() => {
    Object.keys(gameState.playerTeam).forEach((pokemonName) => {
      const pokemon = gameState.playerTeam[pokemonName]
      const restoredPP = pokemon.attackPP
        ? Object.fromEntries(Object.entries(pokemon.attackPP).map(([move, pp]) => [move, { current: pp.max, max: pp.max }]))
        : initializePP(pokemon.attacks)

      updatePokemon(pokemonName, {
        HP: pokemon.maxHP,
        attackPP: restoredPP,
        statusCondition: null,
        statusTurns: undefined,
        statusWavesRemaining: undefined,
      })
    })
  }, [gameState.playerTeam, updatePokemon])

  const useElixir = useCallback(() => {
    if (!gameState.activePokemon || !gameState.inventory["Elixir"] || gameState.inventory["Elixir"] <= 0) {
      addLog("⚠️ Você não tem Elixir!")
      return
    }

    restoreAllPP()

    const newInventory = { ...gameState.inventory }
    newInventory["Elixir"]--
    updateGameState({ inventory: newInventory })

    addLog("✨ Elixir usado! PP de todos os ataques restaurado!")
    setShowModal(null)
  }, [gameState, updateGameState, addLog, restoreAllPP])

  const useFullHeal = useCallback(() => {
    if (!gameState.inventory["Cura Total"] || gameState.inventory["Cura Total"] <= 0) {
      addLog("⚠️ Você não tem Cura Total!")
      return
    }

    const affectedPokemon = Object.entries(gameState.playerTeam).filter(([, pokemon]) => pokemon.statusCondition)

    if (affectedPokemon.length === 0) {
      addLog("✨ Nenhum Pokémon tem efeitos negativos.")
      return
    }

    affectedPokemon.forEach(([pokemonName]) => clearPokemonStatus(pokemonName))

    const newInventory = { ...gameState.inventory }
    newInventory["Cura Total"]--
    updateGameState({ inventory: newInventory })

    addLog("🧴 Cura Total usada! Todos os efeitos negativos foram removidos.")
    setShowModal(null)
  }, [gameState.inventory, gameState.playerTeam, updateGameState, addLog, clearPokemonStatus])

  const openBattleSimulation = useCallback(() => {
    if (!gameState.activePokemon) {
      showScreenNotice("🛰️ Inicia uma jornada para usar o scanner.")
      return
    }

    if (gameState.currentBattle) {
      showScreenNotice("🛰️ O scanner só pode ser usado fora da batalha.")
      return
    }

    const charges = gameState.inventory[BATTLE_SIM_ITEM] || 0
    if (charges <= 0) {
      showScreenNotice("🛰️ Sem cargas do Scanner Tático. Reabastece na loja.")
      return
    }

    const newInventory = { ...gameState.inventory }
    newInventory[BATTLE_SIM_ITEM] = Math.max(0, charges - 1)

    updateGameState({ inventory: newInventory })
    const activePokemon = gameState.playerTeam[gameState.activePokemon]
    if (!activePokemon) {
      showScreenNotice("🛰️ Pokémon ativo inválido para o scanner.")
      return
    }

    const hasValidPreview =
      nextEncounterPreview &&
      nextEncounterPreview.forBattles === gameState.battles &&
      nextEncounterPreview.forActivePokemon === gameState.activePokemon

    const preview = hasValidPreview
      ? nextEncounterPreview
      : buildNextEncounterPreview(gameState.activePokemon, activePokemon.level)

    setNextEncounterPreview(preview)
    showScreenNotice(
      preview.isImpostor
        ? `🛰️ Próximo encontro previsto: ${preview.enemyDisplayName} (disfarce de ${preview.enemyName})${preview.isShiny ? " ✨" : ""}.`
        : preview.isShiny
          ? `🛰️ Próximo encontro previsto: ${preview.enemyDisplayName} ✨.`
          : `🛰️ Próximo encontro previsto: ${preview.enemyDisplayName}.`,
    )
    setShowModal("battle-sim")
  }, [gameState, updateGameState, showScreenNotice, nextEncounterPreview, buildNextEncounterPreview])

  const enemyAttack = useCallback(async (forcedAttackName?: string) => {
    if (!gameState.currentBattle || !gameState.activePokemon || gameState.currentBattle.enemyHP <= 0) {
      return { playerFainted: false, enemyFainted: false }
    }

    const enemyTurnState = processStatusAtTurnStart("enemy")
    if (!enemyTurnState.canAct) {
      return { playerFainted: false, enemyFainted: enemyTurnState.fainted }
    }

    const attacks = Object.keys(gameState.currentBattle.enemyAttacks)
    const playerPokemon = gameState.playerTeam[gameState.activePokemon]

    const attackName = (() => {
      if (forcedAttackName && attacks.includes(forcedAttackName)) {
        return forcedAttackName
      }

      if (attacks.length <= 1) {
        return attacks[0]
      }

      const battle = gameState.currentBattle!
      const moveInsights = attacks.map((moveName) => {
        const [minDamage, maxDamage] = battle.enemyAttacks[moveName]
        const avgDamage = (minDamage + maxDamage) / 2
        const moveType = getAttackType(moveName)
        const typeMultiplier = getDamageMultiplier(moveType, playerPokemon.type || "Normal")
        const stabMultiplier = getStabMultiplier(moveType, battle.enemyType)
        const burnMultiplier = battle.enemyStatusCondition === "burned" ? 0.8 : 1
        const levelMultiplier = getLevelBalanceMultiplier(battle.enemyLevel, playerPokemon.level, 0.85, 1.55)
        const overpowerMultiplier = battle.enemyLevel >= playerPokemon.level * 2 ? 1.35 : 1
        const expectedDamage = Math.max(
          1,
          Math.floor(avgDamage * typeMultiplier * stabMultiplier * levelMultiplier * burnMultiplier * overpowerMultiplier),
        )

        return {
          moveName,
          typeMultiplier,
          expectedDamage,
        }
      })

      const finishingMove = moveInsights
        .filter((insight) => insight.typeMultiplier > 0 && insight.expectedDamage >= playerPokemon.HP)
        .sort((insightA, insightB) => insightB.expectedDamage - insightA.expectedDamage)[0]

      if (finishingMove && Math.random() < 0.88) {
        return finishingMove.moveName
      }

      const superEffectiveMove = moveInsights
        .filter((insight) => insight.typeMultiplier > 1)
        .sort((insightA, insightB) => insightB.expectedDamage - insightA.expectedDamage)[0]

      if (superEffectiveMove && Math.random() < 0.72) {
        return superEffectiveMove.moveName
      }

      const weightedMoves = moveInsights.map((insight) => {
        let weight = Math.max(1, insight.expectedDamage)

        if (insight.typeMultiplier > 1) {
          weight *= 1.3
        } else if (insight.typeMultiplier === 0) {
          weight *= 0.2
        } else if (insight.typeMultiplier < 1) {
          weight *= 0.75
        }

        return {
          moveName: insight.moveName,
          weight,
        }
      })

      const totalWeight = weightedMoves.reduce((sum, move) => sum + move.weight, 0)
      let randomPick = Math.random() * totalWeight

      for (const move of weightedMoves) {
        randomPick -= move.weight
        if (randomPick <= 0) {
          return move.moveName
        }
      }

      return attacks[Math.floor(Math.random() * attacks.length)]
    })()

    const [minDamage, maxDamage] = gameState.currentBattle.enemyAttacks[attackName]
    const baseDamage = random(minDamage, maxDamage)

    const attackType = getAttackType(attackName)
    const typeMultiplier = getDamageMultiplier(attackType, playerPokemon.type || "Normal")
    const stabMultiplier = getStabMultiplier(attackType, gameState.currentBattle.enemyType)
    const burnMultiplier = gameState.currentBattle.enemyStatusCondition === "burned" ? 0.8 : 1
    const levelMultiplier = getLevelBalanceMultiplier(gameState.currentBattle.enemyLevel, playerPokemon.level, 0.85, 1.55)
    const overpowerMultiplier = gameState.currentBattle.enemyLevel >= playerPokemon.level * 2 ? 1.35 : 1
    const damage = Math.max(
      0,
      Math.floor(baseDamage * typeMultiplier * stabMultiplier * levelMultiplier * burnMultiplier * overpowerMultiplier),
    )

    await playAttackAnimation({
      id: attackAnimationCounter + 1,
      attacker: "enemy",
      target: "player",
      moveName: attackName,
      attackType,
    })
    setAttackAnimationCounter((current) => current + 1)

    const newHP = Math.max(0, playerPokemon.HP - damage)
    updatePokemon(gameState.activePokemon, { HP: newHP })

    const enemyDamageTags = []
    if (stabMultiplier > 1) enemyDamageTags.push("STAB")
    if (typeMultiplier > 1) enemyDamageTags.push("super efetivo")
    if (typeMultiplier > 0 && typeMultiplier < 1) enemyDamageTags.push("resistido")
    if (typeMultiplier === 0) enemyDamageTags.push("sem efeito")
    if (burnMultiplier < 1) enemyDamageTags.push("queimado")
    if (levelMultiplier > 1.06) enemyDamageTags.push("vantagem de nível")

    addLog(
      `💥 ${normalizeDisplayText(attackName)} [${attackType}]${enemyDamageTags.length ? ` ${enemyDamageTags.join(" • ")}` : ""}: ${damage} dano em você!`,
    )

    applyStatusEffect(attackName, "player")

    if (newHP <= 0) {
      addLog(`😵 ${gameState.activePokemon} desmaiou!`)
      handlePlayerKnockout(gameState.activePokemon, newHP)
      return { playerFainted: true, enemyFainted: false }
    }

    return { playerFainted: false, enemyFainted: false }
  }, [gameState, updatePokemon, addLog, random, playAttackAnimation, attackAnimationCounter])

  useEffect(() => {
    if (!pendingEnemyTurnAfterSwitch) {
      return
    }

    if (!gameState.currentBattle || !gameState.activePokemon || gameState.currentBattle.enemyHP <= 0) {
      setPendingEnemyTurnAfterSwitch(false)
      return
    }

    setPendingEnemyTurnAfterSwitch(false)
    const timeoutId = window.setTimeout(() => {
      enemyAttack()
    }, 700)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [pendingEnemyTurnAfterSwitch, gameState.currentBattle, gameState.activePokemon, enemyAttack])

  const levelUp = useCallback(() => {
    if (!gameState.activePokemon) return

    const enemyLevel = gameState.currentBattle?.enemyLevel || 1
    const activePokemonName = gameState.activePokemon
    const pokemon = gameState.playerTeam[activePokemonName]
    const enemyRarity = gameState.currentBattle
      ? wildPokemon[gameState.currentBattle.enemyName]?.rarity || "comum"
      : "comum"
    const baseYield = CLASSIC_BASE_XP_YIELD[enemyRarity] || CLASSIC_BASE_XP_YIELD.comum
    const levelDelta = enemyLevel - pokemon.level
    // Reduce influence of level difference on XP (smaller step and tighter clamp)
    const levelDeltaMultiplier = clamp(1 + levelDelta * 0.04, 0.95, 1.5)
    // Reduce wave progress contribution so XP doesn't escalate quickly with waves
    const waveProgressMultiplier = 1 + Math.min(0.2, gameState.battles * 0.005)
    const bossMultiplier = gameState.currentBattle?.enemyIsBoss ? BOSS_XP_MULTIPLIER : 1
    const isEarlyGame = gameState.battles <= EARLY_GAME_TARGET_ROUND && pokemon.level < EARLY_GAME_TARGET_LEVEL
    const earlyGameMultiplier = isEarlyGame ? 1.2 : 1
    const fullRunMultiplier = FULL_RUN_XP_MULTIPLIER
    let xpGain = Math.max(
      1,
      Math.floor(
        ((baseYield * enemyLevel) / 5) *
          XP_GAIN_MULTIPLIER *
          levelDeltaMultiplier *
          waveProgressMultiplier *
          bossMultiplier *
          fullRunMultiplier *
          earlyGameMultiplier,
      ),
    )

    // Compute remaining battles until the next 10-wave cap and the total XP
    // required for the active Pokémon to reach the cap. Adjust xpGain so
    // progression is roughly distributed across the remaining battles.
    try {
      const currentBattle = Math.max(1, gameState.battles)
      const currentTier = Math.floor((currentBattle - 1) / 10)
      const targetCapWave = (currentTier + 1) * 10
      const remainingBattles = Math.max(1, targetCapWave - currentBattle)
      const targetCapLevel = getWaveLevelCap(targetCapWave)

      if (pokemon.level < targetCapLevel) {
        let xpRemainingToCap = 0
        for (let lvl = pokemon.level; lvl < targetCapLevel; lvl++) {
          xpRemainingToCap += getXpNeededForNextLevelByWaveCap(lvl, targetCapLevel)
        }

        const perBattleTarget = xpRemainingToCap / remainingBattles
        // Blend the computed xpGain with the per-battle target so changes are gradual.
        const blended = Math.round(0.65 * perBattleTarget + 0.35 * xpGain)
        // Prevent huge spikes: cap to 1.5x the perBattleTarget
        const capGain = Math.max(1, Math.min(blended, Math.ceil(perBattleTarget * 1.5)))
        xpGain = capGain
      }
    } catch (e) {
      // If anything goes wrong with the dynamic adjustment, fall back to computed xpGain
    }
    const waveLevelCap = getWaveLevelCap(gameState.battles)
    let newXP = pokemon.xp + xpGain

    const hasXpShare = Number(gameState.inventory[XP_SHARE_ITEM] || 0) > 0
    if (hasXpShare) {
      const sharedXp = Math.max(1, Math.floor(xpGain * 0.2))

      Object.entries(gameState.playerTeam).forEach(([teamPokemonName, teamPokemon]) => {
        if (teamPokemonName === activePokemonName) {
          return
        }

        let leveledXp = teamPokemon.xp + sharedXp
        let leveledLevel = teamPokemon.level
        let leveledMaxHP = teamPokemon.maxHP
        let leveledHP = teamPokemon.HP

        while (leveledLevel < waveLevelCap && leveledXp >= getXpNeededForNextLevelByWaveCap(leveledLevel, waveLevelCap)) {
          const requiredXp = getXpNeededForNextLevelByWaveCap(leveledLevel, waveLevelCap)
          leveledXp -= requiredXp
          leveledLevel += 1

          const template = getPokemonBattleTemplate(teamPokemonName)
          const recalculatedMaxHP = calculateHP(template?.baseHP || leveledMaxHP, leveledLevel, teamPokemonName)
          const hpIncrease = recalculatedMaxHP - leveledMaxHP
          leveledMaxHP = recalculatedMaxHP
          leveledHP = Math.min(leveledMaxHP, leveledHP + hpIncrease)
        }

        updatePokemon(teamPokemonName, {
          xp: leveledXp,
          level: leveledLevel,
          maxHP: leveledMaxHP,
          HP: leveledHP,
        })

        addLog(`🤝 ${teamPokemonName} recebeu +${sharedXp} XP pelo XP Share.`)
      })
    }

    // Process multiple level-ups if XP gain is large enough.
    let leveledXp = newXP
    let leveledLevel = pokemon.level
    let leveledMaxHP = pokemon.maxHP
    let leveledHP = pokemon.HP

    while (leveledLevel < waveLevelCap && leveledXp >= getXpNeededForNextLevelByWaveCap(leveledLevel, waveLevelCap)) {
      const requiredXp = getXpNeededForNextLevelByWaveCap(leveledLevel, waveLevelCap)
      leveledXp -= requiredXp
      leveledLevel += 1

      const template = getPokemonBattleTemplate(activePokemonName)
      const recalculatedMaxHP = calculateHP(template?.baseHP || leveledMaxHP, leveledLevel, activePokemonName)
      const hpIncrease = recalculatedMaxHP - leveledMaxHP
      leveledMaxHP = recalculatedMaxHP
      leveledHP = Math.min(leveledMaxHP, leveledHP + hpIncrease)
    }

    // After leveling loop, handle possible evolution or learned moves based on final level.
    let finalLevel = leveledLevel
    const finalTemplate = getPokemonBattleTemplate(activePokemonName)
    const finalScaledAttacks = scaleAttackSetForLevel(pokemon.attacks)
    const learnedMove = getLevelUpMoveForPokemon(activePokemonName, pokemon.type, finalLevel, Object.keys(finalScaledAttacks))
    const evolution = getEvolutionForPokemon(activePokemonName, finalLevel)
    const evolutionTemplate = evolution ? getPokemonBattleTemplate(evolution.evolvesTo) : null

    if (evolution) {
      const evolvedName = evolution.evolvesTo

      const evolvedBaseHP = evolutionTemplate?.baseHP ?? pokemon.maxHP
      const evolvedMaxHP = Math.max(1, calculateHP(evolvedBaseHP, finalLevel, evolvedName))
      const hpDeficit = Math.max(0, leveledMaxHP - leveledHP)
      const evolvedHP = Math.max(1, evolvedMaxHP - hpDeficit)

      const evolvedAttacks = learnedMove && Object.keys(finalScaledAttacks).length < 4
        ? { ...finalScaledAttacks, [learnedMove.name]: calculateAttackPower(learnedMove.power, finalLevel) }
        : finalScaledAttacks

      const evolvedPokemon = {
        ...pokemon,
        level: finalLevel,
        xp: leveledXp,
        HP: evolvedHP,
        maxHP: evolvedMaxHP,
        attacks: evolvedAttacks,
        attackPP: syncAttackPP(pokemon.attackPP, evolvedAttacks),
        sprite: evolutionTemplate?.sprite || getPokemonSpriteUrl(evolvedName, undefined, "front", Boolean(pokemon.isShiny)),
        spriteSet: getPokemonSpriteSet(evolvedName, evolutionTemplate?.sprite, Boolean(pokemon.isShiny)),
        type: evolutionTemplate?.type ?? pokemon.type,
        speed: Math.max(1, evolutionTemplate?.speed ?? pokemon.speed ?? 50),
        isShiny: pokemon.isShiny,
        pendingMove: learnedMove && Object.keys(finalScaledAttacks).length >= 4 ? { name: learnedMove.name, power: learnedMove.power } : undefined,
      }

      const nextTeam = Object.fromEntries(
        Object.entries(gameState.playerTeam).map(([name, teamPokemon]) => (name === activePokemonName ? [evolvedName, evolvedPokemon] : [name, teamPokemon])),
      )

      const nextCapturedPokemon = gameState.capturedPokemon.includes(activePokemonName)
        ? gameState.capturedPokemon.map((name) => (name === activePokemonName ? evolvedName : name))
        : gameState.capturedPokemon

      setGameState({
        ...gameState,
        activePokemon: evolvedName,
        capturedPokemon: nextCapturedPokemon,
        playerTeam: nextTeam,
        currentBattle: gameState.currentBattle
          ? {
              ...gameState.currentBattle,
              playerSprite: getPokemonSpriteUrl(evolvedName, evolutionTemplate?.sprite, "back", Boolean(pokemon.isShiny)),
            }
          : null,
      })

      setRecentEvolution({ from: activePokemonName, to: evolvedName })

      if (learnedMove && Object.keys(finalScaledAttacks).length >= 4) {
        showScreenNotice(`📚 ${evolvedName} quer aprender ${normalizeDisplayText(learnedMove.name)}! Escolhe um ataque para trocar.`)
        setAttackToReplace(null)
        setShowModal("evolution-attacks")
      } else {
        if (learnedMove) {
          showScreenNotice(`📚 ${evolvedName} aprendeu ${normalizeDisplayText(learnedMove.name)}!`)
        }
        setShowModal("evolution")
      }

      addLog(`✨ ${activePokemonName} evoluiu para ${evolvedName}!`)
      return
    } else {
      const upgradedAttacks = learnedMove && Object.keys(finalScaledAttacks).length < 4
        ? { ...finalScaledAttacks, [learnedMove.name]: calculateAttackPower(learnedMove.power, finalLevel) }
        : finalScaledAttacks

      updatePokemon(activePokemonName, {
        level: finalLevel,
        xp: leveledXp,
        maxHP: leveledMaxHP,
        HP: leveledHP,
        attacks: upgradedAttacks,
        attackPP: syncAttackPP(pokemon.attackPP, upgradedAttacks),
        pendingMove: learnedMove && Object.keys(finalScaledAttacks).length >= 4 ? { name: learnedMove.name, power: learnedMove.power } : undefined,
      })

      if (learnedMove && Object.keys(finalScaledAttacks).length < 4) {
        showScreenNotice(`📚 ${activePokemonName} aprendeu ${normalizeDisplayText(learnedMove.name)}!`)
      }
    }

    addLog(`✨ +${xpGain} XP`)
  }, [gameState, updatePokemon, addLog, showScreenNotice, setGameState])

  const handlePokeball = useCallback(
    (ballType: string) => {
      if (!gameState.currentBattle || gameState.currentBattle.enemyHP <= 0) return

      const ballConfig = pokeballs[ballType]
      const ownedBallCount = gameState.inventory[ballType] || 0

      if (!ballConfig) {
        addLog(`⚠️ ${ballType} não é uma Pokébola válida.`)
        return
      }

      if (ownedBallCount <= 0) {
        addLog(`⚠️ Você não tem ${ballType}.`)
        return
      }

      const currentTeamSize = Object.keys(gameState.playerTeam).length
      const enemyName = gameState.currentBattle.enemyName

      if (currentTeamSize >= MAX_TEAM_SIZE) {
        addLog(`🚫 Equipe cheia! O máximo é ${MAX_TEAM_SIZE} Pokémon.`)
        setShowModal(null)
        return
      }

      if (gameState.playerTeam[enemyName]) {
        addLog(`🚫 ${enemyName} já está na sua equipe.`)
        setShowModal(null)
        return
      }

      const newInventory = { ...gameState.inventory }
      newInventory[ballType] = Math.max(0, ownedBallCount - 1)

      const enemyData = wildPokemon[gameState.currentBattle.enemyName]
      const rarity = enemyData.rarity
      const isLegendaryBoss = rarity === "lendario"
      const belowHalfHP = gameState.currentBattle.enemyHP <= Math.floor(gameState.currentBattle.enemyMaxHP / 2)

      if (isLegendaryBoss && !belowHalfHP) {
        showScreenNotice("👑 Chefes lendários só podem ser capturados após ficarem com metade da vida.")
        return
      }

      const finalChance = getClassicCatchChance(
        ballType,
        rarity,
        gameState.currentBattle.enemyHP,
        gameState.currentBattle.enemyMaxHP,
        gameState.currentBattle.enemyStatusCondition,
      )

      setShowModal(null)

      if (Math.random() < finalChance) {
        addLog(`🎉 ${gameState.currentBattle.enemyName} capturado! (${currentTeamSize + 1}/${MAX_TEAM_SIZE})`)

        const enemyStats = wildPokemonStats[gameState.currentBattle.enemyName] || { baseHP: 40, hpMultiplier: 1.0 }
        const maxHP = calculateHP(
          enemyStats.baseHP,
          gameState.currentBattle.enemyLevel,
          gameState.currentBattle.enemyName,
        )

        const reducedMaxHP = isLegendaryBoss ? Math.max(1, Math.floor(maxHP * 0.85)) : maxHP
        const legalCapturedMoves = getLegalBattleAttacksForPokemon(
          gameState.currentBattle.enemyName,
          enemyData.type,
          gameState.currentBattle.enemyLevel,
        )
        const scaledCapturedMoves = Object.fromEntries(
          Object.entries(legalCapturedMoves).map(([name, power]) => [
            name,
            calculateAttackPower(power, gameState.currentBattle!.enemyLevel),
          ]),
        )
        const capturedAttacks = isLegendaryBoss
          ? Object.fromEntries(
              Object.entries(scaledCapturedMoves).map(([name, [min, max]]) => {
                if (min === 0 && max === 0) {
                  return [name, [0, 0] as [number, number]]
                }

                const reducedMin = Math.max(1, Math.floor(min * 0.85))
                const reducedMax = Math.max(reducedMin, Math.floor(max * 0.85))
                return [name, [reducedMin, reducedMax] as [number, number]]
              }),
            )
          : scaledCapturedMoves

        const capturedSpeed = Math.max(1, Math.floor((enemyData.speed || 50) * (isLegendaryBoss ? 0.85 : 1)))

        const newPokemon = {
          HP: reducedMaxHP,
          maxHP: reducedMaxHP,
          attacks: capturedAttacks,
          level: gameState.currentBattle.enemyLevel,
          xp: 0,
          sprite: enemyData.sprite,
          spriteSet: getPokemonSpriteSet(
            gameState.currentBattle.enemyName,
            enemyData.sprite,
            Boolean(gameState.currentBattle.enemyIsShiny),
          ),
          type: enemyData.type,
          speed: capturedSpeed,
          attackPP: initializePP(capturedAttacks),
          isShiny: Boolean(gameState.currentBattle.enemyIsShiny),
        }

        updateGameState({
          inventory: newInventory,
          capturedPokemon: [...gameState.capturedPokemon, gameState.currentBattle.enemyName],
          playerTeam: { ...gameState.playerTeam, [gameState.currentBattle.enemyName]: newPokemon },
        })

        setCaptureCelebration({
          pokemonName: gameState.currentBattle.enemyName,
          sprite: getPokemonSpriteSet(
            gameState.currentBattle.enemyName,
            enemyData.sprite,
            Boolean(gameState.currentBattle.enemyIsShiny),
          ).front,
          rarity,
          isShiny: Boolean(gameState.currentBattle.enemyIsShiny),
        })
        setShowModal("capture-success")
      } else {
        addLog(`😤 ${gameState.currentBattle.enemyName} escapou!`)
        updateGameState({ inventory: newInventory })
        if (gameState.currentBattle.enemyHP > 0) {
          setTimeout(() => enemyAttack(), 1000)
        }
      }
    },
    [gameState, updateGameState, addLog, enemyAttack, showScreenNotice],
  )

  const startCaptureThrow = useCallback((ballType: string) => {
    if (captureThrowAnimation) {
      return
    }

    setShowModal(null)
    setCaptureThrowAnimation({ ballType, throwId: Date.now() })

    if (captureThrowTimeoutRef.current) {
      window.clearTimeout(captureThrowTimeoutRef.current)
    }

    captureThrowTimeoutRef.current = window.setTimeout(() => {
      setCaptureThrowAnimation(null)
      captureThrowTimeoutRef.current = null
      handlePokeball(ballType)
    }, 1200)
  }, [captureThrowAnimation, handlePokeball])

  const endBattle = useCallback((openDestinationChoice = false) => {
    advanceStatusWaves()
    updateGameState({ currentBattle: null })
    setCurrentScreen("menu")

    const reachedCheckpoint = gameState.battles > 0 && gameState.battles % 10 === 0

    if (reachedCheckpoint) {
      restoreTeamAtCheckpoint()
      addLog("💖 Equipa recuperada no checkpoint: HP, PP e status restaurados.")
    }

    const shouldChooseDestination =
      openDestinationChoice || reachedCheckpoint

    if (shouldChooseDestination) {
      setDestinationChoices(getDestinationChoices(gameState.currentEnvironment, gameState.battles))
      addLog("🧭 Escolhe o próximo ambiente para continuar a jornada.")
      setShowModal("destination")
    }
  }, [advanceStatusWaves, updateGameState, gameState.battles, gameState.currentEnvironment, addLog, restoreTeamAtCheckpoint])

  const chooseDestination = useCallback((destination: BattleEnvironment) => {
    updateGameState({ currentEnvironment: destination })
    setShowModal(null)
    showScreenNotice(`🧭 Rota escolhida: ${environmentLabels[destination]}.`)
  }, [showScreenNotice, updateGameState])

  const handleMoveVendorPurchase = useCallback(() => {
    if (!moveVendorOffer) {
      return
    }

    const pokemon = gameState.playerTeam[moveVendorOffer.pokemonName]
    if (!pokemon) {
      addLog("⚠️ O Pokémon da oferta já não está na equipa.")
      setMoveVendorOffer(null)
      setMoveVendorReplaceAttack(null)
      setShowModal(null)
      return
    }

    const currentAttackNames = Object.keys(pokemon.attacks)
    const hasFreeSlot = currentAttackNames.length < 4

    if (!hasFreeSlot && !moveVendorReplaceAttack) {
      addLog("⚠️ Escolhe um ataque para trocar.")
      return
    }

    if (!hasFreeSlot && moveVendorReplaceAttack && !pokemon.attacks[moveVendorReplaceAttack]) {
      addLog("⚠️ Esse ataque já não está disponível para troca.")
      return
    }

    if (gameState.money < moveVendorOffer.price) {
      addLog("💸 Moedas insuficientes para fechar negócio.")
      return
    }

    const learnableMoves = getLearnableMovesForPokemon(
      moveVendorOffer.pokemonName,
      pokemon.type,
      pokemon.level,
      Object.keys(pokemon.attacks),
    )
    const offeredMoveStillValid = learnableMoves.some(
      (move) => normalizeMoveNameKey(move.name) === normalizeMoveNameKey(moveVendorOffer.moveName),
    )

    if (!offeredMoveStillValid) {
      addLog("⚠️ Oferta expirada. Esse Pokémon já não pode aprender este golpe agora.")
      setMoveVendorOffer(null)
      setMoveVendorReplaceAttack(null)
      setShowModal(null)
      return
    }

    const nextAttacks = hasFreeSlot
      ? { ...pokemon.attacks, [moveVendorOffer.moveName]: moveVendorOffer.power }
      : Object.fromEntries(
          Object.entries(pokemon.attacks).map(([attackName, power]) =>
            attackName === moveVendorReplaceAttack ? [moveVendorOffer.moveName, moveVendorOffer.power] : [attackName, power],
          ),
        )

    updatePokemon(moveVendorOffer.pokemonName, {
      attacks: nextAttacks,
      attackPP: syncAttackPP(pokemon.attackPP, nextAttacks),
    })
    updateGameState({ money: gameState.money - moveVendorOffer.price })

    if (hasFreeSlot) {
      showScreenNotice(
        `🧑‍🏫 ${moveVendorOffer.pokemonName} aprendeu ${normalizeDisplayText(moveVendorOffer.moveName)} por ${moveVendorOffer.price} moedas!`,
      )
    } else {
      showScreenNotice(
        `🧑‍🏫 ${moveVendorOffer.pokemonName} trocou ${normalizeDisplayText(moveVendorReplaceAttack!)} por ${normalizeDisplayText(moveVendorOffer.moveName)} por ${moveVendorOffer.price} moedas!`,
      )
    }

    setMoveVendorOffer(null)
    setMoveVendorReplaceAttack(null)
    setShowModal(null)
  }, [moveVendorOffer, moveVendorReplaceAttack, gameState, updatePokemon, updateGameState, addLog, showScreenNotice])

  useEffect(() => {
    if (currentScreen !== "menu" || !gameState.activePokemon || gameState.currentBattle) {
      return
    }

    if (vendorLastBattleRoll === gameState.battles || moveVendorOffer || showModal === "move-vendor") {
      return
    }

    setVendorLastBattleRoll(gameState.battles)

    const vendorChance = 0.08
    if (Math.random() > vendorChance) {
      return
    }

    const possibleOffers = Object.entries(gameState.playerTeam).flatMap(([pokemonName, pokemon]) => {
      const learnable = getLearnableMovesForPokemon(
        pokemonName,
        pokemon.type,
        pokemon.level,
        Object.keys(pokemon.attacks),
      )

      return learnable.map((move) => {
        const averagePower = Math.floor((move.power[0] + move.power[1]) / 2)
        const price = clamp(25 + move.level * 2 + Math.floor(averagePower * 0.7), 30, 220)

        return {
          pokemonName,
          moveName: move.name,
          power: move.power,
          requiredLevel: move.level,
          price,
        }
      })
    })

    if (possibleOffers.length === 0) {
      return
    }

    const selectedOffer = possibleOffers[random(0, possibleOffers.length - 1)]
    const selectedPokemonAttackNames = Object.keys(gameState.playerTeam[selectedOffer.pokemonName].attacks)
    const defaultReplace = selectedPokemonAttackNames.length >= 4 ? selectedPokemonAttackNames[0] || null : null

    setMoveVendorOffer(selectedOffer)
    setMoveVendorReplaceAttack(defaultReplace)
    setShowModal("move-vendor")
    addLog("🧑‍🏫 Um vendedor de técnicas raras apareceu no centro!")
  }, [currentScreen, gameState, vendorLastBattleRoll, moveVendorOffer, showModal, random, addLog])

  const renderStarterModal = () => (
    <div>
      <div className="pixel-band mb-6 bg-[linear-gradient(90deg,#6b7280_0%,#6b7280_30%,#94a3b8_30%,#94a3b8_60%,#7c8b73_60%,#7c8b73_100%)] px-4 py-3 text-center">
        <h3 className="font-pixel text-xs leading-relaxed text-slate-900 sm:text-sm">Escolhe O Pokémon Inicial</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {Object.entries(starterPokemon).map(([name, pokemon]) => (
          <div
            key={name}
            className="cursor-pointer transform transition-all duration-300 hover:scale-105"
            onClick={() => chooseStarter(name)}
          >
            <PokemonCard
              name={name}
              pokemon={pokemon}
              onClick={() => chooseStarter(name)}
              showStats={true}
              className="h-full"
            />
          </div>
        ))}
      </div>
      <div className="mt-6 text-center">
        <p className="border-4 border-slate-800 bg-white/85 px-4 py-3 text-sm text-slate-700 shadow-[4px_4px_0_rgba(15,23,42,0.16)]">
          Escolhe sabiamente. Este será o teu companheiro inicial.
        </p>
        <p className="mt-3 pixel-text text-[10px] leading-relaxed text-white/90">Clica num cartão para escolher</p>
      </div>
    </div>
  )

  const renderSelectSlotModal = () => (
    <div className="w-full max-w-xl rounded-[24px] border-4 border-slate-800 bg-[#f3efe2] p-6 shadow-[8px_8px_0_rgba(15,23,42,0.85)]">
      <div className="mb-5 rounded-[14px] border-4 border-slate-800 bg-[#e7e2d2] px-4 py-3 text-center">
        <h2 className="font-pixel text-sm text-slate-900">Escolhe Um Slot</h2>
      </div>
      <div className="grid grid-cols-1 gap-3">
        {saveSlots.map((slot) => (
          <div
            key={slot.id}
            onClick={() => {
              startNewGameInSlot(slot.id)
              setShowModal("starter")
            }}
            className="cursor-pointer rounded-[16px] border-4 border-slate-800 bg-[linear-gradient(180deg,#f5f5f4_0%,#f5f5f4_55%,#e7e5e4_55%,#e7e5e4_100%)] p-4 text-slate-900 shadow-[5px_5px_0_rgba(15,23,42,0.3)] transition-all hover:-translate-x-[1px] hover:-translate-y-[1px]"
          >
            <div className="font-pixel text-xs leading-relaxed text-slate-900">Espaço {slot.id + 1}</div>
            {slot.gameState?.activePokemon ? (
              <div className="mt-2 text-sm text-slate-900">
                <p>🎯 Pokémon: {slot.gameState.activePokemon}</p>
                <p>⚔️ Batalhas: {slot.gameState.battles}</p>
                <p>💰 Moedas: {slot.gameState.money}</p>
              </div>
            ) : (
              <div className="mt-2 text-sm text-slate-700">Vazio - Clique para começar</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )

  const renderSelectContinueModal = () => (
    <div className="w-full max-w-xl rounded-[24px] border-4 border-slate-800 bg-[#f3efe2] p-6 shadow-[8px_8px_0_rgba(15,23,42,0.85)]">
      <div className="mb-5 rounded-[14px] border-4 border-slate-800 bg-[#e7e2d2] px-4 py-3 text-center">
        <h2 className="font-pixel text-sm text-slate-900">Continuar Jornada</h2>
      </div>
      <div className="grid grid-cols-1 gap-3">
        {saveSlots
          .filter((slot) => slot.gameState?.activePokemon)
          .map((slot) => (
            <div
              key={slot.id}
              onClick={() => {
                loadSlotGame(slot.id)
                setCurrentScreen("menu")
                addLog("🎮 Jogo carregado! Bem-vindo de volta!")
                setShowModal(null)
              }}
              className="cursor-pointer rounded-[16px] border-4 border-slate-800 bg-[linear-gradient(180deg,#f5f5f4_0%,#f5f5f4_55%,#e7e5e4_55%,#e7e5e4_100%)] p-4 text-slate-900 shadow-[5px_5px_0_rgba(15,23,42,0.3)] transition-all hover:-translate-x-[1px] hover:-translate-y-[1px]"
            >
              <div className="font-pixel text-xs leading-relaxed text-slate-900">Espaço {slot.id + 1}</div>
              <div className="mt-2 text-sm text-slate-900">
                <p>🎯 Pokémon: {slot.gameState?.activePokemon}</p>
                <p>⚔️ Batalhas: {slot.gameState?.battles}</p>
                <p>💰 Moedas: {slot.gameState?.money}</p>
                <p>📊 Nível: {slot.gameState?.playerTeam[slot.gameState.activePokemon!]?.level}</p>
              </div>
            </div>
          ))}
      </div>
      {saveSlots.every((slot) => !slot.gameState?.activePokemon) && (
        <div className="mt-4 text-center text-slate-500">
          <p>Nenhuma run salva. Comece um novo jogo!</p>
        </div>
      )}
    </div>
  )

  const renderMainMenu = () => (
    <div className="relative flex h-full flex-col items-center justify-center gap-3 overflow-hidden py-2">
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <div className="absolute left-6 top-8 h-10 w-10 border-4 border-slate-800 bg-yellow-300" />
        <div className="absolute right-8 top-20 h-14 w-14 border-4 border-slate-800 bg-emerald-400" />
        <div className="absolute bottom-10 left-12 h-12 w-12 border-4 border-slate-800 bg-sky-300" />
      </div>
      <div className="pointer-events-none absolute inset-0 z-[5] opacity-65">
        <img src="https://play.pokemonshowdown.com/sprites/gen5/charizard.png" alt="" aria-hidden="true" className="absolute left-2 top-[10%] hidden h-24 w-24 -rotate-6 md:block lg:left-4 lg:h-28 lg:w-28" />
        <img src="https://play.pokemonshowdown.com/sprites/gen5/gengar.png" alt="" aria-hidden="true" className="absolute left-6 top-[34%] hidden h-24 w-24 rotate-3 md:block lg:left-10 lg:h-28 lg:w-28" />
        <img src="https://play.pokemonshowdown.com/sprites/gen5/lapras.png" alt="" aria-hidden="true" className="absolute left-1 bottom-[26%] hidden h-24 w-24 -rotate-3 md:block lg:left-3 lg:h-28 lg:w-28" />
        <img src="https://play.pokemonshowdown.com/sprites/gen5/snorlax.png" alt="" aria-hidden="true" className="absolute left-8 bottom-[6%] hidden h-24 w-24 rotate-2 md:block lg:left-12 lg:h-28 lg:w-28" />

        <img src="https://play.pokemonshowdown.com/sprites/gen5/blastoise.png" alt="" aria-hidden="true" className="absolute right-2 top-[12%] hidden h-24 w-24 rotate-6 md:block lg:right-4 lg:h-28 lg:w-28" />
        <img src="https://play.pokemonshowdown.com/sprites/gen5/venusaur.png" alt="" aria-hidden="true" className="absolute right-7 top-[36%] hidden h-24 w-24 -rotate-2 md:block lg:right-11 lg:h-28 lg:w-28" />
        <img src="https://play.pokemonshowdown.com/sprites/gen5/pikachu.png" alt="" aria-hidden="true" className="absolute right-2 bottom-[28%] hidden h-24 w-24 rotate-3 md:block lg:right-4 lg:h-28 lg:w-28" />
        <img src="https://play.pokemonshowdown.com/sprites/gen5/dragonite.png" alt="" aria-hidden="true" className="absolute right-9 bottom-[7%] hidden h-24 w-24 -rotate-4 md:block lg:right-14 lg:h-28 lg:w-28" />
      </div>
      <div className="relative z-20 w-full max-w-3xl">
        <div className="flex justify-end">
          <Button
            asChild
            className="pixel-menu-button h-10 bg-[linear-gradient(180deg,#6b7280_0%,#6b7280_50%,#4b5563_50%,#4b5563_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)] px-3 text-[10px] leading-relaxed sm:text-xs"
          >
            <Link href="/perfil" aria-label="Abrir perfil">
              <User className="mr-2 h-4 w-4" />
              {accountName}
            </Link>
          </Button>
        </div>
      </div>
      <div className="pixel-surface relative z-10 w-full max-w-3xl bg-[#f8f4dc]/95 p-5 text-center space-y-3">
        <h2 className="font-pixel text-2xl leading-[1.5] text-slate-900 sm:text-4xl">
          Pokémon
          <span className="mt-2 block text-lg text-slate-600 sm:text-2xl">Adventure</span>
        </h2>
        <p className="mx-auto max-w-xl border-4 border-slate-800 bg-white/80 px-4 py-3 text-slate-700 shadow-[4px_4px_0_rgba(15,23,42,0.16)]">Bem-vindo à tua jornada Pokémon.</p>
        <p className="text-slate-500 text-xs pixel-text leading-relaxed">
          📍 {saveSource === "firebase" ? "Guardado no servidor" : "Guardado no navegador"}
        </p>
      </div>

      <div className="flex w-full max-w-md flex-col gap-3">
        <Button
          onClick={() => setCurrentScreen("solo-menu")}
          className="pixel-menu-button h-14 bg-[linear-gradient(180deg,#22c55e_0%,#22c55e_50%,#059669_50%,#059669_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)] text-[10px] leading-relaxed sm:text-xs"
        >
          🎮 Modo Solo
        </Button>

        <Button
          onClick={() => setCurrentScreen("multiplayer")}
          className="pixel-menu-button h-14 bg-[linear-gradient(180deg,#f59e0b_0%,#f59e0b_50%,#d97706_50%,#d97706_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)] text-[10px] leading-relaxed sm:text-xs"
        >
          <Users className="mr-2 h-4 w-4" />
          Modo Multiplayer
        </Button>

        <Button
          onClick={() => setCurrentScreen("leaderboards")}
          className="pixel-menu-button h-14 bg-[linear-gradient(180deg,#3b82f6_0%,#3b82f6_50%,#2563eb_50%,#2563eb_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)] text-[10px] leading-relaxed sm:text-xs"
        >
          <Trophy className="mr-2 h-4 w-4" />
          Ver Tabelas
        </Button>
      </div>

    </div>
  )

  const renderSoloModeScreen = () => (
    <div className="space-y-4">
      <div className="pixel-window bg-[#f8f4dc] p-5">
        <h2 className="font-pixel text-lg leading-relaxed text-slate-900 sm:text-2xl">Modo Solo</h2>
        <p className="mt-2 border-4 border-slate-800 bg-white/80 px-3 py-2 text-sm text-slate-700">
          O competitivo solo e o jogo normal: tenta ir o mais longe possivel em cada run.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          {saveSlots.some((slot) => slot.gameState?.activePokemon) && (
            <Button
              onClick={() => setCurrentScreen("select-continue")}
              className="pixel-menu-button h-14 bg-[linear-gradient(180deg,#3b82f6_0%,#3b82f6_50%,#0891b2_50%,#0891b2_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)] text-[11px] leading-relaxed sm:text-sm"
            >
              Continuar Run Solo
            </Button>
          )}

          <Button
            onClick={() => setCurrentScreen("select-slot")}
            className="pixel-menu-button h-14 bg-[linear-gradient(180deg,#22c55e_0%,#22c55e_50%,#059669_50%,#059669_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)] text-[11px] leading-relaxed sm:text-sm"
          >
            Novo Jogo Solo
          </Button>
        </div>
      </div>

      <Button
        onClick={() => setCurrentScreen("main-menu")}
        className="pixel-menu-button h-12 w-full bg-[linear-gradient(180deg,#6b7280_0%,#6b7280_50%,#4b5563_50%,#4b5563_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)] text-[10px] leading-relaxed sm:text-xs"
      >
        Voltar
      </Button>
    </div>
  )

  const renderMultiplayerScreen = () => {
    const roomPlayers = multiplayerRoom
      ? Object.values(multiplayerRoom.players || {}).sort((a, b) => b.bestWave - a.bestWave)
      : []
    const derivedHostUserId = multiplayerRoom
      ? multiplayerRoom.players?.[multiplayerRoom.hostUserId]
        ? multiplayerRoom.hostUserId
        : Object.keys(multiplayerRoom.players || {})[0] || null
      : null
    const isHost = Boolean(multiplayerRoom && accountUserId && derivedHostUserId === accountUserId)
    const lockCompetitiveTabs = Boolean(multiplayerJoinedRoomId && multiplayerRoom?.mode === "competitive")

    return (
      <div className="space-y-4">
        <div className="pixel-window bg-[#f8f4dc] p-5">
          <h2 className="font-pixel text-lg leading-relaxed text-slate-900 sm:text-2xl">Arena Multiplayer</h2>
          <p className="mt-2 border-4 border-slate-800 bg-white/80 px-3 py-2 text-sm text-slate-700">
            Estilo simples: cria uma sala por código, marca pronto e começa. Sem lista pública e com o competitivo a usar a mesma lógica.
          </p>

          <div className={`mt-4 grid gap-2 ${lockCompetitiveTabs ? "grid-cols-1" : "grid-cols-2"}`}>
            <Button
              onClick={() => setMultiplayerSection("competitive")}
              className={`pixel-menu-button h-11 ${multiplayerSection === "competitive" ? "bg-[linear-gradient(180deg,#ef4444_0%,#ef4444_50%,#b91c1c_50%,#b91c1c_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)]" : "bg-[linear-gradient(180deg,#94a3b8_0%,#94a3b8_50%,#64748b_50%,#64748b_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)]"} text-[10px] leading-relaxed sm:text-xs`}
            >
              Competitivo
            </Button>
            {!lockCompetitiveTabs && (
              <Button
                onClick={() => setMultiplayerSection("casual")}
                className={`pixel-menu-button h-11 ${multiplayerSection === "casual" ? "bg-[linear-gradient(180deg,#0ea5e9_0%,#0ea5e9_50%,#0369a1_50%,#0369a1_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)]" : "bg-[linear-gradient(180deg,#94a3b8_0%,#94a3b8_50%,#64748b_50%,#64748b_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)]"} text-[10px] leading-relaxed sm:text-xs`}
              >
                Casual
              </Button>
            )}
          </div>

          {!multiplayerJoinedRoomId && (
            <div className="mt-4 space-y-3">
              {multiplayerSection === "competitive" ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      onClick={() => setCompetitiveQueueSize(2)}
                      className={`pixel-menu-button h-10 ${competitiveQueueSize === 2 ? "bg-[linear-gradient(180deg,#ef4444_0%,#ef4444_50%,#b91c1c_50%,#b91c1c_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)]" : "bg-[linear-gradient(180deg,#94a3b8_0%,#94a3b8_50%,#64748b_50%,#64748b_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)]"} text-[10px] leading-relaxed sm:text-xs`}
                    >
                      Fila 2 Jogadores
                    </Button>
                    <Button
                      onClick={() => setCompetitiveQueueSize(3)}
                      className={`pixel-menu-button h-10 ${competitiveQueueSize === 3 ? "bg-[linear-gradient(180deg,#ef4444_0%,#ef4444_50%,#b91c1c_50%,#b91c1c_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)]" : "bg-[linear-gradient(180deg,#94a3b8_0%,#94a3b8_50%,#64748b_50%,#64748b_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)]"} text-[10px] leading-relaxed sm:text-xs`}
                    >
                      Fila 3 Jogadores
                    </Button>
                  </div>

                  <Button
                    onClick={() => handleEnterCompetitiveMatch(competitiveQueueSize)}
                    disabled={multiplayerBusy}
                    className="pixel-menu-button h-12 w-full bg-[linear-gradient(180deg,#ef4444_0%,#ef4444_50%,#b91c1c_50%,#b91c1c_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)] text-[10px] leading-relaxed sm:text-xs"
                  >
                    Entrar na Fila Competitiva ({competitiveQueueSize})
                  </Button>
                  <p className="rounded-lg border-2 border-slate-700 bg-white/80 px-3 py-2 text-xs text-slate-700">
                    Sem codigo: quem entra primeiro ocupa vagas na fila escolhida.
                  </p>
                </div>
              ) : (
                <div className="rounded-[24px] border-4 border-slate-900 bg-[linear-gradient(180deg,#eff6ff_0%,#f8fafc_100%)] p-4 shadow-[6px_6px_0_rgba(15,23,42,0.12)]">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">Casual</p>
                      <h3 className="mt-1 font-pixel text-sm text-slate-900">Sala por código</h3>
                    </div>
                    <Badge className="pixel-badge border-2 border-slate-900 bg-white px-3 py-1 text-slate-800 shadow-[3px_3px_0_rgba(15,23,42,0.18)]">
                      Sem lista pública
                    </Badge>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Button
                      onClick={() => handleCreateMultiplayerRoom(2)}
                      disabled={multiplayerBusy}
                      className="pixel-menu-button h-12 bg-[linear-gradient(180deg,#14b8a6_0%,#14b8a6_50%,#0f766e_50%,#0f766e_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)] text-[10px] leading-relaxed sm:text-xs"
                    >
                      Criar sala 2 jogadores
                    </Button>
                    <Button
                      onClick={() => handleCreateMultiplayerRoom(3)}
                      disabled={multiplayerBusy}
                      className="pixel-menu-button h-12 bg-[linear-gradient(180deg,#6366f1_0%,#6366f1_50%,#4338ca_50%,#4338ca_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)] text-[10px] leading-relaxed sm:text-xs"
                    >
                      Criar sala 3 jogadores
                    </Button>
                  </div>

                  <div className="mt-4 space-y-2">
                    <label className="text-xs font-black uppercase tracking-[0.15em] text-slate-600">Código da sala</label>
                    <input
                      value={multiplayerRoomCodeInput}
                      onChange={(event) => setMultiplayerRoomCodeInput(event.target.value)}
                      placeholder="ABC12 ou link"
                      className="w-full rounded-xl border-4 border-slate-800 bg-white px-3 py-2 text-sm text-slate-900 outline-none"
                    />
                    <Button
                      onClick={handleJoinMultiplayerRoom}
                      disabled={multiplayerBusy}
                      className="pixel-menu-button h-12 w-full bg-[linear-gradient(180deg,#0ea5e9_0%,#0ea5e9_50%,#0369a1_50%,#0369a1_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)] text-[10px] leading-relaxed sm:text-xs"
                    >
                      Entrar por código
                    </Button>
                  </div>

                  <p className="mt-3 rounded-2xl border-2 border-slate-900 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                    Partilha o código com quem vai jogar. Cada jogador marca pronto e o host inicia a partida.
                  </p>
                </div>
              )}
            </div>
          )}

          {multiplayerJoinedRoomId && multiplayerRoom && (
            <div className="mt-4 space-y-3 rounded-xl border-4 border-slate-800 bg-white/80 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-pixel text-xs text-slate-900 sm:text-sm">
                  {multiplayerRoom.mode === "casual" ? "Grupo" : "Sala"}: {multiplayerJoinedRoomId}
                </p>
                <Badge className="pixel-badge bg-[linear-gradient(180deg,#14b8a6_0%,#14b8a6_50%,#0f766e_50%,#0f766e_100%)] px-3 py-1 text-white">
                  {multiplayerRoom.status === "waiting" ? "Aguardando" : multiplayerRoom.status === "active" ? "Ativa" : "Finalizada"}
                </Badge>
              </div>
              <p className="text-xs font-semibold text-slate-600">Modo da disputa: {multiplayerRoom.mode === "casual" ? "Casual" : "Competitivo"}</p>

              {multiplayerRoom.mode === "casual" && (
                <div className="rounded-xl border-2 border-emerald-700 bg-emerald-50 px-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.15em] text-emerald-800">Convite do grupo</p>
                      <p className="mt-1 break-all text-xs text-slate-700">{buildMultiplayerInviteUrl(multiplayerRoom.id)}</p>
                    </div>
                    <Button
                      onClick={() => void handleShareMultiplayerInvite()}
                      disabled={multiplayerBusy}
                      className="pixel-menu-button h-9 bg-[linear-gradient(180deg,#25d366_0%,#25d366_50%,#128c7e_50%,#128c7e_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)] text-[10px]"
                    >
                      Partilhar convite
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {roomPlayers.map((player, index) => (
                  <div key={player.userId} className="flex items-center justify-between rounded-lg border-2 border-slate-700 bg-slate-50 px-3 py-2">
                    <span className="text-sm font-semibold text-slate-900">
                      {index + 1}. {player.displayName}
                      {derivedHostUserId === player.userId ? " (Host)" : ""}
                    </span>
                    <span className="text-xs font-black text-slate-700">Wave {player.bestWave}</span>
                  </div>
                ))}
              </div>

              {multiplayerRoom.mode === "casual" ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <Button
                    onClick={handleLeaveMultiplayerRoom}
                    disabled={multiplayerBusy}
                    className="pixel-menu-button h-11 bg-[linear-gradient(180deg,#6b7280_0%,#6b7280_50%,#4b5563_50%,#4b5563_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)] text-[10px] leading-relaxed sm:text-xs"
                  >
                    Sair da Sala
                  </Button>

                  <Button
                    onClick={handleStartMultiplayerRoom}
                    disabled={multiplayerBusy || !isHost || multiplayerRoom.status !== "waiting"}
                    className="pixel-menu-button h-11 bg-[linear-gradient(180deg,#f97316_0%,#f97316_50%,#ea580c_50%,#ea580c_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)] text-[10px] leading-relaxed sm:text-xs"
                  >
                    Iniciar Grupo
                  </Button>

                  <Button
                    onClick={handleStartMultiplayerRun}
                    disabled={multiplayerBusy || multiplayerRoom.status !== "active"}
                    className="pixel-menu-button h-11 bg-[linear-gradient(180deg,#22c55e_0%,#22c55e_50%,#16a34a_50%,#16a34a_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)] text-[10px] leading-relaxed sm:text-xs"
                  >
                    Jogar Run Multiplayer
                  </Button>
                </div>
              ) : (
                <div className="rounded-xl border-2 border-slate-700 bg-slate-100 px-3 py-3 text-center text-[11px] font-semibold text-slate-700">
                  {Object.keys(multiplayerRoom.players || {}).length >= multiplayerRoom.maxPlayers
                    ? "Lobby completo! A partida vai comecar automaticamente."
                    : `A aguardar jogadores (${Object.keys(multiplayerRoom.players || {}).length}/${multiplayerRoom.maxPlayers}).`}
                </div>
              )}
            </div>
          )}

          {multiplayerError && (
            <p className="mt-3 rounded-lg border-2 border-red-700 bg-red-100 px-3 py-2 text-xs font-semibold text-red-900">{multiplayerError}</p>
          )}
        </div>

        <Button
          onClick={handleExitMultiplayerToMainMenu}
          disabled={multiplayerBusy}
          className="pixel-menu-button h-12 w-full bg-[linear-gradient(180deg,#6b7280_0%,#6b7280_50%,#4b5563_50%,#4b5563_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)] text-[10px] leading-relaxed sm:text-xs"
        >
          Voltar ao Menu Principal
        </Button>
      </div>
    )
  }

  const renderMultiplayerHubScreen = () => {
    const roomPlayers = multiplayerRoom
      ? Object.values(multiplayerRoom.players || {}).sort((a, b) => b.bestWave - a.bestWave)
      : []
    const derivedHostUserId = multiplayerRoom
      ? multiplayerRoom.players?.[multiplayerRoom.hostUserId]
        ? multiplayerRoom.hostUserId
        : Object.keys(multiplayerRoom.players || {})[0] || null
      : null
    const isHost = Boolean(multiplayerRoom && accountUserId && derivedHostUserId === accountUserId)
    const lockCompetitiveTabs = Boolean(multiplayerJoinedRoomId && multiplayerRoom?.mode === "competitive")
    const roomSize = multiplayerRoom ? Object.keys(multiplayerRoom.players || {}).length : 0
    const roomReadyCount = multiplayerRoom ? Object.values(multiplayerRoom.players || {}).filter((player) => player.ready !== false).length : 0
    const allPlayersReady = Boolean(multiplayerRoom && multiplayerRoom.status === "waiting" && roomReadyCount >= 2 && roomReadyCount === roomSize)
    const currentRoomPlayer = accountUserId && multiplayerRoom?.players?.[accountUserId] ? multiplayerRoom.players[accountUserId] : null
    const currentPlayerReady = Boolean(currentRoomPlayer?.ready)
    const currentPlayerResolved = Boolean(currentRoomPlayer?.finishedAt || currentRoomPlayer?.forfeitAt)
    const opponentPlayers = roomPlayers.filter((player) => player.userId !== accountUserId)
    const currentOpponent = opponentPlayers[0] || null
    const currentPlayerRoundPoints = currentRoomPlayer
      ? calculateMultiplayerPoints({ wave: currentRoomPlayer.bestWave, forfeit: Boolean(currentRoomPlayer.forfeitAt) })
      : 0
    const roomWinnerPlayer = multiplayerRoom?.winnerUserId ? multiplayerRoom.players?.[multiplayerRoom.winnerUserId] || null : null
    const roomWinnerDisplayName = roomWinnerPlayer?.displayName || multiplayerRoom?.winnerDisplayName || null
    const roomStatusLabel = multiplayerRoom
      ? multiplayerRoom.status === "waiting"
        ? allPlayersReady
          ? "Todos prontos"
          : "A aguardar pronto"
        : multiplayerRoom.status === "active"
          ? currentPlayerResolved
            ? "A tua ronda terminou"
            : "A decorrer"
          : roomWinnerDisplayName
            ? `Venceu ${roomWinnerDisplayName}`
            : "Finalizada"
      : "Sem sala ativa"
    const canOpenRematch = Boolean(multiplayerRoom && multiplayerRoom.status === "finished" && isHost && roomSize >= 2)
    const roomActionGridClass = multiplayerRoom && multiplayerRoom.status === "waiting" ? (isHost ? "sm:grid-cols-3" : "sm:grid-cols-2") : "sm:grid-cols-1"
    const inviteUrl = multiplayerRoom ? buildMultiplayerInviteUrl(multiplayerRoom.id) : ""
    const activeRoom = multiplayerRoom!

    return (
      <div className="space-y-4">
        <div className="overflow-hidden rounded-[28px] border-4 border-slate-900 bg-[linear-gradient(135deg,#ecfeff_0%,#ecfdf5_46%,#fff7ed_100%)] shadow-[10px_10px_0_rgba(15,23,42,0.16)]">
          <div className="border-b-4 border-slate-900 px-5 py-5 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="max-w-3xl space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full border-2 border-slate-900 bg-white/90 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-900">
                  <Sparkles className="h-3.5 w-3.5" />
                  Socket.io
                </div>
                <h2 className="font-pixel text-2xl leading-tight text-slate-900 sm:text-4xl">Arena Multiplayer</h2>
                <p className="max-w-2xl text-sm leading-relaxed text-slate-700">
                  Cria uma sala por código, marca pronto e começa. O Socket.io mantém a sala viva em tempo real sem lobbies públicos.
                </p>
              </div>

              <div className="flex flex-col items-end gap-2">
                <Badge className="pixel-badge border-2 border-slate-900 bg-[linear-gradient(180deg,#10b981_0%,#10b981_50%,#059669_50%,#059669_100%)] px-3 py-1 text-white shadow-[3px_3px_0_rgba(15,23,42,0.22)]">
                  {multiplayerBusy ? "A sincronizar" : "Ligado"}
                </Badge>
                <Badge className="pixel-badge border-2 border-slate-900 bg-[linear-gradient(180deg,#f59e0b_0%,#f59e0b_50%,#d97706_50%,#d97706_100%)] px-3 py-1 text-white shadow-[3px_3px_0_rgba(15,23,42,0.22)]">
                  {roomStatusLabel}
                </Badge>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                onClick={() => setMultiplayerSection("competitive")}
                className={`pixel-menu-button h-11 ${multiplayerSection === "competitive" ? "bg-[linear-gradient(180deg,#ef4444_0%,#ef4444_50%,#b91c1c_50%,#b91c1c_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)]" : "bg-[linear-gradient(180deg,#94a3b8_0%,#94a3b8_50%,#64748b_50%,#64748b_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)]"} text-[10px] leading-relaxed sm:text-xs`}
              >
                Competitivo
              </Button>
              {!lockCompetitiveTabs && (
                <Button
                  onClick={() => setMultiplayerSection("casual")}
                  className={`pixel-menu-button h-11 ${multiplayerSection === "casual" ? "bg-[linear-gradient(180deg,#0ea5e9_0%,#0ea5e9_50%,#0369a1_50%,#0369a1_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)]" : "bg-[linear-gradient(180deg,#94a3b8_0%,#94a3b8_50%,#64748b_50%,#64748b_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)]"} text-[10px] leading-relaxed sm:text-xs`}
                >
                  Casual
                </Button>
              )}
              {multiplayerRoom && (
                <Badge className="pixel-badge border-2 border-slate-900 bg-white/90 px-3 py-1 text-slate-800 shadow-[3px_3px_0_rgba(15,23,42,0.18)]">
                  <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                  {multiplayerRoom.mode === "casual" ? "Grupo ativo" : "Sala competitiva"}
                </Badge>
              )}
            </div>
          </div>

          <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
            <div className="space-y-4">
              {!multiplayerJoinedRoomId ? (
                multiplayerSection === "competitive" ? (
                  <section className="rounded-[24px] border-4 border-slate-900 bg-white p-4 shadow-[6px_6px_0_rgba(15,23,42,0.12)]">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">Matchmaking automático</p>
                        <h3 className="mt-1 font-pixel text-sm text-slate-900">Fila competitiva</h3>
                      </div>
                      <Badge className="pixel-badge border-2 border-slate-900 bg-[linear-gradient(180deg,#0ea5e9_0%,#0ea5e9_50%,#0369a1_50%,#0369a1_100%)] px-3 py-1 text-white">
                        Socket.io
                      </Badge>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <Button
                        onClick={() => setCompetitiveQueueSize(2)}
                        className={`pixel-menu-button h-10 ${competitiveQueueSize === 2 ? "bg-[linear-gradient(180deg,#ef4444_0%,#ef4444_50%,#b91c1c_50%,#b91c1c_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)]" : "bg-[linear-gradient(180deg,#94a3b8_0%,#94a3b8_50%,#64748b_50%,#64748b_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)]"} text-[10px] leading-relaxed sm:text-xs`}
                      >
                        Fila 2 Jogadores
                      </Button>
                      <Button
                        onClick={() => setCompetitiveQueueSize(3)}
                        className={`pixel-menu-button h-10 ${competitiveQueueSize === 3 ? "bg-[linear-gradient(180deg,#ef4444_0%,#ef4444_50%,#b91c1c_50%,#b91c1c_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)]" : "bg-[linear-gradient(180deg,#94a3b8_0%,#94a3b8_50%,#64748b_50%,#64748b_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)]"} text-[10px] leading-relaxed sm:text-xs`}
                      >
                        Fila 3 Jogadores
                      </Button>
                    </div>

                    <Button
                      onClick={() => handleEnterCompetitiveMatch(competitiveQueueSize)}
                      disabled={multiplayerBusy}
                      className="pixel-menu-button mt-3 h-12 w-full bg-[linear-gradient(180deg,#ef4444_0%,#ef4444_50%,#b91c1c_50%,#b91c1c_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)] text-[10px] leading-relaxed sm:text-xs"
                    >
                      Entrar na Fila Competitiva ({competitiveQueueSize})
                    </Button>

                    <p className="mt-3 rounded-2xl border-2 border-slate-900 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                      Sem código: entra na fila e marca pronto quando a sala abrir.
                    </p>
                  </section>
                ) : (
                  <>
                    <section className="rounded-[24px] border-4 border-slate-900 bg-[linear-gradient(180deg,#eff6ff_0%,#f8fafc_100%)] p-4 shadow-[6px_6px_0_rgba(15,23,42,0.12)]">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">Casual</p>
                          <h3 className="mt-1 font-pixel text-sm text-slate-900">Sala por código</h3>
                        </div>
                        <Badge className="pixel-badge border-2 border-slate-900 bg-white px-3 py-1 text-slate-800 shadow-[3px_3px_0_rgba(15,23,42,0.18)]">
                          Sem lista pública
                        </Badge>
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <Button
                          onClick={() => handleCreateMultiplayerRoom(2)}
                          disabled={multiplayerBusy}
                          className="pixel-menu-button h-12 bg-[linear-gradient(180deg,#14b8a6_0%,#14b8a6_50%,#0f766e_50%,#0f766e_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)] text-[10px] leading-relaxed sm:text-xs"
                        >
                          Criar sala 2 jogadores
                        </Button>
                        <Button
                          onClick={() => handleCreateMultiplayerRoom(3)}
                          disabled={multiplayerBusy}
                          className="pixel-menu-button h-12 bg-[linear-gradient(180deg,#6366f1_0%,#6366f1_50%,#4338ca_50%,#4338ca_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)] text-[10px] leading-relaxed sm:text-xs"
                        >
                          Criar sala 3 jogadores
                        </Button>
                      </div>

                      <div className="mt-4 space-y-2">
                        <label className="text-xs font-black uppercase tracking-[0.15em] text-slate-600">Código da sala</label>
                        <input
                          value={multiplayerRoomCodeInput}
                          onChange={(event) => setMultiplayerRoomCodeInput(event.target.value)}
                          placeholder="ABC12 ou link"
                          className="w-full rounded-xl border-4 border-slate-800 bg-white px-3 py-2 text-sm text-slate-900 outline-none"
                        />
                        <Button
                          onClick={handleJoinMultiplayerRoom}
                          disabled={multiplayerBusy}
                          className="pixel-menu-button h-12 w-full bg-[linear-gradient(180deg,#0ea5e9_0%,#0ea5e9_50%,#0369a1_50%,#0369a1_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)] text-[10px] leading-relaxed sm:text-xs"
                        >
                          Entrar por código
                        </Button>
                      </div>

                      <p className="mt-3 rounded-2xl border-2 border-slate-900 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                        Partilha o código com quem vai jogar. Cada jogador marca pronto e o host inicia a partida.
                      </p>
                    </section>
                  </>
                )
              ) : (
                <section className="rounded-[24px] border-4 border-slate-900 bg-white p-4 shadow-[6px_6px_0_rgba(15,23,42,0.12)]">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">Convite ativo</p>
                      <h3 className="mt-1 font-pixel text-sm text-slate-900">Sala ligada</h3>
                    </div>
                    <Badge className="pixel-badge border-2 border-slate-900 bg-[linear-gradient(180deg,#14b8a6_0%,#14b8a6_50%,#0f766e_50%,#0f766e_100%)] px-3 py-1 text-white">
                      {activeRoom.mode === "casual" ? "Grupo" : "Sala"}
                    </Badge>
                  </div>

                  <div className="mt-3 break-all rounded-2xl border-2 border-slate-900 bg-slate-50 p-3 text-xs text-slate-700 shadow-[4px_4px_0_rgba(15,23,42,0.08)]">
                    {inviteUrl}
                  </div>

                  {activeRoom.mode === "casual" && (
                    <Button
                      onClick={() => void handleShareMultiplayerInvite()}
                      disabled={multiplayerBusy}
                      className="pixel-menu-button mt-3 h-10 w-full bg-[linear-gradient(180deg,#25d366_0%,#25d366_50%,#128c7e_50%,#128c7e_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)] text-[10px] leading-relaxed sm:text-xs"
                    >
                      Partilhar convite
                    </Button>
                  )}

                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-2xl border-2 border-slate-900 bg-slate-50 p-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">Sala</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900 break-all">{multiplayerJoinedRoomId}</p>
                      <p className="mt-1 text-xs text-slate-600">
                        {activeRoom.mode === "casual" ? "Grupo casual" : "Competitivo"} · {roomSize}/{activeRoom.maxPlayers}
                      </p>
                    </div>
                    <div className="rounded-2xl border-2 border-slate-900 bg-slate-50 p-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">Estado</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{roomStatusLabel}</p>
                      <p className="mt-1 text-xs text-slate-600">{isHost ? "Tu és o host" : "Ligado como convidado"}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-600">
                        {`${roomReadyCount}/${roomSize} prontos`}
                      </p>
                    </div>
                  </div>

                  <div className={`mt-4 grid gap-2 ${roomActionGridClass}`}>
                    <Button
                      onClick={handleLeaveMultiplayerRoom}
                      disabled={multiplayerBusy}
                      className="pixel-menu-button h-11 bg-[linear-gradient(180deg,#6b7280_0%,#6b7280_50%,#4b5563_50%,#4b5563_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)] text-[10px] leading-relaxed sm:text-xs"
                    >
                      Sair do Grupo
                    </Button>
                    {activeRoom.status === "waiting" && (
                      <Button
                        onClick={handleToggleMultiplayerReady}
                        disabled={multiplayerBusy}
                        className={`pixel-menu-button h-11 ${currentPlayerReady ? "bg-[linear-gradient(180deg,#22c55e_0%,#22c55e_50%,#16a34a_50%,#16a34a_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)]" : "bg-[linear-gradient(180deg,#f59e0b_0%,#f59e0b_50%,#d97706_50%,#d97706_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)]"} text-[10px] leading-relaxed sm:text-xs`}
                      >
                        {currentPlayerReady ? "Desmarcar pronto" : "Estou pronto"}
                      </Button>
                    )}
                    {activeRoom.status === "waiting" && isHost && (
                      <Button
                        onClick={handleStartMultiplayerRoom}
                        disabled={multiplayerBusy || !allPlayersReady}
                        className="pixel-menu-button h-11 bg-[linear-gradient(180deg,#f97316_0%,#f97316_50%,#ea580c_50%,#ea580c_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)] text-[10px] leading-relaxed sm:text-xs"
                      >
                        {allPlayersReady ? "Iniciar partida" : "A aguardar pronto"}
                      </Button>
                    )}
                  </div>

                  {currentRoomPlayer && (currentPlayerResolved || activeRoom.status === "finished") && (
                    <section className="mt-4 rounded-[24px] border-4 border-slate-900 bg-[linear-gradient(180deg,#f8fafc_0%,#fff7ed_100%)] p-4 shadow-[6px_6px_0_rgba(15,23,42,0.12)]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">
                            {activeRoom.status === "finished" ? "Resultado da ronda" : "A tua ronda terminou"}
                          </p>
                          <h3 className="mt-1 font-pixel text-sm text-slate-900">
                            {activeRoom.status === "finished"
                              ? roomWinnerDisplayName
                                ? `${roomWinnerDisplayName} venceu a ronda`
                                : "Ronda concluída"
                              : currentRoomPlayer.forfeitAt
                                ? "Perdeste por desistência"
                                : `Ficaste pela wave ${currentRoomPlayer.bestWave}`}
                          </h3>
                        </div>
                        <Badge className="pixel-badge border-2 border-slate-900 bg-white px-3 py-1 text-slate-800 shadow-[3px_3px_0_rgba(15,23,42,0.18)]">
                          {currentRoomPlayer.forfeitAt
                            ? "Derrota"
                            : currentRoomPlayer.finishedAt
                              ? "Terminaste"
                              : "Em jogo"}
                        </Badge>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border-2 border-slate-900 bg-white p-3">
                          <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">A tua wave</p>
                          <p className="mt-1 text-2xl font-black text-slate-900">Wave {currentRoomPlayer.bestWave}</p>
                          <p className="mt-1 text-xs font-semibold text-slate-600">
                            Pontos desta ronda: {currentPlayerRoundPoints >= 0 ? "+" : ""}{currentPlayerRoundPoints}
                          </p>
                        </div>
                        <div className="rounded-2xl border-2 border-slate-900 bg-white p-3">
                          <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">Adversário</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">{currentOpponent?.displayName || "A aguardar"}</p>
                          <p className="mt-1 text-2xl font-black text-slate-900">Wave {currentOpponent?.bestWave || 0}</p>
                          <p className="mt-1 text-xs font-semibold text-slate-600">
                            {activeRoom.status === "active" ? "A partida continua" : "Partida concluída"}
                          </p>
                        </div>
                      </div>

                      {activeRoom.status === "finished" ? (
                        canOpenRematch ? (
                          <Button
                            onClick={handleRequestMultiplayerRematch}
                            disabled={multiplayerBusy}
                            className="pixel-menu-button mt-3 h-11 w-full bg-[linear-gradient(180deg,#8b5cf6_0%,#8b5cf6_50%,#6d28d9_50%,#6d28d9_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)] text-[10px] leading-relaxed sm:text-xs"
                          >
                            Revanche
                          </Button>
                        ) : (
                          <p className="mt-3 rounded-2xl border-2 border-slate-900 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                            A aguardar o host preparar a revanche.
                          </p>
                        )
                      ) : (
                        <p className="mt-3 rounded-2xl border-2 border-slate-900 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                          A tua ronda terminou. O adversário continua a correr até cair.
                        </p>
                      )}
                    </section>
                  )}
                </section>
              )}

              {multiplayerError && (
                <p className="rounded-2xl border-2 border-red-700 bg-red-100 px-4 py-3 text-xs font-semibold text-red-900 shadow-[4px_4px_0_rgba(185,28,28,0.14)]">
                  {multiplayerError}
                </p>
              )}
            </div>

            <div className="space-y-4">
              {multiplayerRoom ? (
                <>
                  <section className="rounded-[24px] border-4 border-slate-900 bg-white p-4 shadow-[6px_6px_0_rgba(15,23,42,0.12)]">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">Pessoas online</p>
                        <h3 className="mt-1 font-pixel text-sm text-slate-900">Membros do grupo</h3>
                      </div>
                      <Badge className="pixel-badge border-2 border-slate-900 bg-white px-3 py-1 text-slate-800">
                        {roomSize}/{multiplayerRoom.maxPlayers}
                      </Badge>
                    </div>

                    <div className="mt-4 space-y-2">
                      {roomPlayers.map((player, index) => (
                        <div key={player.userId} className="flex items-center justify-between rounded-2xl border-2 border-slate-900 bg-slate-50 px-3 py-3 shadow-[4px_4px_0_rgba(15,23,42,0.08)]">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">
                              {index + 1}. {player.displayName}
                              {derivedHostUserId === player.userId ? " (Host)" : ""}
                            </div>
                            <div className="text-[11px] text-slate-600">Entrou há {Math.max(0, Math.round((Date.now() - player.joinedAt) / 1000))}s</div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span
                              className={`rounded-full border-2 border-slate-900 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${
                                player.forfeitAt
                                  ? "bg-rose-100 text-rose-800"
                                  : player.finishedAt
                                    ? "bg-sky-100 text-sky-800"
                                    : multiplayerRoom.status === "waiting"
                                      ? player.ready
                                        ? "bg-emerald-100 text-emerald-800"
                                        : "bg-amber-100 text-amber-800"
                                      : "bg-white text-slate-700"
                              }`}
                            >
                              {player.forfeitAt
                                ? "Desistiu"
                                : player.finishedAt
                                  ? "Terminou"
                                  : multiplayerRoom.status === "waiting"
                                    ? player.ready
                                      ? "Pronto"
                                      : "A aguardar"
                                    : "A jogar"}
                            </span>
                            <span className="rounded-full border-2 border-slate-900 bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-700">
                              Wave {player.bestWave}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-[24px] border-4 border-slate-900 bg-[linear-gradient(180deg,#ffffff_0%,#ecfeff_100%)] p-4 shadow-[6px_6px_0_rgba(15,23,42,0.12)]">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-slate-700" />
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">Estado do grupo</p>
                        <h3 className="mt-1 font-pixel text-sm text-slate-900">Pronto para jogar</h3>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <div className="rounded-2xl border-2 border-slate-900 bg-white p-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">1</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">Partilhar link</p>
                        <p className="mt-1 text-xs text-slate-600">O grupo abre por convite ou código.</p>
                      </div>
                      <div className="rounded-2xl border-2 border-slate-900 bg-white p-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">2</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">Marcar pronto</p>
                        <p className="mt-1 text-xs text-slate-600">Cada jogador marca pronto antes do host iniciar a run.</p>
                      </div>
                      <div className="rounded-2xl border-2 border-slate-900 bg-white p-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">3</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">Iniciar a run</p>
                        <p className="mt-1 text-xs text-slate-600">O host inicia quando toda a sala estiver pronta.</p>
                      </div>
                    </div>
                    <div className="mt-3 rounded-2xl border-2 border-slate-900 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                      No modo rankeado, fechar o browser ou desistir durante a run conta como derrota.
                    </div>
                  </section>
                </>
              ) : (
                <section className="rounded-[24px] border-4 border-slate-900 bg-white p-5 shadow-[6px_6px_0_rgba(15,23,42,0.12)]">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-slate-700" />
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">Guia rápido</p>
                      <h3 className="mt-1 font-pixel text-sm text-slate-900">Como funciona</h3>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border-2 border-slate-900 bg-slate-50 p-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">1</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">Cria ou encontra um grupo</p>
                      <p className="mt-1 text-xs text-slate-600">Casual para convidar amigos, competitivo para fila automática.</p>
                    </div>
                    <div className="rounded-2xl border-2 border-slate-900 bg-slate-50 p-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">2</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">Partilha o link</p>
                      <p className="mt-1 text-xs text-slate-600">Quem recebe o convite entra com um toque.</p>
                    </div>
                    <div className="rounded-2xl border-2 border-slate-900 bg-slate-50 p-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">3</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">Sincroniza a run</p>
                      <p className="mt-1 text-xs text-slate-600">O estado da sala mantém-se actualizado sem refresh manual.</p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border-2 border-slate-900 bg-[linear-gradient(180deg,#f8fafc_0%,#ecfeff_100%)] p-4 text-sm text-slate-700">
                    O Socket.io substitui a fila frágil e as salas presas. Cada grupo é autoritativo no servidor e os jogadores entram pela mesma fonte de verdade.
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>

        <Button
          onClick={handleExitMultiplayerToMainMenu}
          disabled={multiplayerBusy}
          className="pixel-menu-button h-12 w-full bg-[linear-gradient(180deg,#6b7280_0%,#6b7280_50%,#4b5563_50%,#4b5563_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)] text-[10px] leading-relaxed sm:text-xs"
        >
          Voltar ao Menu Principal
        </Button>
      </div>
    )
  }

  const renderLeaderboardsScreen = () => {
    const selectedEntries = leaderboardViewMode === "solo" ? soloLeaderboardEntries : leaderboardEntries
    const playerPlacementIndex = accountUserId
      ? selectedEntries.findIndex((entry) => entry.userId === accountUserId)
      : -1

    const placementLabel = !accountUserId
      ? "Faz login para ver a tua colocacao."
      : selectedEntries.length === 0
        ? leaderboardViewMode === "multiplayer"
          ? "Sem pontos registados neste modo ainda."
          : "Sem runs registadas neste modo ainda."
        : playerPlacementIndex >= 0
          ? `A tua colocacao atual: #${playerPlacementIndex + 1}`
          : "Ainda nao apareces no Top 100 deste modo."

    return (
    <div className="space-y-4">
      <div className="pixel-window bg-[#f8f4dc] p-5">
        <div className="mb-3 flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-700" />
          <h3 className="font-pixel text-base text-slate-900 sm:text-xl">Tabelas De Classificacao</h3>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2">
          <Button
            onClick={() => setLeaderboardViewMode("solo")}
            className={`pixel-menu-button h-11 ${leaderboardViewMode === "solo" ? "bg-[linear-gradient(180deg,#16a34a_0%,#16a34a_50%,#166534_50%,#166534_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)]" : "bg-[linear-gradient(180deg,#94a3b8_0%,#94a3b8_50%,#64748b_50%,#64748b_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)]"} text-[10px] leading-relaxed sm:text-xs`}
          >
            Solo
          </Button>
          <Button
            onClick={() => setLeaderboardViewMode("multiplayer")}
            className={`pixel-menu-button h-11 ${leaderboardViewMode === "multiplayer" ? "bg-[linear-gradient(180deg,#ea580c_0%,#ea580c_50%,#9a3412_50%,#9a3412_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)]" : "bg-[linear-gradient(180deg,#94a3b8_0%,#94a3b8_50%,#64748b_50%,#64748b_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)]"} text-[10px] leading-relaxed sm:text-xs`}
          >
            Multiplayer
          </Button>
        </div>

        {leaderboardViewMode === "solo" ? (
          <div>
            <div className="space-y-2">
            {soloLeaderboardEntries.length === 0 && (
              <p className="rounded-lg border-2 border-slate-700 bg-white/80 px-3 py-2 text-sm text-slate-700">
                Ainda sem runs solo registadas.
              </p>
            )}

            {soloLeaderboardEntries.map((entry, index) => (
              <div key={entry.runId} className="flex items-center justify-between rounded-lg border-2 border-slate-700 bg-white/90 px-3 py-2">
                <div className="text-sm text-slate-900">
                  <span className="font-black">#{index + 1}</span> {entry.displayName}
                </div>
                <div className="text-right text-xs font-black text-slate-700">
                  <div>Wave {entry.wave}</div>
                  <div className="text-[10px] font-semibold text-slate-500">Run individual</div>
                </div>
              </div>
            ))}
            </div>
          </div>
        ) : (
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <label className="text-xs font-black uppercase tracking-[0.15em] text-slate-600">Mes</label>
              <select
                value={leaderboardMonth}
                onChange={(event) => setLeaderboardMonth(event.target.value)}
                className="rounded-lg border-4 border-slate-800 bg-white px-3 py-2 text-sm text-slate-900"
              >
                {leaderboardMonths.map((month) => (
                  <option key={month} value={month}>
                    {month}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              {leaderboardEntries.length === 0 && (
                <p className="rounded-lg border-2 border-slate-700 bg-white/80 px-3 py-2 text-sm text-slate-700">
                  Ainda sem pontos para {leaderboardMonth}.
                </p>
              )}

              {leaderboardEntries.map((entry, index) => (
                <div key={entry.runId} className="flex items-center justify-between rounded-lg border-2 border-slate-700 bg-white/90 px-3 py-2">
                  <div className="text-sm text-slate-900">
                    <span className="font-black">#{index + 1}</span> {entry.displayName}
                  </div>
                  <div className="text-right text-xs font-black text-slate-700">
                    <div>Pontos {(entry.points ?? entry.wave).toFixed(0)}</div>
                    <div className="text-[10px] font-semibold text-slate-500">Melhor wave {entry.wave}{entry.matches ? ` · ${entry.matches} partidas` : ""}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="pixel-window bg-[#f8f4dc] p-4">
        <p className="text-center text-sm font-black text-slate-800">{placementLabel}</p>
      </div>

      <Button
        onClick={() => setCurrentScreen("main-menu")}
        className="pixel-menu-button h-12 w-full bg-[linear-gradient(180deg,#6b7280_0%,#6b7280_50%,#4b5563_50%,#4b5563_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)] text-[10px] leading-relaxed sm:text-xs"
      >
        Voltar
      </Button>
    </div>
    )
  }

  const renderGameMenu = () => (
    <div className="space-y-4">
      {gameState.activePokemon && statusBar}
      <div className="pixel-window bg-[#f8f4dc] p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="mb-3 font-pixel text-lg leading-relaxed text-slate-900 sm:text-2xl">Centro Do Treinador</h2>
            <p className="pixel-band bg-white/80 px-3 py-2 text-sm text-slate-600">Escolhe a tua próxima ação como num menu de aventura Pokémon.</p>
            <p className="mt-2 text-xs font-bold uppercase tracking-[0.15em] text-slate-600">
              Ambiente atual: {environmentLabels[(gameState.currentEnvironment as BattleEnvironment) || "planicie"]}
            </p>
          </div>
          <div className="flex flex-col items-center gap-2">
            <Button
              onClick={() => setShowModal("type-chart")}
              className="pixel-menu-button h-11 w-11 bg-[linear-gradient(180deg,#38bdf8_0%,#38bdf8_50%,#2563eb_50%,#2563eb_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)] p-0 text-2xl font-black text-white"
              disabled={isAnimating}
              title="Guia de tipos"
              aria-label="Abrir guia de tipos"
            >
              ?
            </Button>
            <div className="relative">
              <Button
                onClick={openBattleSimulation}
                className="pixel-menu-button h-11 w-11 bg-[linear-gradient(180deg,#6366f1_0%,#6366f1_50%,#4338ca_50%,#4338ca_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)] p-0 text-base font-black text-white"
                disabled={isAnimating}
                title={`Scanner (${gameState.inventory[BATTLE_SIM_ITEM] || 0})`}
              >
                🛰️
              </Button>
              <span className="absolute -right-1 -top-1 min-w-[1.1rem] rounded-full border-2 border-slate-900 bg-white px-1 text-center text-[10px] font-black leading-4 text-slate-900">
                {gameState.inventory[BATTLE_SIM_ITEM] || 0}
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Button
          onClick={startBattle}
          className="pixel-menu-button h-16 bg-[linear-gradient(180deg,#ef4444_0%,#ef4444_50%,#dc2626_50%,#dc2626_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)] text-[10px] leading-relaxed sm:text-xs"
          disabled={isAnimating}
        >
          ⚔️ Batalhar
        </Button>
        <Button
          onClick={() => setCurrentScreen("shop")}
          className="pixel-menu-button h-16 bg-[linear-gradient(180deg,#22c55e_0%,#22c55e_50%,#059669_50%,#059669_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)] text-[10px] leading-relaxed sm:text-xs"
          disabled={isAnimating}
        >
          🏪 Loja
        </Button>
        <Button
          onClick={() => setShowModal("team")}
          className="pixel-menu-button h-16 bg-[linear-gradient(180deg,#3b82f6_0%,#3b82f6_50%,#2563eb_50%,#2563eb_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)] text-[10px] leading-relaxed sm:text-xs"
          disabled={isAnimating}
        >
          👥 Equipe
        </Button>
        <Button
          onClick={() => {
            setInventoryTab("pokeballs")
            setShowModal("inventory")
          }}
          className="pixel-menu-button h-16 bg-[linear-gradient(180deg,#8b5cf6_0%,#8b5cf6_50%,#c026d3_50%,#c026d3_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)] text-[10px] leading-relaxed sm:text-xs"
          disabled={isAnimating}
        >
          🎒 Inventário
        </Button>
      </div>
      <Button
        onClick={() => {
          if (multiplayerMode) {
            showScreenNotice("🏳️ Desististe da run multiplayer.")
            handleGameOver({ forfeit: true })
            return
          }

          returnToMenu()
        }}
        className="pixel-menu-button h-12 w-full bg-[linear-gradient(180deg,#6b7280_0%,#6b7280_50%,#4b5563_50%,#4b5563_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)] text-[10px] leading-relaxed sm:text-xs"
      >
        {multiplayerMode ? "🏳️ Desistir da Run" : "🏠 Voltar ao Menu"}
      </Button>
    </div>
  )

  const renderBattleScreen = () => {
    if (!gameState.currentBattle || !gameState.activePokemon) return null

    const overlayGradient = attackAnimation
      ? typeColors[normalizeTypeText(attackAnimation.attackType).split("/")[0]] || "from-white to-slate-300"
      : "from-white to-slate-300"

    return (
      <div className="relative flex min-h-[calc(100dvh-10rem)] max-h-[calc(100dvh-8.5rem)] flex-col gap-2 overflow-hidden">
        {attackAnimation && (
          <div key={attackAnimation.id} className="pointer-events-none absolute inset-0 z-50 overflow-hidden">
            <div className={`battle-attack-flash absolute inset-0 bg-gradient-to-r ${overlayGradient} opacity-35`} />
            <div className="battle-attack-banner absolute left-1/2 top-5 -translate-x-1/2 rounded-full border-4 border-slate-900 bg-white px-5 py-2 text-sm font-black uppercase tracking-[0.25em] text-slate-900 shadow-[0_14px_30px_rgba(0,0,0,0.28)]">
              {normalizeDisplayText(attackAnimation.moveName)}
            </div>
            <div
              className={`absolute top-1/2 h-4 w-[44%] -translate-y-1/2 rounded-full bg-gradient-to-r ${overlayGradient} shadow-[0_0_30px_rgba(255,255,255,0.95)] ${
                attackAnimation.attacker === "player"
                  ? "left-[20%] battle-attack-projectile-player"
                  : "right-[20%] battle-attack-projectile-enemy"
              }`}
            />
            <div
              className={`absolute ${attackAnimation.target === "enemy" ? "right-[8%] top-[16%]" : "left-[8%] bottom-[10%]"} text-5xl font-black uppercase tracking-[0.3em] text-white drop-shadow-[0_6px_0_rgba(0,0,0,0.4)] animate-pulse`}
            >
              HIT
            </div>
            <div
              className={`absolute ${attackAnimation.target === "enemy" ? "right-[11%] top-[28%] battle-impact-enemy" : "left-[11%] bottom-[20%] battle-impact-player"} h-28 w-28 rounded-full border-[10px] border-white bg-white/25`}
            />
          </div>
        )}

        <BattleArena
          playerName={gameState.activePokemon}
          playerPokemon={gameState.playerTeam[gameState.activePokemon]}
          battle={gameState.currentBattle}
          environment={(gameState.currentEnvironment as BattleEnvironment) || "planicie"}
          attackAnimation={attackAnimation}
          className="flex-1 min-h-0"
        />

        <div className="grid grid-cols-2 gap-2 shrink-0 sm:grid-cols-2">
          <Button
            onClick={() => setShowModal("attacks")}
            className="h-10 sm:h-11 bg-gradient-to-r from-red-500 to-red-600 text-xs font-semibold"
            disabled={isAnimating}
          >
            ⚔️ Atacar
          </Button>
          <Button
            onClick={() => setShowModal("capture")}
            className="h-10 sm:h-11 bg-gradient-to-r from-blue-500 to-blue-600 text-xs font-semibold"
            disabled={isAnimating}
          >
            🎯 Capturar
          </Button>
          <Button
            onClick={() => setShowModal("switch")}
            className="h-10 sm:h-11 bg-gradient-to-r from-green-500 to-green-600 text-xs font-semibold"
            disabled={isAnimating}
          >
            🔄 Trocar
          </Button>
          <Button
            onClick={() => {
              if (!gameState.activePokemon || !gameState.currentBattle) {
                showScreenNotice("⚠️ Batalha indisponível. Tenta novamente.")
                return
              }

              const playerPokemon = gameState.playerTeam[gameState.activePokemon]
              if (!playerPokemon) {
                showScreenNotice("⚠️ Pokémon ativo inválido.")
                return
              }

              const playerSpeed = getEffectiveSpeed(playerPokemon.speed || 50, playerPokemon.statusCondition)
              const enemySpeed = getEffectiveSpeed(
                gameState.currentBattle.enemySpeed || 50,
                gameState.currentBattle.enemyStatusCondition,
              )

              let fleeChance = 0.5 // Base 50% chance

              if (playerSpeed > enemySpeed) {
                fleeChance = 0.75 // 75% if faster
                addLog(`💨 Você é mais rápido! (${playerSpeed} vs ${enemySpeed})`)
              } else if (playerSpeed < enemySpeed) {
                fleeChance = 0.25 // 25% if slower
                addLog(`🐌 Você é mais lento! (${playerSpeed} vs ${enemySpeed})`)
              } else {
                addLog(`⚖️ Velocidades iguais! (${playerSpeed} vs ${enemySpeed})`)
              }

              const success = Math.random() < fleeChance

              if (success) {
                addLog(`✅ Fugiu da batalha com sucesso! (${Math.floor(fleeChance * 100)}% chance)`)
                updateGameState({ battles: Math.max(0, gameState.battles - 1) })
                endBattle()
              } else {
                addLog(`❌ Não conseguiu fugir! (${Math.floor(fleeChance * 100)}% chance)`)
                addLog("💥 O Pokemon selvagem atacou!")
                enemyAttack()
              }
            }}
            className="h-10 sm:h-11 bg-gradient-to-r from-gray-500 to-gray-600 text-xs font-semibold"
            disabled={isAnimating}
          >
            🏃 Fugir
          </Button>
        </div>
      </div>
    )
  }

  const renderShop = () => (
    <div className="space-y-4">
      {gameState.activePokemon && statusBar}
      <div className="pixel-window mb-6 flex items-center justify-between bg-[#f8f4dc] px-5 py-4">
        <h2 className="font-pixel pixel-text text-lg leading-relaxed text-slate-900 [text-shadow:2px_2px_0_rgba(255,255,255,0.65)] sm:text-2xl">Poké Mart</h2>
        <Badge className="pixel-badge bg-[linear-gradient(180deg,#fde047_0%,#fde047_50%,#eab308_50%,#eab308_100%)] px-4 py-2 text-slate-900">
          💰 {gameState.money}
        </Badge>
      </div>

      <div className="grid gap-4">
        {[
          {
            name: "Cura Total",
            description: "Remove efeitos negativos da tua equipa",
            price: 35,
            buttonClassName: "bg-[linear-gradient(180deg,#06b6d4_0%,#06b6d4_50%,#0284c7_50%,#0284c7_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)]",
            buy: () => {
              const newInventory = { ...gameState.inventory }
              newInventory["Cura Total"] = (newInventory["Cura Total"] || 0) + 1
              updateGameState({
                money: gameState.money - 35,
                inventory: newInventory,
              })
              addLog("🧴 Cura Total comprada!")
            },
          },
          {
            name: "Pokeheal",
            description: "Restaura HP de todos os Pokemon",
            price: 25,
            buttonClassName: "bg-[linear-gradient(180deg,#22c55e_0%,#22c55e_50%,#059669_50%,#059669_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)]",
            buy: () => {
              Object.keys(gameState.playerTeam).forEach((pokemonName) => {
                const pokemon = gameState.playerTeam[pokemonName]
                updatePokemon(pokemonName, { HP: pokemon.maxHP })
              })
              updateGameState({ money: gameState.money - 25 })
              addLog("💊 Pokeheal usada! Todos os Pokemon foram curados!")
            },
          },
          {
            name: "Elixir",
            description: "Restaura PP de todos os ataques",
            price: 50,
            buttonClassName: "bg-[linear-gradient(180deg,#8b5cf6_0%,#8b5cf6_50%,#c026d3_50%,#c026d3_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)]",
            buy: () => {
              const newInventory = { ...gameState.inventory }
              newInventory["Elixir"] = (newInventory["Elixir"] || 0) + 1
              updateGameState({
                money: gameState.money - 50,
                inventory: newInventory,
              })
              addLog("✨ Elixir comprado!")
            },
          },
          {
            name: XP_SHARE_ITEM,
            description: "Compra única: aliados recebem 20% do XP ganho em cada vitória",
            price: 100,
            buttonClassName: "bg-[linear-gradient(180deg,#f59e0b_0%,#f59e0b_50%,#d97706_50%,#d97706_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)]",
            isUnique: true,
            owned: Number(gameState.inventory[XP_SHARE_ITEM] || 0) > 0,
            buy: () => {
              if (Number(gameState.inventory[XP_SHARE_ITEM] || 0) > 0) {
                addLog("⚠️ XP Share já foi comprado.")
                return
              }

              const newInventory = { ...gameState.inventory }
              newInventory[XP_SHARE_ITEM] = 1

              updateGameState({
                money: gameState.money - 100,
                inventory: newInventory,
              })
              addLog("📡 XP Share adquirido! A equipa agora recebe 20% do XP das vitórias.")
            },
          },
          {
            name: BATTLE_SIM_ITEM,
            description: "Scanner do próximo confronto que detecta disfarces (recurso limitado)",
            price: 350,
            buttonClassName: "bg-[linear-gradient(180deg,#4338ca_0%,#4338ca_50%,#312e81_50%,#312e81_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)]",
            buy: () => {
              const newInventory = { ...gameState.inventory }
              newInventory[BATTLE_SIM_ITEM] = (newInventory[BATTLE_SIM_ITEM] || 0) + 1
              updateGameState({
                money: gameState.money - 350,
                inventory: newInventory,
              })
              showScreenNotice("🛰️ Carga do Scanner Tático comprada.")
            },
          },
        ].map((item) => (
          <div key={item.name} className="pixel-window bg-[#f8f4dc] p-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-pixel text-xs leading-relaxed text-slate-900 sm:text-sm">{item.name}</h3>
                <p className="text-slate-600 text-sm">{item.description}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-yellow-400 font-bold">{item.price} 💰</span>
                <Button
                  onClick={() => {
                    if (item.isUnique && item.owned) {
                      addLog("⚠️ Esse item já foi comprado.")
                      return
                    }

                    if (gameState.money >= item.price) {
                      item.buy()
                    } else {
                      addLog("⚠️ Dinheiro insuficiente!")
                    }
                  }}
                  disabled={gameState.money < item.price || (Boolean(item.isUnique) && Boolean(item.owned))}
                  className={`pixel-menu-button ${item.buttonClassName}`}
                >
                  {item.isUnique && item.owned ? "Comprado" : "Comprar"}
                </Button>
              </div>
            </div>
          </div>
        ))}

        {Object.entries(pokeballs).map(([name, ball]) => (
          <div key={name} className="pixel-window bg-[#f8f4dc] p-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-pixel text-xs leading-relaxed text-slate-900 sm:text-sm">{name}</h3>
                <p className="text-slate-600 text-sm">Taxa de captura: {Math.floor(ball.chance * 100)}%</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-yellow-400 font-bold">{ball.price} 💰</span>
                <Button
                  onClick={() => {
                    if (gameState.money >= ball.price) {
                      const newInventory = { ...gameState.inventory }
                      newInventory[name] = (newInventory[name] || 0) + 1
                      updateGameState({
                        money: gameState.money - ball.price,
                        inventory: newInventory,
                      })
                      addLog(`${name} comprada!`)
                    } else {
                      addLog("⚠️ Dinheiro insuficiente!")
                    }
                  }}
                  disabled={gameState.money < ball.price}
                  className={`pixel-menu-button bg-gradient-to-r ${ball.color}`}
                >
                  Comprar
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Button onClick={() => setCurrentScreen("game")} className="pixel-menu-button mt-4 w-full bg-[linear-gradient(180deg,#3b82f6_0%,#3b82f6_50%,#2563eb_50%,#2563eb_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)] text-[10px] leading-relaxed sm:text-xs">
        Voltar
      </Button>
    </div>
  )

  const renderSelectSlotScreen = () => (
    <div className="flex min-h-[calc(100dvh-2rem)] flex-col items-center justify-center py-4">
      {renderSelectSlotModal()}
      <Button
        onClick={() => setCurrentScreen("main-menu")}
        className="pixel-menu-button mt-5 bg-[linear-gradient(180deg,#6b7280_0%,#6b7280_50%,#4b5563_50%,#4b5563_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)] text-[10px] leading-relaxed sm:text-xs"
      >
        🏠 Voltar ao Menu
      </Button>
    </div>
  )

  const renderSelectContinueScreen = () => (
    <div className="flex min-h-[calc(100dvh-2rem)] flex-col items-center justify-center py-4">
      {renderSelectContinueModal()}
      <Button
        onClick={() => setCurrentScreen("main-menu")}
        className="pixel-menu-button mt-5 bg-[linear-gradient(180deg,#6b7280_0%,#6b7280_50%,#4b5563_50%,#4b5563_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)] text-[10px] leading-relaxed sm:text-xs"
      >
        🏠 Voltar ao Menu
      </Button>
    </div>
  )

  const renderModal = () => {
    if (!showModal) return null

    const isAttackModal = showModal === "attacks"

    const modalContent = () => {
      switch (showModal) {
        case "starter":
          return renderStarterModal()

        case "attacks":
          if (!gameState.activePokemon) return null
          const pokemon = gameState.playerTeam[gameState.activePokemon]
          return (
            <div className="space-y-3">
              <h3 className="text-white font-bold text-xl mb-4">Escolha seu ataque:</h3>
              {Object.entries(pokemon.attacks).map(([attackName, [minDmg, maxDmg]]) => {
                const attackType = normalizeTypeText(getAttackType(attackName))
                const attackAccuracy = getMoveAccuracy(attackName)
                const attackTypeGradient = typeColors[attackType] || "from-gray-500 to-gray-600"
                const statusEffect = getMoveStatusEffect(attackName)
                const effectiveness = gameState.currentBattle
                  ? getDamageMultiplier(attackType, gameState.currentBattle.enemyType)
                  : 1
                const pp = pokemon.attackPP?.[attackName]
                const hasPP = pp && pp.current > 0
                const ppColor = !pp
                  ? "text-gray-400"
                  : pp.current <= 5
                    ? "text-red-400"
                    : pp.current <= 10
                      ? "text-yellow-400"
                      : "text-green-400"

                return (
                  <Button
                    key={attackName}
                    onClick={() => handleAttack(attackName)}
                    disabled={!hasPP}
                    className={`w-full min-h-[5.5rem] text-lg ${
                      !hasPP
                        ? "opacity-50 cursor-not-allowed bg-gray-500"
                        : "bg-gradient-to-r from-red-500 to-orange-500"
                    }`}
                  >
                    <div className="flex justify-between items-center w-full">
                      <div className="flex flex-col items-start gap-1">
                        <span>{normalizeDisplayText(attackName)}</span>
                        <div className="flex items-center gap-2 text-[10px]">
                          <Badge className={`bg-gradient-to-r ${attackTypeGradient} text-white border-0 px-2 py-0`}>
                            {attackType}
                          </Badge>
                          {effectiveness !== 1 && <span className="text-yellow-200">x{effectiveness}</span>}
                          {statusEffect && (
                            <span className="rounded-full border border-cyan-300/70 bg-cyan-400/15 px-2 py-0 text-cyan-100">
                              {statusLabels[statusEffect.status]}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-white/80">
                          <span>Accuracy: {attackAccuracy}%</span>
                          <span>Power: {minDmg}-{maxDmg}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end text-xs">
                        <span className="text-white/80">Tipo: {attackType}</span>
                        <span className={ppColor}>
                          PP: {pp?.current ?? 0}/{pp?.max ?? 0}
                        </span>
                      </div>
                    </div>
                  </Button>
                )
              })}
            </div>
          )

        case "battle-sim":
          if (!gameState.activePokemon) {
            return (
              <div className="text-center">
                <p className="text-white">Sem Pokémon ativo para simular.</p>
              </div>
            )
          }

          if (gameState.currentBattle) {
            return (
              <div className="text-center">
                <p className="text-white">O scanner só pode ser usado fora da batalha.</p>
              </div>
            )
          }

          if (!nextEncounterPreview) {
            return (
              <div className="text-center">
                <p className="text-white">Sem previsão disponível. Usa o scanner novamente.</p>
              </div>
            )
          }

          const previewEnemyTypes = normalizeTypeText(nextEncounterPreview.enemyType)
            .split("/")
            .filter(Boolean)
          const predictedEnemyName = `${nextEncounterPreview.enemyDisplayName}${nextEncounterPreview.isBoss ? " 👑" : ""}${nextEncounterPreview.isShiny ? " ✨" : ""}`
          const previewEnemyAttacks = Object.entries(nextEncounterPreview.enemyAttacks)
            .map(([attackName, [minPower, maxPower]]) => {
              const attackType = normalizeTypeText(getAttackType(attackName)).split("/")[0]
              return { attackName, attackType, minPower, maxPower }
            })
            .sort((attackA, attackB) => attackA.attackName.localeCompare(attackB.attackName))

          return (
            <div className="space-y-4">
              <div className="text-center">
                <h3 className="font-bold text-white text-xl">🛰️ Scanner Tático</h3>
                <p className="mt-1 text-sm text-white/70">Previsão do próximo encontro.</p>
              </div>

              <div className="rounded-xl border border-emerald-300/50 bg-emerald-500/15 p-3 text-center text-sm text-emerald-100">
                Próximo Pokémon previsto: <span className="font-bold uppercase">{predictedEnemyName}</span> (Nv.{nextEncounterPreview.enemyLevel})
              </div>

              <Button
                onClick={chooseAnotherPath}
                className="w-full bg-[linear-gradient(180deg,#10b981_0%,#10b981_50%,#047857_50%,#047857_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)]"
              >
                🧭 Ir Por Outro Caminho
              </Button>

              {nextEncounterPreview.isBoss && (
                <div className="rounded-xl border border-rose-300/50 bg-rose-500/15 p-3 text-center text-sm text-rose-100">
                  👑 O próximo encontro é um BOSS de onda (1.5x HP e 1.5x dano).
                </div>
              )}

              {nextEncounterPreview.isImpostor && (
                <div className="rounded-xl border border-cyan-300/50 bg-cyan-500/15 p-3 text-center text-sm text-cyan-100">
                  Scanner detectou disfarce ativo: assinatura real de {nextEncounterPreview.enemyName}.
                </div>
              )}

              {nextEncounterPreview.isShiny && (
                <div className="rounded-xl border border-amber-300/50 bg-amber-500/15 p-3 text-center text-sm text-amber-100">
                  ✨ Scanner detectou brilho cromático no próximo alvo.
                </div>
              )}

              <div className="rounded-xl border border-white/20 bg-white/10 p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-white/60">Tipagem do próximo adversário</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {previewEnemyTypes.map((enemyType) => (
                    <Badge key={enemyType} className={`bg-gradient-to-r ${typeColors[enemyType] || "from-gray-500 to-gray-600"} border-0 text-white`}>
                      {enemyType}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-white/20 bg-white/10 p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-white/60">Ataques previstos do próximo adversário</div>
                <div className="mt-2 space-y-2">
                  {previewEnemyAttacks.map(({ attackName, attackType, minPower, maxPower }) => (
                    <div key={attackName} className="flex items-center justify-between rounded-lg bg-slate-900/30 px-3 py-2 text-sm text-white">
                      <span>{normalizeDisplayText(attackName)}</span>
                      <span className="font-semibold">{attackType} • {minPower}-{maxPower}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )

        case "capture":
          if (captureThrowAnimation) {
            return (
              <div className="space-y-4 text-center">
                <h3 className="font-bold text-white text-xl">🎯 Captura em andamento</h3>
                <p className="text-sm text-white/75">Lançaste {captureThrowAnimation.ballType}!</p>
                <div className="relative mx-auto h-40 w-full max-w-md overflow-hidden rounded-2xl border border-white/20 bg-slate-950/35">
                  <motion.div
                    initial={{ x: "-36%", y: "72%", rotate: 0, scale: 0.9 }}
                    animate={{
                      x: ["-36%", "-4%", "32%"],
                      y: ["72%", "16%", "6%"],
                      rotate: [0, 260, 620],
                      scale: [0.9, 1.04, 0.92],
                    }}
                    transition={{ duration: 1.05, ease: "easeInOut" }}
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                  >
                    <div className="relative h-16 w-16">
                      <div
                        className={`absolute inset-0 rounded-full border-4 border-slate-900 bg-gradient-to-r ${pokeballs[captureThrowAnimation.ballType]?.color || "from-rose-500 to-red-600"}`}
                      />
                      <div className="absolute left-[2px] right-[2px] top-1/2 h-[24px] -translate-y-[2px] rounded-b-full bg-white" />
                      <div className="absolute left-0 right-0 top-1/2 h-[4px] -translate-y-1/2 bg-slate-900" />
                      <div className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-slate-900 bg-white" />
                    </div>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.2 }}
                    animate={{ opacity: [0, 0.9, 0], scale: [0.2, 1.3, 1.9] }}
                    transition={{ duration: 0.45, delay: 0.72, ease: "easeOut" }}
                    className="absolute right-[20%] top-[26%] h-16 w-16 rounded-full border-4 border-white/90 bg-white/25"
                  />
                </div>
              </div>
            )
          }

          const teamSize = Object.keys(gameState.playerTeam).length
          const teamIsFull = teamSize >= MAX_TEAM_SIZE
          const isLegendaryBoss = gameState.currentBattle
            ? wildPokemon[gameState.currentBattle.enemyName]?.rarity === "lendario"
            : false
          const legendaryCanCapture = gameState.currentBattle
            ? gameState.currentBattle.enemyHP <= Math.floor(gameState.currentBattle.enemyMaxHP / 2)
            : true
          const availableBalls = Object.keys(gameState.inventory).filter(
            (ball) => Boolean(pokeballs[ball]) && (gameState.inventory[ball] || 0) > 0,
          )
          if (teamIsFull) {
            return (
              <div className="text-center space-y-3">
                <div className="text-4xl">🚫</div>
                <p className="text-white font-bold">Equipe cheia</p>
                <p className="text-white/70">Você já tem {MAX_TEAM_SIZE} Pokémon na equipe.</p>
              </div>
            )
          }
          if (availableBalls.length === 0) {
            return (
              <div className="text-center">
                <div className="text-4xl mb-2">😅</div>
                <p className="text-white">Sem Pokébolas!</p>
              </div>
            )
          }
          return (
            <div>
              <h3 className="font-bold text-white mb-4 text-center">🎯 Capturar</h3>
              <p className="text-center text-white/70 text-sm mb-4">Equipe: {teamSize}/{MAX_TEAM_SIZE}</p>
              {isLegendaryBoss && (
                <div className="mb-3 rounded-lg border border-amber-300/50 bg-amber-500/20 px-3 py-2 text-center text-xs text-amber-100">
                  👑 Chefe lendário: só pode capturar com HP em metade ou menos.
                </div>
              )}
              <div className="space-y-2">
                {availableBalls.map((ball) => (
                  (() => {
                    if (!gameState.currentBattle) {
                      return null
                    }

                    const isMasterBall = ball === "Master Ball"
                    const enemyRarity = wildPokemon[gameState.currentBattle.enemyName]?.rarity
                    const statusCondition = gameState.currentBattle?.enemyStatusCondition
                    const maxHP = Math.max(1, gameState.currentBattle?.enemyMaxHP || 1)
                    const currentHP = Math.max(1, gameState.currentBattle?.enemyHP || 1)
                    const rarityForCatch = (isLegendaryBoss ? "lendario" : (enemyRarity || "comum")) as "comum" | "raro" | "lendario"
                    const ballChance = isMasterBall
                      ? 1
                      : getClassicCatchChance(ball, rarityForCatch, currentHP, maxHP, statusCondition)

                    return (
                  <Button
                    key={ball}
                    onClick={() => startCaptureThrow(ball)}
                    className={`w-full h-12 bg-gradient-to-r ${pokeballs[ball]?.color || "from-slate-500 to-slate-600"} text-sm`}
                    disabled={Boolean(captureThrowAnimation) || (isLegendaryBoss && !legendaryCanCapture)}
                  >
                    <div className="flex justify-between items-center w-full">
                      <span>{ball}</span>
                      <div className="text-right text-xs">
                        <div>{Math.floor(ballChance * 100)}%</div>
                        <div>x{gameState.inventory[ball]}</div>
                      </div>
                    </div>
                  </Button>
                    )
                  })()
                ))}
              </div>
            </div>
          )

        case "capture-success":
          if (!captureCelebration) return null

          return (
            <div className="space-y-5 text-center">
              <div className="text-5xl">🎉</div>
              <h3 className="font-bold text-white text-2xl">Parabéns!</h3>
              <p className="text-white/80">
                {captureCelebration.pokemonName} foi capturado com sucesso.
              </p>
              <div className="mx-auto flex w-full max-w-md items-center justify-center rounded-2xl border border-white/20 bg-white/10 p-6">
                <AnimatedSprite sprite={captureCelebration.sprite} size="lg" />
              </div>
              <div className="text-sm text-white/70 uppercase tracking-[0.2em]">
                {captureCelebration.rarity === "lendario" ? "Chefe Lendário" : "Novo Companheiro"}
                {captureCelebration.isShiny ? " • Shiny" : ""}
              </div>
              <Button
                onClick={() => {
                  setCaptureCelebration(null)
                  setShowModal(null)
                  endBattle()
                }}
                className="w-full bg-gradient-to-r from-emerald-500 to-green-600"
              >
                Continuar jornada
              </Button>
            </div>
          )

        case "switch":
          const availablePokemon = Object.keys(gameState.playerTeam).filter(
            (name) => name !== gameState.activePokemon && gameState.playerTeam[name].HP > 0,
          )

          const isForced = gameState.activePokemon && gameState.playerTeam[gameState.activePokemon].HP <= 0

          if (availablePokemon.length === 0) {
            return (
              <div className="text-center">
                <div className="text-4xl mb-2">😔</div>
                <p className="text-white">Nenhum Pokémon disponível!</p>
                {isForced && <p className="text-red-400 mt-2 font-bold">⚠️ Game Over iminente!</p>}
              </div>
            )
          }

          return (
            <div>
              <h3 className="font-bold text-white mb-4 text-center">
                {isForced ? "⚠️ TROCA OBRIGATÓRIA" : "🔄 Trocar"}
              </h3>
              {isForced && (
                <div className="mb-4 p-3 bg-red-500/20 border border-red-400 rounded-lg text-center">
                  <p className="text-red-400 font-bold">Seu Pokémon desmaiou!</p>
                  <p className="text-white text-sm">Escolha outro para continuar</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                {availablePokemon.map((name) => (
                  <div
                    key={name}
                    className="cursor-pointer p-3 bg-white/10 rounded border border-white/20 hover:bg-white/20 transition-all text-center"
                    onClick={() => {
                      updateGameState({ activePokemon: name })
                      if (gameState.currentBattle) {
                        updateBattle({
                          playerSprite: getPokemonSpriteUrl(
                            name,
                            gameState.playerTeam[name].sprite,
                            "back",
                            Boolean(gameState.playerTeam[name].isShiny),
                          ),
                        })
                      }
                      addLog(`🔄 Trocou para ${name}!`)
                      setShowModal(null)

                      if (gameState.currentBattle && !isForced && gameState.currentBattle.enemyHP > 0) {
                        addLog("🕒 A troca consumiu o turno. O adversário ataca!")
                        setPendingEnemyTurnAfterSwitch(true)
                      }
                    }}
                  >
                    <div className="mb-1 flex justify-center">
                      <AnimatedSprite
                        sprite={
                          gameState.playerTeam[name].spriteSet?.front ||
                          getPokemonSpriteSet(name, gameState.playerTeam[name].sprite, Boolean(gameState.playerTeam[name].isShiny)).front
                        }
                        size="sm"
                      />
                    </div>
                    <div className="text-white font-semibold text-sm">{name}{gameState.playerTeam[name].isShiny ? " ✨" : ""}</div>
                    <div className="text-white/70 text-xs">{normalizeTypeText(gameState.playerTeam[name].type)}</div>
                    <div className="text-xs mt-1">
                      <div className="text-green-400">
                        ❤️ {gameState.playerTeam[name].HP}/{gameState.playerTeam[name].maxHP}
                      </div>
                      <div className="text-blue-400">⭐ Nv.{gameState.playerTeam[name].level}</div>
                    </div>
                  </div>
                ))}
              </div>
              {isForced && (
                <div className="mt-4 text-center">
                  <p className="text-yellow-400 text-sm">⚠️ Troca obrigatória - não é possível fechar</p>
                </div>
              )}
            </div>
          )

        case "team":
          return (
            <div>
              <h3 className="font-bold text-white mb-2 text-center">👥 Equipe</h3>
              <p className="text-center text-white/70 text-sm mb-4">{Object.keys(gameState.playerTeam).length}/{MAX_TEAM_SIZE} Pokémon</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
                {Object.entries(gameState.playerTeam).map(([name, pokemon]) => (
                  <div
                    key={name}
                    className={`cursor-pointer p-3 rounded border transition-all text-center ${
                      name === gameState.activePokemon
                        ? "bg-yellow-500/20 border-yellow-400"
                        : "bg-white/10 border-white/20 hover:bg-white/20"
                    }`}
                    onClick={() => {
                      if (pokemon.HP > 0) {
                        updateGameState({ activePokemon: name })
                        if (gameState.currentBattle) {
                          updateBattle({ playerSprite: getPokemonSpriteUrl(name, pokemon.sprite, "back", Boolean(pokemon.isShiny)) })
                        }
                        addLog(`✨ ${name} ativo!`)
                        setShowModal(null)
                      }
                    }}
                  >
                    <div className="mb-1 flex justify-center">
                      <AnimatedSprite
                        sprite={pokemon.spriteSet?.front || getPokemonSpriteSet(name, pokemon.sprite, Boolean(pokemon.isShiny)).front}
                        size="sm"
                      />
                    </div>
                    <div className="text-white font-semibold text-sm">{name}{pokemon.isShiny ? " ✨" : ""}</div>
                    <div className="text-white/70 text-xs">{normalizeTypeText(pokemon.type)}</div>
                    <div className="text-xs mt-1">
                      <div className="text-green-400">
                        ❤️ {pokemon.HP}/{pokemon.maxHP}
                      </div>
                      <div className="text-blue-400">⭐ Nv.{pokemon.level}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )

        case "heal":
          const injuredPokemon = Object.keys(gameState.playerTeam).filter(
            (name) => gameState.playerTeam[name].HP < gameState.playerTeam[name].maxHP,
          )
          if (injuredPokemon.length === 0) {
            return (
              <div className="text-center">
                <div className="text-4xl mb-2">😊</div>
                <p className="text-white">Todos saudáveis!</p>
              </div>
            )
          }
          return (
            <div>
              <h3 className="font-bold text-white mb-4 text-center">❤️ Centro de Cura</h3>
              <p className="text-center text-yellow-400 mb-4">💰 15 moedas por cura</p>
              <div className="grid grid-cols-2 gap-3">
                {injuredPokemon.map((name) => (
                  <div
                    key={name}
                    className="cursor-pointer p-3 bg-white/10 rounded border border-white/20 hover:bg-white/20 transition-all text-center"
                    onClick={() => {
                      if (gameState.money >= 15) {
                        updateGameState({ money: gameState.money - 15 })
                        updatePokemon(name, { HP: gameState.playerTeam[name].maxHP })
                        addLog(`❤️ ${name} curado!`)
                        setShowModal(null)
                      } else {
                        addLog("💸 Sem dinheiro!")
                      }
                    }}
                  >
                    <div className="mb-1 flex justify-center">
                      <AnimatedSprite
                        sprite={
                          gameState.playerTeam[name].spriteSet?.front ||
                          getPokemonSpriteSet(name, gameState.playerTeam[name].sprite, Boolean(gameState.playerTeam[name].isShiny)).front
                        }
                        size="sm"
                      />
                    </div>
                    <div className="text-white font-semibold text-sm">{name}</div>
                    <div className="text-red-400 text-xs">
                      ❤️ {gameState.playerTeam[name].HP}/{gameState.playerTeam[name].maxHP}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )

        case "inventory":
          const pokeballEntries = Object.entries(gameState.inventory).filter(
            ([item, count]) => Boolean(pokeballs[item]) && Number(count) > 0,
          )
          const itemEntries = Object.entries(gameState.inventory).filter(
            ([item, count]) => !pokeballs[item] && Number(count) > 0,
          )
          const hasPokeballs = pokeballEntries.length > 0
          const hasItems = itemEntries.length > 0
          const resolvedTab =
            inventoryTab === "pokeballs"
              ? hasPokeballs
                ? "pokeballs"
                : "items"
              : hasItems
                ? "items"
                : "pokeballs"
          const activeEntries = resolvedTab === "pokeballs" ? pokeballEntries : itemEntries

          return (
            <div className="space-y-3">
              <h3 className="text-white font-bold text-xl mb-4">Inventário:</h3>
              {(hasPokeballs || hasItems) && (
                <div className={`grid gap-2 ${hasPokeballs && hasItems ? "grid-cols-2" : "grid-cols-1"}`}>
                  {hasPokeballs && (
                    <Button
                      onClick={() => setInventoryTab("pokeballs")}
                      className={`h-10 text-sm ${resolvedTab === "pokeballs" ? "bg-blue-600 hover:bg-blue-500" : "bg-slate-700/80 hover:bg-slate-600/80"}`}
                    >
                      Pokébolas
                    </Button>
                  )}
                  {hasItems && (
                    <Button
                      onClick={() => setInventoryTab("items")}
                      className={`h-10 text-sm ${resolvedTab === "items" ? "bg-blue-600 hover:bg-blue-500" : "bg-slate-700/80 hover:bg-slate-600/80"}`}
                    >
                      Itens
                    </Button>
                  )}
                </div>
              )}

              <div className="space-y-2 pt-2">
                {activeEntries.length === 0 ? (
                  <div className="rounded-lg bg-white/10 p-3 text-sm text-white/70">
                    {hasPokeballs || hasItems ? "Sem itens no momento." : "Inventário vazio no momento."}
                  </div>
                ) : (
                  activeEntries.map(([item, count]) => (
                    <div key={item} className="flex justify-between items-center p-3 bg-white/10 rounded-lg">
                      <span className="text-white">{item}</span>
                      <div className="flex items-center gap-3">
                        <Badge className="bg-blue-500">{count}x</Badge>
                        {resolvedTab === "items" && item === "Elixir" && Number(count) > 0 && (
                          <Button
                            onClick={useElixir}
                            className="bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700"
                            size="sm"
                          >
                            Usar
                          </Button>
                        )}
                        {resolvedTab === "items" && item === "Cura Total" && Number(count) > 0 && (
                          <Button
                            onClick={useFullHeal}
                            className="bg-gradient-to-r from-cyan-500 to-sky-600 hover:from-cyan-600 hover:to-sky-700"
                            size="sm"
                          >
                            Usar
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )

        case "type-chart":
          return (
            <div className="space-y-4">
              <div className="text-center">
                <h3 className="text-white font-bold text-xl">Tabela de Super Eficazes</h3>
                <p className="mt-1 text-sm text-white/70">Consulta rápida com super eficazes, resistências e imunidades.</p>
              </div>
              <div className="grid max-h-[60vh] grid-cols-1 gap-3 overflow-y-auto pr-1 md:grid-cols-2">
                {Object.entries(typeChart)
                  .sort(([typeA], [typeB]) => normalizeTypeText(typeA).localeCompare(normalizeTypeText(typeB)))
                  .map(([attackType, matchups]) => {
                    const normalizedType = normalizeTypeText(attackType)
                    const gradient = typeColors[normalizedType] || "from-gray-500 to-gray-600"
                    const superEffective = Object.entries(matchups)
                      .filter(([, multiplier]) => multiplier > 1)
                      .map(([defenderType]) => normalizeTypeText(defenderType))
                    const resisted = Object.entries(matchups)
                      .filter(([, multiplier]) => multiplier > 0 && multiplier < 1)
                      .map(([defenderType]) => normalizeTypeText(defenderType))
                    const immune = Object.entries(matchups)
                      .filter(([, multiplier]) => multiplier === 0)
                      .map(([defenderType]) => normalizeTypeText(defenderType))

                    return (
                      <div key={attackType} className="rounded-2xl border border-white/20 bg-white/10 p-3">
                        <div className="mb-2 flex items-center gap-2">
                          <Badge className={`bg-gradient-to-r ${gradient} border-0 px-3 py-1 text-white`}>
                            {normalizedType}
                          </Badge>
                          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">vantagens</span>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <div className="mb-1 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-300">2x</div>
                            <div className="flex flex-wrap gap-2">
                              {superEffective.length > 0 ? (
                                superEffective.map((defenderType) => (
                                  <span
                                    key={`${attackType}-2x-${defenderType}`}
                                    className="rounded-full border border-emerald-300/30 bg-emerald-500/20 px-2 py-1 text-xs font-semibold text-white"
                                  >
                                    {defenderType}
                                  </span>
                                ))
                              ) : (
                                <span className="text-xs text-white/45">Nenhum</span>
                              )}
                            </div>
                          </div>
                          <div>
                            <div className="mb-1 text-[11px] font-black uppercase tracking-[0.18em] text-amber-300">0.5x</div>
                            <div className="flex flex-wrap gap-2">
                              {resisted.length > 0 ? (
                                resisted.map((defenderType) => (
                                  <span
                                    key={`${attackType}-05x-${defenderType}`}
                                    className="rounded-full border border-amber-300/30 bg-amber-500/20 px-2 py-1 text-xs font-semibold text-white"
                                  >
                                    {defenderType}
                                  </span>
                                ))
                              ) : (
                                <span className="text-xs text-white/45">Nenhum</span>
                              )}
                            </div>
                          </div>
                          <div>
                            <div className="mb-1 text-[11px] font-black uppercase tracking-[0.18em] text-rose-300">0x</div>
                            <div className="flex flex-wrap gap-2">
                              {immune.length > 0 ? (
                                immune.map((defenderType) => (
                                  <span
                                    key={`${attackType}-0x-${defenderType}`}
                                    className="rounded-full border border-rose-300/30 bg-rose-500/20 px-2 py-1 text-xs font-semibold text-white"
                                  >
                                    {defenderType}
                                  </span>
                                ))
                              ) : (
                                <span className="text-xs text-white/45">Nenhum</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          )

        case "move-vendor":
          if (!moveVendorOffer) return null

          const vendorPokemon = gameState.playerTeam[moveVendorOffer.pokemonName]
          if (!vendorPokemon) {
            return (
              <div className="text-center">
                <p className="text-white">Oferta indisponível.</p>
              </div>
            )
          }

          return (
            <div className="space-y-4">
              <div className="text-center">
                <h3 className="font-bold text-white text-xl">🧑‍🏫 Vendedor de Técnicas</h3>
                <p className="mt-1 text-sm text-yellow-200">Aparece raramente e vende um golpe para troca.</p>
              </div>

              <div className="rounded-xl border border-amber-300/40 bg-amber-500/15 p-4 text-white">
                <div className="text-sm text-white/80">Pokémon alvo</div>
                <div className="text-lg font-black">{moveVendorOffer.pokemonName}</div>
                <div className="mt-1 text-sm">
                  Golpe oferecido: <span className="font-bold">{normalizeDisplayText(moveVendorOffer.moveName)}</span>
                </div>
                <div className="text-sm">Poder: {moveVendorOffer.power[0]}-{moveVendorOffer.power[1]}</div>
                <div className="text-sm">Nível mínimo: {moveVendorOffer.requiredLevel}</div>
                <div className="mt-2 text-base font-black text-amber-200">💰 Preço: {moveVendorOffer.price} moedas</div>
              </div>

              {Object.keys(vendorPokemon.attacks).length >= 4 ? (
                <div>
                  <p className="mb-2 text-sm text-white/80">Escolhe qual ataque será trocado:</p>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {Object.entries(vendorPokemon.attacks).map(([attackName, [minPower, maxPower]]) => {
                      const isSelected = moveVendorReplaceAttack === attackName

                      return (
                        <Button
                          key={attackName}
                          onClick={() => setMoveVendorReplaceAttack(attackName)}
                          className={`h-14 text-sm ${
                            isSelected
                              ? "bg-gradient-to-r from-emerald-500 to-green-600"
                              : "bg-gradient-to-r from-slate-500 to-slate-600"
                          }`}
                        >
                          <div>
                            <div className="font-bold">{isSelected ? "✓ " : ""}{normalizeDisplayText(attackName)}</div>
                            <div className="text-xs opacity-80">{minPower}-{maxPower} dano</div>
                          </div>
                        </Button>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-300/40 bg-emerald-500/15 p-3 text-sm text-emerald-100">
                  ✅ {moveVendorOffer.pokemonName} tem espaço livre ({Object.keys(vendorPokemon.attacks).length}/4). O golpe será aprendido sem substituir outro.
                </div>
              )}

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button
                  onClick={handleMoveVendorPurchase}
                  disabled={
                    (Object.keys(vendorPokemon.attacks).length >= 4 && !moveVendorReplaceAttack) ||
                    gameState.money < moveVendorOffer.price
                  }
                  className="bg-gradient-to-r from-amber-500 to-orange-600"
                >
                  {Object.keys(vendorPokemon.attacks).length >= 4 ? "Comprar e trocar" : "Comprar e aprender"}
                </Button>
                <Button
                  onClick={() => {
                    addLog("🫡 Negócio recusado. O vendedor foi embora.")
                    setMoveVendorOffer(null)
                    setMoveVendorReplaceAttack(null)
                    setShowModal(null)
                  }}
                  className="bg-gradient-to-r from-slate-500 to-slate-600"
                >
                  Recusar
                </Button>
              </div>
            </div>
          )

        case "evolution-attacks":
          if (!gameState.activePokemon) return null
          const pokemonForEvolution = gameState.playerTeam[gameState.activePokemon]
          const pendingMove = pokemonForEvolution.pendingMove

          if (!pendingMove) return null

          return (
            <div className="space-y-4">
              <h3 className="font-bold text-white text-center text-xl">🌟 Novo Ataque Disponível</h3>
              {recentEvolution && (
                <div className="rounded-xl border border-yellow-300 bg-yellow-500/20 p-3 text-center text-sm font-semibold text-yellow-100">
                  {recentEvolution.from} evoluiu para {recentEvolution.to}!
                </div>
              )}
              <div
                className="cursor-pointer rounded-xl border-2 border-cyan-300 bg-cyan-500/20 p-4 text-center text-white transition-all hover:bg-cyan-500/30"
                onClick={() => {
                  updatePokemon(gameState.activePokemon!, { pendingMove: undefined })
                  setAttackToReplace(null)
                  closeModal()
                }}
              >
                <div className="text-xs uppercase tracking-[0.2em] text-cyan-200">Clique para manter os ataques atuais</div>
                <div className="mt-1 text-lg font-black">{normalizeDisplayText(pendingMove.name)}</div>
                <div className="text-sm text-cyan-100">
                  {pendingMove.power[0]}-{pendingMove.power[1]} dano
                </div>
              </div>

              <div>
                <p className="mb-3 text-center text-sm text-white/80">Escolhe qual ataque queres substituir.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Object.entries(pokemonForEvolution.attacks).map(([attack, [min, max]]) => {
                    const isSelected = attackToReplace === attack
                    return (
                      <Button
                        key={attack}
                        onClick={() => setAttackToReplace(attack)}
                        className={`h-14 text-sm ${
                          isSelected
                            ? "bg-gradient-to-r from-green-500 to-emerald-500"
                            : "bg-gradient-to-r from-gray-500 to-gray-600"
                        }`}
                      >
                        <div>
                          <div className="font-bold">{isSelected ? "✓ " : ""}{normalizeDisplayText(attack)}</div>
                          <div className="text-xs opacity-80">{min}-{max} dano</div>
                        </div>
                      </Button>
                    )
                  })}
                </div>
              </div>

              <Button
                onClick={() => {
                  if (!attackToReplace) return

                  const nextAttacks = Object.fromEntries(
                    Object.entries(pokemonForEvolution.attacks).map(([attack, power]) =>
                      attack === attackToReplace ? [pendingMove.name, pendingMove.power] : [attack, power],
                    ),
                  )

                  updatePokemon(gameState.activePokemon!, {
                    attacks: nextAttacks,
                    attackPP: syncAttackPP(pokemonForEvolution.attackPP, nextAttacks),
                    pendingMove: undefined,
                  })
                  closeModal()
                }}
                disabled={!attackToReplace}
                className="w-full bg-gradient-to-r from-blue-500 to-blue-600"
              >
                Substituir {attackToReplace ? normalizeDisplayText(attackToReplace) : "um ataque"}
              </Button>
            </div>
          )

        case "evolution":
          if (!recentEvolution) return null

          return (
            <div className="space-y-4 text-center">
              <div className="text-5xl">✨</div>
              <h3 className="font-bold text-white text-2xl">Evolução!</h3>
              <p className="text-white/80">{recentEvolution.from} evoluiu para {recentEvolution.to}.</p>
              <div className="mx-auto flex w-full max-w-md items-center justify-center gap-4 rounded-2xl border border-white/15 bg-white/10 p-4">
                <div className="text-center">
                  <AnimatedSprite
                    sprite={getPokemonSpriteUrl(
                      recentEvolution.from,
                      undefined,
                      "front",
                      Boolean(gameState.playerTeam[recentEvolution.to]?.isShiny),
                    )}
                    size="sm"
                  />
                  <div className="mt-2 text-sm font-semibold text-white/80">{recentEvolution.from}</div>
                </div>
                <div className="text-2xl text-yellow-300">→</div>
                <div className="text-center">
                  <AnimatedSprite
                    sprite={
                      gameState.playerTeam[recentEvolution.to]?.spriteSet?.front ||
                      getPokemonSpriteSet(
                        recentEvolution.to,
                        gameState.playerTeam[recentEvolution.to]?.sprite || "",
                        Boolean(gameState.playerTeam[recentEvolution.to]?.isShiny),
                      ).front
                    }
                    size="sm"
                  />
                  <div className="mt-2 text-sm font-semibold text-white">{recentEvolution.to}</div>
                </div>
              </div>
            </div>
          )

        case "destination":
          return (
            <div className="space-y-5 text-center">
              <div className="text-5xl">🧭</div>
              <h3 className="font-bold text-white text-2xl">Escolhe o próximo destino</h3>
              <p className="text-white/80">Após 10 ondas, escolhe para onde a jornada continua.</p>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {destinationChoices.map((destination) => (
                  <Button
                    key={destination}
                    onClick={() => chooseDestination(destination)}
                    className="h-14 bg-gradient-to-r from-slate-700 to-slate-800 text-sm"
                  >
                    {destination === "caverna" && "⛰️ "}
                    {destination === "floresta" && "🌲 "}
                    {destination === "vulcanico" && "🌋 "}
                    {destination === "costeiro" && "🌊 "}
                    {destination === "alturas" && "🕊️ "}
                    {destination === "planicie" && "🌾 "}
                    Seguir para {environmentLabels[destination]}
                  </Button>
                ))}
              </div>
            </div>
          )

        default:
          return null
      }
    }

    return (
      <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${isAttackModal ? "bg-black/35 backdrop-blur-[1px]" : "bg-black/70 backdrop-blur-sm"}`}>
        <div className={`w-full max-w-6xl max-h-[90vh] overflow-y-auto border-4 border-slate-800 p-6 shadow-[10px_10px_0_rgba(15,23,42,0.9)] ${isAttackModal ? "bg-[linear-gradient(180deg,rgba(15,39,66,0.82)_0%,rgba(15,39,66,0.82)_14%,rgba(25,57,91,0.82)_14%,rgba(25,57,91,0.82)_100%),repeating-linear-gradient(0deg,rgba(255,255,255,0.05)_0_2px,transparent_2px_8px)]" : "bg-[linear-gradient(180deg,#0f2742_0%,#0f2742_14%,#19395b_14%,#19395b_100%),repeating-linear-gradient(0deg,rgba(255,255,255,0.05)_0_2px,transparent_2px_8px)]"}`}>
          {modalContent()}
          <div className="mt-4 text-center">
            {!(
                showModal === "switch" &&
                gameState.activePokemon &&
                gameState.playerTeam[gameState.activePokemon].HP <= 0
              ) && showModal !== "move-vendor" && showModal !== "capture-success" && showModal !== "destination" && (
                <Button onClick={closeModal} className="pixel-menu-button bg-[linear-gradient(180deg,#6b7280_0%,#6b7280_50%,#4b5563_50%,#4b5563_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)] text-[10px] leading-relaxed sm:text-xs">
                  ❌ Fechar
                </Button>
              )}
          </div>
        </div>
      </div>
    )
  }

  const initializeAttackPP = useCallback(() => {
    if (!gameState.activePokemon) return

    const pokemon = gameState.playerTeam[gameState.activePokemon]
    if (!pokemon.attackPP || Object.keys(pokemon.attackPP).length === 0) {
      const newPP = initializePP(pokemon.attacks)
      updatePokemon(gameState.activePokemon, { attackPP: newPP })
    }
  }, [gameState.activePokemon, gameState.playerTeam, updatePokemon])

  const initializePPForAllPokemon = useCallback(() => {
    Object.keys(gameState.playerTeam).forEach((pokemonName) => {
      const pokemon = gameState.playerTeam[pokemonName]
      if (!pokemon.attackPP || Object.keys(pokemon.attackPP).length === 0) {
        const newPP = initializePP(pokemon.attacks)
        updatePokemon(pokemonName, { attackPP: newPP })
      }
    })
  }, [gameState.playerTeam, updatePokemon])

  useEffect(() => {
    initializePPForAllPokemon()
  }, [initializePPForAllPokemon])

  if (isLoading || isAuthChecking) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-4">
        <div className="pixel-surface bg-[#f8f4dc] px-10 py-8 text-center space-y-4">
          <div className="text-6xl animate-bounce">⚡</div>
          <h2 className="font-pixel text-sm leading-relaxed text-slate-900 sm:text-lg">Carregando Jogo...</h2>
        </div>
      </div>
    )
  }

  return (
    <div className={`min-h-dvh text-slate-900 ${currentScreen === "main-menu" ? "h-dvh overflow-hidden p-2 md:p-2" : "p-3 md:p-4"}`}>
      
      <AnimatePresence>
        {captureThrowAnimation && (
          <motion.div
            key={`capture-throw-overlay-${captureThrowAnimation.throwId}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-none fixed inset-0 z-[120] bg-black/70"
          >
            <div className="relative h-full w-full overflow-hidden">
              <motion.div
                key={`capture-throw-label-${captureThrowAnimation.throwId}`}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
                className="absolute left-1/2 top-14 -translate-x-1/2 rounded-xl border-4 border-slate-800 bg-[#f8f4dc] px-4 py-2 font-pixel text-[11px] text-slate-900 shadow-[8px_8px_0_rgba(15,23,42,0.7)]"
              >
                Lançaste {captureThrowAnimation.ballType}!
              </motion.div>

                <motion.div
                  key={`capture-throw-ball-${captureThrowAnimation.throwId}`}
                  initial={{ x: "-18vw", y: "30vh", rotate: 0, scale: 0.9 }}
                  animate={{
                    x: ["-18vw", "0vw", "24vw"],
                    y: ["30vh", "8vh", "2vh"],
                    rotate: [0, 280, 680],
                    scale: [0.9, 1.05, 0.92],
                  }}
                  transition={{ duration: 0.82, ease: "easeInOut" }}
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                >
                <div className="relative h-14 w-14">
                  <div
                    className={`absolute inset-0 rounded-full border-4 border-slate-900 bg-gradient-to-r ${pokeballs[captureThrowAnimation.ballType]?.color || "from-rose-500 to-red-600"}`}
                  />
                  <div className="absolute left-[2px] right-[2px] top-1/2 h-[22px] -translate-y-[2px] rounded-b-full bg-white" />
                  <div className="absolute left-0 right-0 top-1/2 h-[4px] -translate-y-1/2 bg-slate-900" />
                  <div className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-slate-900 bg-white" />
                </div>
              </motion.div>

              <motion.div
                key={`capture-throw-impact-${captureThrowAnimation.throwId}`}
                initial={{ opacity: 0, scale: 0.2 }}
                animate={{ opacity: [0, 0.85, 0], scale: [0.2, 1.25, 1.9] }}
                transition={{ duration: 0.42, delay: 0.66, ease: "easeOut" }}
                className="absolute right-[17vw] top-[34vh] h-16 w-16 rounded-full border-4 border-white/90 bg-white/30"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {defeatAnimationVisible && (
        <div className="pointer-events-none fixed inset-0 z-[85] bg-black/95 animate-pulse">
          <div className="flex h-full items-end justify-center pb-8 sm:items-center sm:pb-0">
            <div className="w-[min(92vw,42rem)] border-4 border-slate-900 bg-[#f8f4dc] p-4 shadow-[8px_8px_0_rgba(0,0,0,0.85)]">
              <p className="font-pixel text-xs leading-relaxed text-slate-900 sm:text-sm">...</p>
              <p className="mt-2 font-pixel text-xs leading-relaxed text-slate-900 sm:text-sm">Tu desmaiaste! Toda a tua equipa caiu.</p>
              <p className="mt-2 font-pixel text-xs leading-relaxed text-slate-700 sm:text-sm">Voltando ao menu principal...</p>
            </div>
          </div>
        </div>
      )}
      {screenNotice && !defeatAnimationVisible && (
        <div className="pointer-events-none fixed left-1/2 top-4 z-[70] w-[min(92vw,50rem)] -translate-x-1/2">
          <div className="rounded-2xl border-4 border-slate-800 bg-[linear-gradient(180deg,#fef3c7_0%,#fde68a_45%,#f59e0b_45%,#f59e0b_100%)] px-4 py-3 text-center text-sm font-black text-slate-900 shadow-[8px_8px_0_rgba(15,23,42,0.85)] sm:text-base">
            {screenNotice}
          </div>
        </div>
      )}
      <div className="max-w-5xl mx-auto">
        <div
          className={`transition-all duration-500 ${isAnimating ? "opacity-50" : "opacity-100"} ${
            currentScreen === "battle" ? "h-[calc(100dvh-1.5rem)] overflow-hidden" : currentScreen === "main-menu" ? "h-full overflow-hidden" : ""
          }`}
        >
          {currentScreen === "main-menu" && renderMainMenu()}
          {currentScreen === "solo-menu" && renderSoloModeScreen()}
          {currentScreen === "leaderboards" && renderLeaderboardsScreen()}
          {currentScreen === "select-slot" && renderSelectSlotScreen()}
          {currentScreen === "select-continue" && renderSelectContinueScreen()}
          {currentScreen === "multiplayer" && renderMultiplayerHubScreen()}
          {currentScreen === "menu" && renderGameMenu()}
          {currentScreen === "battle" && renderBattleScreen()}
          {currentScreen === "shop" && renderShop()}
          {currentScreen === "game" && renderGameMenu()} {/* Added route for 'game' */}
        </div>

        {showModal && renderModal()}
      </div>
    </div>
  )
}
