"use client"

import { memo } from "react"
import type { Pokemon } from "../hooks/useGameState"
import { GlassCard } from "./GlassCard"
import { AnimatedSprite } from "./AnimatedSprite"
import { AnimatedProgress } from "./AnimatedProgress"
import { Badge } from "@/components/ui/badge"
import { typeColors } from "../data/pokemonData"
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

export const PokemonCard = memo(({ name, pokemon, isActive = false, onClick, showStats = true, className = "" }: PokemonCardProps) => {
  const typeGradient = pokemon.type ? typeColors[pokemon.type.split("/")[0]] : "from-gray-400 to-gray-500"

  return (
    <motion.div
      whileHover={{ y: -5, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="h-full"
    >
      <GlassCard
        className={`
          relative h-full cursor-pointer transition-all duration-500 overflow-hidden border-2
          ${isActive ? "border-yellow-400/80 shadow-[0_0_25px_rgba(250,204,21,0.3)] bg-white/10" : "border-white/10 hover:border-white/30"}
          ${className}
        `}
        gradient={`${typeGradient}/20`}
        onClick={onClick}
      >
        {/* Background Accent */}
        <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${typeGradient} opacity-5 blur-3xl -mr-16 -mt-16 rounded-full`} />
        
        <div className="text-center space-y-4 relative z-10">
          <div className="relative pt-2">
            <div className={`absolute inset-0 bg-gradient-to-b ${typeGradient} opacity-5 blur-xl rounded-full scale-110`} />
            <AnimatedSprite sprite={pokemon.sprite} size="lg" />
          </div>

          <div>
            <h3 className="font-black text-2xl text-white mb-1 drop-shadow-sm tracking-tight">{name}</h3>
            {pokemon.type && (
              <Badge className={`bg-gradient-to-r ${typeGradient} text-white border border-white/20 shadow-sm px-3 py-0.5 text-[10px] font-bold uppercase tracking-widest`}>
                {pokemon.type}
              </Badge>
            )}
          </div>

          {showStats && (
            <div className="space-y-3 text-sm pt-2">
              <div className="grid grid-cols-2 gap-2 text-[10px] font-bold uppercase tracking-tighter">
                <div className="bg-white/5 rounded-md py-1.5 px-2 border border-white/10 flex items-center justify-center gap-1">
                  <Star className="w-3 h-3 text-yellow-400" />
                  <span className="text-white/70">NV.</span>
                  <span className="text-white text-sm">{pokemon.level}</span>
                </div>
                <div className="bg-white/5 rounded-md py-1.5 px-2 border border-white/10 flex items-center justify-center gap-1">
                  <Zap className="w-3 h-3 text-blue-400" />
                  <span className="text-white/70">XP</span>
                  <span className="text-white text-sm">{pokemon.xp}</span>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center px-1">
                   <span className="text-[10px] font-black text-white/40 uppercase tracking-widest flex items-center gap-1">
                     <Shield className="w-3 h-3" /> Pontos de Vida
                   </span>
                   <span className="text-[10px] font-mono text-white/60">{pokemon.HP}/{pokemon.maxHP}</span>
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
                   <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Experiência</span>
                   <span className="text-[10px] font-mono text-white/60">{pokemon.xp}%</span>
                </div>
                <AnimatedProgress
                  value={pokemon.xp}
                  max={100}
                  color="bg-gradient-to-r from-blue-400 via-indigo-500 to-purple-600"
                  showText={false}
                  className="h-1.5 rounded-full"
                />
              </div>

              <div className="pt-2 border-t border-white/5">
                <div className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-2 flex items-center gap-1 justify-center">
                  <Swords className="w-3 h-3" /> Arsenal de Ataques
                </div>
                <div className="flex flex-wrap gap-1 justify-center">
                  {Object.entries(pokemon.attacks).map(([moveName, [min, max]]) => (
                    <span key={moveName} className="text-[9px] bg-white/5 border border-white/10 px-2 py-0.5 rounded text-white/70 font-medium">
                      {moveName} <span className="text-white font-bold">{min}-{max}</span>
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
