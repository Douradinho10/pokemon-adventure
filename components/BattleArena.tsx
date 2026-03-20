"use client"

import { memo } from "react"
import type { Pokemon, Battle } from "../hooks/useGameState"
import { GlassCard } from "./GlassCard"
import { AnimatedSprite } from "./AnimatedSprite"
import { AnimatedProgress } from "./AnimatedProgress"
import { Badge } from "@/components/ui/badge"
import { wildPokemon, typeColors, POKEMON_RARITY_CONFIG } from "../data/pokemonData"
import { getPokemonSpriteSet, normalizeDisplayText, normalizeTypeText } from "../lib/utils"
import { Swords, Target } from "lucide-react"
import { motion } from "framer-motion"

interface AttackAnimationState {
  attacker: "player" | "enemy"
  target: "player" | "enemy"
  moveName: string
  attackType: string
}

interface BattleArenaProps {
  playerPokemon: Pokemon
  playerName: string
  battle: Battle
  environment?: "planicie" | "vulcanico" | "costeiro" | "floresta" | "caverna" | "alturas"
  className?: string
  attackAnimation?: AttackAnimationState | null
}

const statusBadgeStyles = {
  poisoned: "bg-violet-600",
  burned: "bg-orange-600",
  paralyzed: "bg-amber-500",
  asleep: "bg-slate-600",
  frozen: "bg-cyan-500",
  confused: "bg-fuchsia-600",
} as const

const statusLabels = {
  poisoned: "ENV",
  burned: "QUE",
  paralyzed: "PAR",
  asleep: "SONO",
  frozen: "GEL",
  confused: "CONF",
} as const

const getClassicTotalXpForLevel = (level: number) => {
  const safeLevel = Math.max(1, level)
  return Math.floor((4 * Math.pow(safeLevel, 3)) / 5)
}

const getXpNeededForNextLevel = (level: number) => {
  const safeLevel = Math.max(1, level)
  const currentTotal = getClassicTotalXpForLevel(safeLevel)
  const nextTotal = getClassicTotalXpForLevel(safeLevel + 1)
  return Math.min(400, Math.max(50, nextTotal - currentTotal))
}

