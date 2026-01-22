import { memo } from "react"
import type { Pokemon, Battle } from "../hooks/useGameState"
import { GlassCard } from "./GlassCard"
import { AnimatedSprite } from "./AnimatedSprite"
import { AnimatedProgress } from "./AnimatedProgress"
import { Badge } from "@/components/ui/badge"
import { wildPokemon, typeColors, POKEMON_RARITY_CONFIG } from "../data/pokemonData"

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

  // Use centralized rarity configuration
  const rarity = POKEMON_RARITY_CONFIG[enemyData.rarity]

  return (
    <GlassCard className="relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 via-purple-500/5 to-blue-500/5" />

      {/* Battle Header */}
      <div className="text-center mb-4">
        <div className="inline-flex items-center gap-2 bg-gradient-to-r from-red-500 to-blue-500 text-white font-bold text-lg px-4 py-2 rounded-full shadow-lg animate-pulse">
          ⚔️ BATALHA ⚔️
        </div>
      </div>

      <div className="relative grid grid-cols-2 gap-4">
        {/* Player Pokemon */}
        <div className="text-center space-y-2">
          <div className="relative">
            <div
              className={`absolute inset-0 bg-gradient-to-br ${playerTypeGradient} opacity-15 rounded-full blur-lg`}
            />
            <div className="relative">
              <Badge className={`mb-1 text-xs bg-gradient-to-r ${playerTypeGradient} text-white border-0`}>
                {playerPokemon.type || "Normal"}
              </Badge>
              <h3 className="font-bold text-lg text-white mb-2">{playerName}</h3>
              <AnimatedSprite sprite={playerPokemon.sprite} size="lg" />
            </div>
          </div>

          <div className="space-y-2">
            <AnimatedProgress
              value={playerPokemon.HP}
              max={playerPokemon.maxHP}
              color="bg-gradient-to-r from-green-400 to-green-600"
              label="❤️"
              className="text-xs"
            />
            <div className="text-white/70 text-xs">⭐ Nv.{playerPokemon.level}</div>
          </div>
        </div>

        {/* Enemy Pokemon */}
        <div className="text-center space-y-2">
          <div className="relative">
            <div
              className={`absolute inset-0 bg-gradient-to-br ${enemyTypeGradient} opacity-15 rounded-full blur-lg`}
            />
            <div className="relative">
              <Badge
                className={`text-sm bg-gradient-to-r ${rarity.color} text-white border-0 animate-pulse mb-2 px-3 py-1 shadow-lg`}
              >
                {rarity.emoji} {rarity.text}
              </Badge>
              <h3 className="font-bold text-lg text-white mb-1">{battle.enemyName}</h3>
              <Badge className={`text-xs bg-gradient-to-r ${enemyTypeGradient} text-white border-0 mb-1`}>
                {enemyData.type}
              </Badge>
              <div className="text-yellow-400 font-bold text-sm mb-2">⭐ Nv.{battle.enemyLevel}</div>
              <AnimatedSprite sprite={enemyData.sprite} size="lg" />
            </div>
          </div>

          <div className="space-y-2">
            <AnimatedProgress
              value={battle.enemyHP}
              max={battle.enemyMaxHP}
              color="bg-gradient-to-r from-red-400 to-red-600"
              label="❤️"
              className="text-xs"
            />
            <div className="text-red-400 font-semibold text-xs animate-pulse">🔥 Selvagem</div>
          </div>
        </div>
      </div>

      {/* Battle Effects */}
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none">
        <div className="text-4xl animate-bounce opacity-30">⚡</div>
      </div>
    </GlassCard>
  )
})

BattleArena.displayName = "BattleArena"
