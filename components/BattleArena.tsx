"use client"

import { memo } from "react"
import type { Pokemon, Battle } from "../hooks/useGameState"
import { GlassCard } from "./GlassCard"
import { AnimatedSprite } from "./AnimatedSprite"
import { AnimatedProgress } from "./AnimatedProgress"
import { Badge } from "@/components/ui/badge"
import { wildPokemon, typeColors, POKEMON_RARITY_CONFIG } from "../data/pokemonData"
import { SwashbuckleIcon as Sword, Zap, Shield, Flame } from "lucide-react"
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
    <GlassCard className="relative overflow-hidden border-2 border-white/20 bg-black/40 backdrop-blur-2xl">
      {/* Dynamic Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,rgba(50,50,255,0.1),transparent_70%)]" />
        <motion.div 
           animate={{ opacity: [0.1, 0.2, 0.1] }}
           transition={{ duration: 3, repeat: Infinity }}
           className="absolute inset-0 bg-grid-white/[0.02]" 
        />
      </div>

      {/* Battle Header */}
      <div className="text-center mb-8 relative z-10">
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="inline-flex items-center gap-3 bg-gradient-to-r from-red-600 via-orange-500 to-red-600 text-white font-black text-xl px-8 py-3 rounded-full shadow-[0_0_20px_rgba(220,38,38,0.5)] border border-white/30"
        >
          <Sword className="w-6 h-6 animate-pulse" />
          <span className="tracking-widest italic">BATALHA CRÍTICA</span>
          <Sword className="w-6 h-6 animate-pulse" />
        </motion.div>
      </div>

      <div className="relative grid grid-cols-2 gap-8 items-end pb-4">
        {/* Player Platform */}
        <motion.div 
          initial={{ x: -50, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          className="text-center space-y-4"
        >
          <div className="relative group">
             {/* Platform glow */}
            <div className={`absolute -bottom-4 left-1/2 -translate-x-1/2 w-32 h-8 bg-gradient-to-r ${playerTypeGradient} opacity-30 blur-xl rounded-[100%]`} />
            
            <div className="relative z-10">
              <Badge className={`mb-2 text-xs bg-gradient-to-r ${playerTypeGradient} text-white border border-white/20 shadow-lg px-3`}>
                {playerPokemon.type || "Normal"}
              </Badge>
              <h3 className="font-black text-2xl text-white mb-2 drop-shadow-md tracking-tight">{playerName}</h3>
              <div className="transform scale-110">
                <AnimatedSprite sprite={playerPokemon.sprite} size="lg" />
              </div>
            </div>
          </div>

          <GlassCard className="p-3 bg-white/5 border-white/10 shadow-inner">
            <div className="flex justify-between items-center mb-1 px-1">
               <span className="text-[10px] font-bold text-white/50 tracking-tighter uppercase">Status Vida</span>
               <span className="text-[10px] font-bold text-green-400">NORMAL</span>
            </div>
            <AnimatedProgress
              value={playerPokemon.HP}
              max={playerPokemon.maxHP}
              color="bg-gradient-to-r from-green-400 via-emerald-500 to-green-600"
              label={<Shield className="w-3 h-3 inline mr-1" />}
              className="h-3 rounded-full"
            />
            <div className="flex justify-between mt-2">
               <span className="text-xs font-bold text-yellow-400">⭐ Nv.{playerPokemon.level}</span>
               <span className="text-xs text-white/60 font-mono">{playerPokemon.HP}/{playerPokemon.maxHP}</span>
            </div>
          </GlassCard>
        </motion.div>

        {/* Enemy Platform */}
        <motion.div 
          initial={{ x: 50, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          className="text-center space-y-4"
        >
          <div className="relative">
            {/* Platform glow */}
            <div className={`absolute -bottom-4 left-1/2 -translate-x-1/2 w-32 h-8 bg-gradient-to-r ${enemyTypeGradient} opacity-30 blur-xl rounded-[100%]`} />
            
            <div className="relative z-10">
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Badge className={`text-sm bg-gradient-to-r ${rarity.color} text-white border border-white/40 mb-3 px-4 py-1.5 shadow-[0_0_15px_rgba(255,255,255,0.2)] font-black italic`}>
                  {rarity.emoji} {rarity.text.toUpperCase()}
                </Badge>
              </motion.div>
              
              <h3 className="font-black text-2xl text-white mb-1 drop-shadow-md tracking-tight">{battle.enemyName}</h3>
              <Badge className={`text-[10px] bg-gradient-to-r ${enemyTypeGradient} text-white border-0 mb-2 opacity-80 uppercase tracking-widest`}>
                {enemyData.type}
              </Badge>
              <div className="text-orange-500 font-black text-sm mb-4 italic tracking-widest">NV. {battle.enemyLevel}</div>
              
              <div className="transform scale-110 rotate-y-180">
                <AnimatedSprite sprite={enemyData.sprite} size="lg" />
              </div>
            </div>
          </div>

          <GlassCard className="p-3 bg-white/5 border-white/10 shadow-inner">
             <div className="flex justify-between items-center mb-1 px-1">
               <span className="text-[10px] font-bold text-white/50 tracking-tighter uppercase">Inimigo HP</span>
               <span className="text-[10px] font-bold text-red-500 animate-pulse">ALVO</span>
            </div>
            <AnimatedProgress
              value={battle.enemyHP}
              max={battle.enemyMaxHP}
              color="bg-gradient-to-r from-red-500 via-rose-600 to-red-700"
              label={<Flame className="w-3 h-3 inline mr-1" />}
              className="h-3 rounded-full"
            />
             <div className="flex justify-between mt-2">
               <span className="text-xs font-bold text-red-400 italic">🔥 SELVAGEM</span>
               <span className="text-xs text-white/60 font-mono">{battle.enemyHP}/{battle.enemyMaxHP}</span>
            </div>
          </GlassCard>
        </motion.div>
      </div>

      {/* Center Clash Effect */}
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none z-0 overflow-hidden w-full h-full">
        <AnimatePresence>
          <motion.div 
            animate={{ 
              scale: [1, 1.5, 1],
              opacity: [0.1, 0.3, 0.1],
              rotate: 360
            }}
            transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-white opacity-5 blur-[100px] rounded-full"
          />
        </AnimatePresence>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-6xl opacity-10 blur-sm">
          <Zap className="w-32 h-32 text-white fill-white" />
        </div>
      </div>
    </GlassCard>
  )
})

BattleArena.displayName = "BattleArena"