export const BattleArena = memo(
  ({ playerPokemon, playerName, battle, environment = "planicie", className = "", attackAnimation = null }: BattleArenaProps) => {
  const visibleEnemyName = battle.enemyDisplayName || battle.enemyName
  const enemyData = wildPokemon[visibleEnemyName] || wildPokemon[battle.enemyName]
  const normalizedPlayerType = normalizeTypeText(playerPokemon.type)
  const normalizedEnemyType = normalizeTypeText(battle.enemyDisplayType || enemyData.type || battle.enemyType)
  const playerTypeGradient = normalizedPlayerType
    ? typeColors[normalizedPlayerType.split("/")[0]]
    : "from-gray-400 to-gray-500"
  const enemyTypeGradient = normalizedEnemyType ? typeColors[normalizedEnemyType.split("/")[0]] : "from-gray-400 to-gray-500"
  const playerBattleSprite = playerPokemon.isShiny
    ? getPokemonSpriteSet(playerName, playerPokemon.sprite, true).back
    : playerPokemon.spriteSet?.back || getPokemonSpriteSet(playerName, playerPokemon.sprite, false).back
  const enemyBattleSprite = battle.enemyIsShiny
    ? getPokemonSpriteSet(visibleEnemyName, enemyData.sprite, true).front
    : enemyData.spriteSet?.front || getPokemonSpriteSet(visibleEnemyName, enemyData.sprite, false).front

  const rarity = POKEMON_RARITY_CONFIG[enemyData.rarity]
  const animationType = attackAnimation ? normalizeTypeText(attackAnimation.attackType).split("/")[0] : "Normal"
  const attackGradient = typeColors[animationType] || "from-slate-400 to-slate-600"
  const playerIsAttacking = attackAnimation?.attacker === "player"
  const enemyIsAttacking = attackAnimation?.attacker === "enemy"
  const playerIsTarget = attackAnimation?.target === "player"
  const enemyIsTarget = attackAnimation?.target === "enemy"
  const playerXpNeeded = getXpNeededForNextLevel(playerPokemon.level)
  const environmentStyles = {
    planicie: {
      sky: "bg-[linear-gradient(180deg,#9cb4c7_0%,#9cb4c7_28%,#c3d0d8_28%,#c3d0d8_56%,#e2e8ec_56%,#e2e8ec_100%)]",
      ground: "bg-[linear-gradient(180deg,#9aa77e_0%,#9aa77e_20%,#85916d_20%,#85916d_40%,#707b5f_40%,#707b5f_60%,#5c654f_60%,#5c654f_100%)]",
      horizon: "bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.38)_0_16px,rgba(255,255,255,0.18)_16px_32px)]",
    },
    vulcanico: {
      sky: "bg-[linear-gradient(180deg,#5e4a41_0%,#5e4a41_30%,#7f5e4f_30%,#7f5e4f_60%,#b06c4f_60%,#b06c4f_100%)]",
      ground: "bg-[linear-gradient(180deg,#5b342c_0%,#5b342c_28%,#7a4637_28%,#7a4637_54%,#a24e34_54%,#a24e34_76%,#d4672f_76%,#d4672f_100%)]",
      horizon: "bg-[repeating-linear-gradient(90deg,rgba(255,167,38,0.34)_0_12px,rgba(255,95,31,0.18)_12px_26px)]",
    },
    costeiro: {
      sky: "bg-[linear-gradient(180deg,#7fc9e9_0%,#7fc9e9_34%,#9fdcf3_34%,#9fdcf3_62%,#d5f2ff_62%,#d5f2ff_100%)]",
      ground: "bg-[linear-gradient(180deg,#7ca8b8_0%,#7ca8b8_24%,#6b97a7_24%,#6b97a7_48%,#d6c08a_48%,#d6c08a_74%,#c8a96e_74%,#c8a96e_100%)]",
      horizon: "bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.42)_0_14px,rgba(189,234,255,0.22)_14px_30px)]",
    },
    floresta: {
      sky: "bg-[linear-gradient(180deg,#6fa36e_0%,#6fa36e_28%,#88b983_28%,#88b983_54%,#c3ddad_54%,#c3ddad_100%)]",
      ground: "bg-[linear-gradient(180deg,#6e7f45_0%,#6e7f45_22%,#5f703a_22%,#5f703a_46%,#536533_46%,#536533_70%,#46582c_70%,#46582c_100%)]",
      horizon: "bg-[repeating-linear-gradient(90deg,rgba(221,255,212,0.38)_0_10px,rgba(178,231,165,0.16)_10px_24px)]",
    },
    caverna: {
      sky: "bg-[linear-gradient(180deg,#5e6675_0%,#5e6675_30%,#727b8a_30%,#727b8a_58%,#8d97a5_58%,#8d97a5_100%)]",
      ground: "bg-[linear-gradient(180deg,#575966_0%,#575966_24%,#4e505d_24%,#4e505d_48%,#444752_48%,#444752_72%,#393d47_72%,#393d47_100%)]",
      horizon: "bg-[repeating-linear-gradient(90deg,rgba(215,220,233,0.3)_0_11px,rgba(160,168,190,0.14)_11px_24px)]",
    },
    alturas: {
      sky: "bg-[linear-gradient(180deg,#a4c9f4_0%,#a4c9f4_28%,#c6def7_28%,#c6def7_58%,#e6f1ff_58%,#e6f1ff_100%)]",
      ground: "bg-[linear-gradient(180deg,#8993a3_0%,#8993a3_24%,#798493_24%,#798493_48%,#687382_48%,#687382_72%,#56606f_72%,#56606f_100%)]",
      horizon: "bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.36)_0_13px,rgba(206,223,250,0.18)_13px_28px)]",
    },
  } as const
  const battlefieldPalette = environmentStyles[environment]

  return (
    <GlassCard className={`relative overflow-hidden border-slate-800 bg-[#f8f4dc] p-2.5 sm:p-3 min-h-[clamp(340px,58dvh,560px)] shadow-[0_18px_60px_rgba(22,51,77,0.25)] ${className}`}>
      {attackAnimation && (
        <motion.div
          key={`attack-banner-${attackAnimation.attacker}-${attackAnimation.moveName}`}
          initial={{ opacity: 0, y: -14, scale: 0.96 }}
          animate={{ opacity: [0, 1, 1, 0], y: [-14, 0, 0, -8], scale: [0.96, 1.03, 1, 0.98] }}
          transition={{ duration: 0.95, ease: "easeOut" }}
          className="battle-attack-banner pointer-events-none absolute left-1/2 top-3 z-40 -translate-x-1/2 rounded-full border-4 border-slate-800 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.22em] text-slate-900 shadow-[0_10px_24px_rgba(22,51,77,0.28)]"
        >
          {attackAnimation.attacker === "player" ? playerName : visibleEnemyName} usou {normalizeDisplayText(attackAnimation.moveName)}
        </motion.div>
      )}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className={`absolute inset-x-0 top-0 h-[56%] ${battlefieldPalette.sky}`} />
        <div className={`absolute inset-x-0 bottom-0 h-[44%] ${battlefieldPalette.ground}`} />
        <div className={`absolute inset-x-0 top-[54%] h-10 ${battlefieldPalette.horizon}`} />
        <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent_0_7px,rgba(15,23,42,0.05)_7px_8px),repeating-linear-gradient(90deg,transparent_0_7px,rgba(15,23,42,0.05)_7px_8px)] opacity-60" />
        <motion.div
          animate={{ x: [0, 18, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-10 left-12 h-6 w-20 bg-white/80 [clip-path:polygon(0_33%,12%_0,75%_0,100%_33%,88%_100%,25%_100%)]"
        />
        <motion.div
          animate={{ x: [0, -16, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-16 right-20 h-8 w-24 bg-white/70 [clip-path:polygon(0_38%,16%_0,76%_0,100%_38%,84%_100%,20%_100%)]"
        />
      </div>

      <motion.div
        animate={{ x: attackAnimation ? [0, -6, 6, -4, 4, 0] : 0 }}
        transition={{ duration: attackAnimation ? 0.32 : 0.2, ease: "easeInOut" }}
        className={`relative z-10 grid h-full gap-1 ${attackAnimation ? "battle-arena-shake" : ""}`}
      >
        <div className="relative z-30 grid gap-2 md:grid-cols-2">
          <div className="relative z-30 rounded-none border-4 border-slate-800 bg-white p-2.5 shadow-[6px_6px_0_rgba(22,51,77,0.2)]">
            <div className="flex justify-between items-center mb-2">
              <span className="font-black text-slate-800 text-base truncate uppercase tracking-wide">{playerName}{playerPokemon.isShiny ? " ✨" : ""}</span>
              <span className="text-amber-500 font-black text-sm ml-2">Nv.{playerPokemon.level}</span>
            </div>
            <div className="mb-2 text-[11px] font-bold text-slate-500 uppercase tracking-[0.2em]">{normalizedPlayerType}</div>
            {playerPokemon.statusCondition && (
              <Badge className={`${statusBadgeStyles[playerPokemon.statusCondition]} mb-2 border-0 text-white`}>
                {statusLabels[playerPokemon.statusCondition]}
              </Badge>
            )}
            <AnimatedProgress value={playerPokemon.HP} max={playerPokemon.maxHP} color="bg-gradient-to-r from-green-400 to-emerald-600" className="h-2" />
            <div className="mt-2 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
              <span>XP</span>
              <span>{playerPokemon.xp}/{playerXpNeeded}</span>
            </div>
            <AnimatedProgress value={playerPokemon.xp} max={playerXpNeeded} color="bg-gradient-to-r from-blue-400 to-cyan-500" className="h-1.5" showText={false} />
          </div>

          <div className="relative z-30 rounded-none border-4 border-slate-800 bg-white p-2.5 shadow-[6px_6px_0_rgba(22,51,77,0.2)]">
            <div className="flex justify-between items-center mb-1">
              <Badge className={`text-[9px] ${rarity.color} text-white border-0 px-2 py-0.5`}>{rarity.text.toUpperCase()}</Badge>
              <span className="text-orange-500 font-black text-sm">Nv.{battle.enemyLevel}</span>
            </div>
            <h4 className="font-black text-slate-800 text-base mb-1 uppercase tracking-wide">{visibleEnemyName}{battle.enemyIsShiny ? " ✨" : ""}</h4>
            {battle.enemyIsShiny && (
              <Badge className="mb-1 border-0 bg-gradient-to-r from-amber-300 to-yellow-500 px-2 py-0.5 text-[9px] text-slate-900">
                SHINY
              </Badge>
            )}
            <div className="mb-2 text-[11px] font-bold text-slate-500 uppercase tracking-[0.2em]">{normalizedEnemyType}</div>
            {battle.enemyStatusCondition && (
              <Badge className={`${statusBadgeStyles[battle.enemyStatusCondition]} mb-2 border-0 text-white`}>
                {statusLabels[battle.enemyStatusCondition]}
              </Badge>
            )}
            <AnimatedProgress value={battle.enemyHP} max={battle.enemyMaxHP} color="bg-gradient-to-r from-red-500 to-rose-700" className="h-2" />
          </div>
        </div>

        <div className="text-center mb-1 mt-0.5 relative z-30">
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="inline-flex items-center gap-2 border-4 border-slate-800 bg-[linear-gradient(90deg,#6b7280_0%,#6b7280_34%,#94a3b8_34%,#94a3b8_67%,#7c8b73_67%,#7c8b73_100%)] px-4 py-1.5 shadow-[6px_6px_0_rgba(22,51,77,0.38)]"
          >
            <Swords className="h-5 w-5 text-slate-900" />
              <span className="font-pixel text-[11px] sm:text-xs tracking-[0.25em] text-slate-900 uppercase">
              BATALHA
            </span>
            <Target className="h-5 w-5 text-slate-900" />
          </motion.div>
        </div>

        <div className="relative z-0 -mt-3 flex min-h-[clamp(190px,27dvh,280px)] flex-1 justify-between gap-2 px-2 pt-1 sm:-mt-4 sm:px-4 sm:pt-2">
          {attackAnimation && (
            <>
              <motion.div
                key={`flash-${attackAnimation.attacker}-${attackAnimation.moveName}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.32, 0.08, 0] }}
                transition={{ duration: 0.82, ease: "easeOut" }}
                className={`battle-attack-flash pointer-events-none absolute inset-0 z-10 bg-gradient-to-r ${attackGradient} mix-blend-screen`}
              />
              <motion.div
                key={`beam-${attackAnimation.attacker}-${attackAnimation.moveName}`}
                initial={{ opacity: 0, scaleX: 0.2, x: playerIsAttacking ? -180 : 180, y: playerIsAttacking ? 30 : -20, rotate: playerIsAttacking ? -10 : 10 }}
                animate={{ opacity: [0, 0.95, 0.75, 0], scaleX: [0.2, 1, 1.15, 0.9], x: playerIsAttacking ? [-180, -30, 140, 260] : [180, 30, -140, -260], y: playerIsAttacking ? [30, 8, -8, -14] : [-20, -4, 10, 16] }}
                transition={{ duration: 0.7, ease: "easeOut" }}
                className={`pointer-events-none absolute left-1/2 top-1/2 z-20 h-3 w-[38%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r ${attackGradient} blur-[2px] shadow-[0_0_24px_rgba(255,255,255,0.8)] ${playerIsAttacking ? "battle-attack-projectile-player" : "battle-attack-projectile-enemy"}`}
              />
              <motion.div
                key={`${attackAnimation.attacker}-${attackAnimation.moveName}`}
                initial={{ opacity: 0, scale: 0.4, x: playerIsAttacking ? -140 : 140, y: playerIsAttacking ? 24 : -24 }}
                animate={{ opacity: [0, 1, 1, 0], scale: [0.6, 1.5, 1.1, 0.8], x: playerIsAttacking ? [-140, 20, 220, 340] : [140, -20, -220, -340], y: [0, -24, 0, 0] }}
                transition={{ duration: 0.72, ease: "easeOut" }}
                className={`pointer-events-none absolute left-1/2 top-1/2 z-20 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r ${attackGradient} shadow-[0_0_36px_rgba(255,255,255,0.7)]`}
              />
              <motion.div
                key={`impact-${attackAnimation.target}-${attackAnimation.moveName}`}
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: [0, 0.9, 0.25, 0], scale: [0.4, 1.4, 1.9, 2.2] }}
                transition={{ duration: 0.52, ease: "easeOut", delay: 0.22 }}
                className={`pointer-events-none absolute ${enemyIsTarget ? "right-[16%] top-[36%] battle-impact-enemy" : "left-[26%] top-[58%] battle-impact-player"} z-20 h-16 w-16 rounded-full border-4 border-white/90 bg-white/20 blur-[1px]`}
              />
              <motion.div
                key={`label-${attackAnimation.moveName}`}
                initial={{ opacity: 0, y: 12, scale: 0.94 }}
                animate={{ opacity: [0, 1, 1, 0], y: [12, 0, 0, -8], scale: [0.94, 1.04, 1, 0.98] }}
                transition={{ duration: 0.86, ease: "easeOut" }}
                className="pointer-events-none absolute left-1/2 top-[58%] z-30 -translate-x-1/2 rounded-full border-2 border-slate-800 bg-white/90 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-900 shadow-[0_8px_18px_rgba(22,51,77,0.25)]"
              >
                {normalizeDisplayText(attackAnimation.moveName)}
              </motion.div>
            </>
          )}

          <motion.div
            initial={{ x: -80, opacity: 0 }}
            animate={{ x: playerIsAttacking ? [0, 28, 0] : 0, opacity: 1, scale: playerIsTarget ? [1, 1.03, 0.98, 1] : 1, filter: playerIsTarget ? ["brightness(1)", "brightness(1.6)", "brightness(0.92)", "brightness(1)"] : "brightness(1)" }}
            transition={{ x: { duration: 0.4, ease: "easeInOut" }, opacity: { duration: 0.45 }, scale: { duration: 0.38 }, filter: { duration: 0.38 } }}
            className="relative z-10 flex flex-1 items-end justify-start self-end pb-0 pl-2 sm:pl-4"
          >
            <div className={`absolute bottom-3 left-[42%] h-7 w-[clamp(96px,16vw,145px)] -translate-x-1/2 rounded-[999px] bg-gradient-to-r ${playerTypeGradient} opacity-35 blur-sm`} />
            <AnimatedSprite
              key={playerBattleSprite}
              sprite={playerBattleSprite}
              size="lg"
              spriteScale={1.38}
              attackMode={playerIsAttacking ? "attacking" : playerIsTarget ? "hit" : null}
              attackSide="player"
              className="relative z-0 h-[clamp(126px,19dvh,180px)] w-[clamp(126px,19dvh,180px)] drop-shadow-[0_10px_8px_rgba(0,0,0,0.18)] sm:h-[clamp(145px,22dvh,205px)] sm:w-[clamp(145px,22dvh,205px)]"
            />
          </motion.div>

          <motion.div
            initial={{ x: 80, opacity: 0 }}
            animate={{ x: enemyIsAttacking ? [0, -28, 0] : 0, opacity: 1, scale: enemyIsTarget ? [1, 1.04, 0.98, 1] : 1, filter: enemyIsTarget ? ["brightness(1)", "brightness(1.7)", "brightness(0.92)", "brightness(1)"] : "brightness(1)" }}
            transition={{ x: { duration: 0.4, ease: "easeInOut" }, opacity: { duration: 0.45 }, scale: { duration: 0.38 }, filter: { duration: 0.38 } }}
            className="relative z-0 flex flex-1 items-start justify-end self-start pt-0 pr-2 sm:pt-0 sm:pr-5"
          >
            <div className={`absolute bottom-4 right-[18%] h-6 w-[clamp(86px,14vw,128px)] translate-x-1/2 rounded-[999px] bg-gradient-to-r ${enemyTypeGradient} opacity-30 blur-sm`} />
            <div className="relative z-0">
              <AnimatedSprite
                key={enemyBattleSprite}
                sprite={enemyBattleSprite}
                size="lg"
                spriteScale={1.08}
                attackMode={enemyIsAttacking ? "attacking" : enemyIsTarget ? "hit" : null}
                attackSide="enemy"
                className="h-[clamp(116px,15dvh,160px)] w-[clamp(116px,15dvh,160px)] drop-shadow-[0_10px_8px_rgba(0,0,0,0.18)] sm:h-[clamp(124px,17dvh,175px)] sm:w-[clamp(124px,17dvh,175px)]"
              />
            </div>
          </motion.div>
        </div>
      </motion.div>
    </GlassCard>
  )
  },
)

BattleArena.displayName = "BattleArena"
