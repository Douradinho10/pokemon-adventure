"use client"

import { memo } from "react"
import type { Pokemon } from "../hooks/useGameState"
import { GlassCard } from "./GlassCard"
import { AnimatedSprite } from "./AnimatedSprite"
import { AnimatedProgress } from "./AnimatedProgress"
import { Badge } from "@/components/ui/badge"
import { typeColors } from "../data/pokemonData"

interface PokemonCardProps {
  name: string
  pokemon: Pokemon
  isActive?: boolean
  onClick?: () => void
  showStats?: boolean
}

export const PokemonCard = memo(({ name, pokemon, isActive = false, onClick, showStats = true }: PokemonCardProps) => {
  const typeGradient = pokemon.type ? typeColors[pokemon.type.split("/")[0]] : "from-gray-400 to-gray-500"

  return (
    <GlassCard
      className={`
        cursor-pointer transform transition-all duration-300 hover:scale-105 hover:shadow-2xl
        ${isActive ? "ring-4 ring-yellow-400 ring-opacity-75 shadow-yellow-400/50" : ""}
      `}
      gradient={`${typeGradient}/20`}
      onClick={onClick}
    >
      <div className="text-center space-y-3">
        <AnimatedSprite sprite={pokemon.sprite} size="lg" />

        <div>
          <h3 className="font-bold text-xl text-white mb-1">{name}</h3>
          {pokemon.type && (
            <Badge className={`bg-gradient-to-r ${typeGradient} text-white border-0`}>{pokemon.type}</Badge>
          )}
        </div>

        {showStats && (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-white/80">
              <span>⭐ Nível {pokemon.level}</span>
              <span>💫 {pokemon.xp}/100 XP</span>
            </div>

            <AnimatedProgress
              value={pokemon.HP}
              max={pokemon.maxHP}
              color="bg-gradient-to-r from-green-400 to-green-600"
              label={`❤️ HP (${Math.floor(pokemon.maxHP / pokemon.level)} por nível)`}
            />

            <AnimatedProgress
              value={pokemon.xp}
              max={100}
              color="bg-gradient-to-r from-blue-400 to-purple-600"
              label="⚡ XP"
              showText={false}
            />

            {/* Mostrar poder de ataque */}
            <div className="text-xs text-white/60 mt-2">
              ⚔️ Ataques:{" "}
              {Object.entries(pokemon.attacks)
                .map(([name, [min, max]]) => `${name} (${min}-${max})`)
                .join(", ")}
            </div>
          </div>
        )}
      </div>
    </GlassCard>
  )
})

PokemonCard.displayName = "PokemonCard"
