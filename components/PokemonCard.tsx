"use client"

import { memo } from "react"
import type { Pokemon } from "../hooks/useGameState"
import { GlassCard } from "./GlassCard"
import { AnimatedSprite } from "./AnimatedSprite"
import { AnimatedProgress } from "./AnimatedProgress"
import { Badge } from "@/components/ui/badge"
import { typeColors } from "../data/pokemonData"
import { getPokemonSpriteSet, normalizeDisplayText, normalizeTypeText } from "../lib/utils"
import { motion } from "framer-motion"
import { Star, Zap, Shield, Swords } from "lucide-react"

interface PokemonCardProps {
  name: string
  pokemon: Pokemon
  isActive?: boolean
  onClick?: () => void
  showStats?: boolean
  className?: string
}

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

export const PokemonCard = memo(({ name, pokemon, isActive = false, onClick, showStats = true, className = "" }: PokemonCardProps) => {
  const normalizedType = normalizeTypeText(pokemon.type)
  const typeGradient = normalizedType ? typeColors[normalizedType.split("/")[0]] : "from-gray-400 to-gray-500"
  const cardSprite = pokemon.spriteSet?.front || getPokemonSpriteSet(name, pokemon.sprite).front
  const xpNeeded = getXpNeededForNextLevel(pokemon.level)

  return (
    <motion.div
      whileHover={{ y: -5, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="h-full"
    >
      <GlassCard
        className={`
          relative h-full cursor-pointer transition-all duration-500 overflow-hidden bg-[linear-gradient(180deg,#fdf6b2_0%,#fff8da_32%,#fefefe_32%,#fefefe_62%,#d4ebff_62%,#bfdfff_100%)]
          ${isActive ? "border-yellow-400 shadow-[8px_8px_0_rgba(250,204,21,0.48)]" : "border-slate-800 hover:border-blue-500/60"}
          ${className}
        `}
        gradient={`${typeGradient}/10`}
        onClick={onClick}
      >
        <div className="absolute inset-x-0 top-0 h-12 bg-[linear-gradient(90deg,#ef4444_0%,#ef4444_20%,#facc15_20%,#facc15_40%,#3b82f6_40%,#3b82f6_60%,#22c55e_60%,#22c55e_80%,#ef4444_80%,#ef4444_100%)]" />
        <div className="absolute right-3 top-3 h-6 w-6 rounded-none border-2 border-slate-900 bg-white shadow-[2px_2px_0_rgba(15,23,42,0.7)]" />
        <div className={`absolute bottom-0 left-0 h-24 w-full bg-gradient-to-t ${typeGradient} opacity-15`} />
        <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent_0_6px,rgba(15,23,42,0.04)_6px_8px)] opacity-60" />
        
        <div className="text-center space-y-4 relative z-10 pt-8">
          <div className="relative pt-2">
            <div className={`absolute inset-x-6 top-10 h-6 bg-gradient-to-r ${typeGradient} opacity-20 blur-md rounded-full`} />
            <AnimatedSprite sprite={cardSprite} size="lg" />
          </div>

          <div>
            <h3 className="font-pixel text-sm sm:text-base lg:text-[13px] xl:text-base text-slate-900 mb-2 leading-tight">{name}{pokemon.isShiny ? " ✨" : ""}</h3>
            {normalizedType && (
              <Badge className={`bg-gradient-to-r ${typeGradient} text-white border-2 border-slate-800 shadow-[3px_3px_0_rgba(15,23,42,0.55)] px-3 py-0.5 text-[10px] font-bold uppercase tracking-widest`}>
                {normalizedType}
              </Badge>
            )}
            {pokemon.isShiny && (
              <div className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-amber-500">Shiny</div>
            )}
          </div>

          {showStats && (
            <div className="space-y-3 text-sm pt-2">
              <div className="grid grid-cols-2 gap-2 text-[10px] font-bold uppercase tracking-tighter">
                <div className="bg-white/80 rounded-none py-1.5 px-2 border-2 border-slate-800 flex items-center justify-center gap-1 shadow-[3px_3px_0_rgba(15,23,42,0.16)]">
                  <Star className="w-3 h-3 text-yellow-400" />
                  <span className="text-slate-500">NV.</span>
                  <span className="text-slate-900 text-sm">{pokemon.level}</span>
                </div>
                <div className="bg-white/80 rounded-none py-1.5 px-2 border-2 border-slate-800 flex items-center justify-center gap-1 shadow-[3px_3px_0_rgba(15,23,42,0.16)]">
                  <Zap className="w-3 h-3 text-blue-400" />
                  <span className="text-slate-500">XP</span>
                  <span className="text-slate-900 text-sm">{pokemon.xp}/{xpNeeded}</span>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center px-1">
                   <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                     <Shield className="w-3 h-3" /> Pontos de Vida
                   </span>
                   <span className="text-[10px] font-mono text-slate-600">{pokemon.HP}/{pokemon.maxHP}</span>
                </div>
                <AnimatedProgress
                  value={pokemon.HP}
                  max={pokemon.maxHP}
                  color="bg-gradient-to-r from-green-400 via-emerald-500 to-green-600"
                  className="h-2 rounded-full shadow-inner"
                />
              </div>

              <div className="space-y-1">
                 <div className="flex justify-between items-center px-1">
                   <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Experiência</span>
                   <span className="text-[10px] font-mono text-slate-600">{pokemon.xp}/{xpNeeded}</span>
                </div>
                <AnimatedProgress
                  value={pokemon.xp}
                  max={xpNeeded}
                  color="bg-gradient-to-r from-blue-400 via-indigo-500 to-purple-600"
                  showText={false}
                  className="h-1.5 rounded-full"
                />
              </div>

              <div className="pt-2 border-t border-slate-200">
                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1 justify-center">
                  <Swords className="w-3 h-3" /> Arsenal de Ataques
                </div>
                <div className="flex flex-wrap gap-1 justify-center">
                  {Object.entries(pokemon.attacks).map(([moveName, [min, max]]) => (
                    <span key={moveName} className="text-[9px] bg-white/85 border-2 border-slate-800 px-2 py-0.5 rounded-none text-slate-600 font-medium shadow-[2px_2px_0_rgba(15,23,42,0.12)]">
                      {normalizeDisplayText(moveName)} <span className="text-slate-900 font-bold">{min}-{max}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </GlassCard>
    </motion.div>
  )
})

PokemonCard.displayName = "PokemonCard"
