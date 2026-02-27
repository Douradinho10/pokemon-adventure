"use client"

import { memo } from "react"
import type { Pokemon, Battle } from "../hooks/useGameState"
import { GlassCard } from "./GlassCard"
import { AnimatedSprite } from "./AnimatedSprite"
import { AnimatedProgress } from "./AnimatedProgress"
import { Badge } from "@/components/ui/badge"
import { wildPokemon, typeColors, POKEMON_RARITY_CONFIG } from "../data/pokemonData"
import { Sword, Zap, Shield, Flame, Target } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

interface BattleArenaProps {
  playerPokemon: Pokemon
  playerName: string
  battle: Battle
}

export const BattleArena = memo(({ playerPokemon, playerName, battle }: BattleArenaProps) => {
  const enemyData = wildPokemon[battle.enemyName]
  const playerTypeGradient = playerPokemon.type
    ? typeColors[playerPokemon.type.split("/")[0]]
    : "from-gray-400 to-gray-500"
  const enemyTypeGradient = enemyData.type ? typeColors[enemyData.type.split("/")[0]] : "from-gray-400 to-gray-500"

  const rarity = POKEMON_RARITY_CONFIG[enemyData.rarity]

  return (
    <GlassCard className="relative overflow-hidden border-2 border-white/20 bg-gradient-to-b from-gray-900/80 to-black/90 backdrop-blur-3xl p-6 min-h-[500px]">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className={`absolute inset-0 bg-gradient-to-br ${playerTypeGradient} opacity-5`} />
        <motion.div 
           animate={{ 
             backgroundPosition: ["0% 0%", "100% 100%"],
             opacity: [0.05, 0.1, 0.05]
           }}
           transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
           className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10" 
        />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,0,0,0.02),rgba(0,255,0,0.01),rgba(0,0,255,0.02))] bg-[length:100%_4px,3px_100%] pointer-events-none" />
      </div>

      <div className="text-center mb-12 relative z-10">
        <motion.div 
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="inline-flex items-center gap-4 bg-black/60 backdrop-blur-md px-10 py-4 rounded-2xl border border-white/10 shadow-[0_0_40px_rgba(0,0,0,0.5)]"
        >
          <div className="flex -space-x-2">
            <Sword className="w-6 h-6 text-red-500 animate-pulse" />
            <Sword className="w-6 h-6 text-blue-500 animate-pulse" />
          </div>
          <span className="font-black text-2xl tracking-[0.2em] text-white uppercase italic">
            CONFRONTO
          </span>
          <Target className="w-6 h-6 text-yellow-500 animate-spin-slow" />
        </motion.div>
      </div>

      <div className="relative flex justify-between items-center h-full px-4 gap-4 z-10">
        <motion.div initial={{ x: -100, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="flex-1 flex flex-col items-center">
          <div className="relative mb-6">
            <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.2, 0.1] }} transition={{ duration: 4, repeat: Infinity }} className={`absolute inset-0 bg-gradient-to-r ${playerTypeGradient} rounded-full blur-3xl`} />
            <AnimatedSprite sprite={playerPokemon.sprite} size="xl" className="drop-shadow-[0_0_30px_rgba(255,255,255,0.2)]" />
            <div className="absolute -top-12 -left-8 bg-black/80 backdrop-blur-lg p-3 rounded-xl border border-white/10 shadow-2xl min-w-[180px]">
              <div className="flex justify-between items-center mb-2">
                <span className="font-black text-white text-sm truncate">{playerName}</span>
                <span className="text-yellow-400 font-bold text-xs ml-2">LV.{playerPokemon.level}</span>
              </div>
              <AnimatedProgress value={playerPokemon.HP} max={playerPokemon.maxHP} color="bg-gradient-to-r from-green-400 to-emerald-600" className="h-2" />
            </div>
          </div>
        </motion.div>

        <div className="relative h-40 w-px bg-gradient-to-b from-transparent via-white/20 to-transparent flex items-center justify-center">
          <div className="bg-black border border-white/20 w-12 h-12 rounded-full flex items-center justify-center text-white font-black text-xl italic shadow-[0_0_20px_rgba(255,255,255,0.1)]">VS</div>
        </div>

        <motion.div initial={{ x: 100, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="flex-1 flex flex-col items-center">
          <div className="relative mb-6">
            <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.2, 0.1] }} transition={{ duration: 4, repeat: Infinity, delay: 2 }} className={`absolute inset-0 bg-gradient-to-r ${enemyTypeGradient} rounded-full blur-3xl`} />
            <div className="relative transform scale-x-[-1]">
              <AnimatedSprite sprite={enemyData.sprite} size="xl" className="drop-shadow-[0_0_30px_rgba(255,255,255,0.2)]" />
            </div>
            <div className="absolute -top-12 -right-8 bg-black/80 backdrop-blur-lg p-3 rounded-xl border border-white/10 shadow-2xl min-w-[180px]">
              <div className="flex justify-between items-center mb-1">
                <Badge className={`text-[9px] ${rarity.color} text-white border-0 px-2 py-0`}>{rarity.text.toUpperCase()}</Badge>
                <span className="text-orange-400 font-bold text-xs">LV.{battle.enemyLevel}</span>
              </div>
              <h4 className="font-black text-white text-sm mb-2">{battle.enemyName}</h4>
              <AnimatedProgress value={battle.enemyHP} max={battle.enemyMaxHP} color="bg-gradient-to-r from-red-500 to-rose-700" className="h-2" />
            </div>
          </div>
        </motion.div>
      </div>
    </GlassCard>
  )
})

BattleArena.displayName = "BattleArena"
