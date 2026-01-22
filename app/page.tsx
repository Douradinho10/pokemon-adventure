"use client"

import { useState, useCallback, useMemo, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useLocalGameState } from "../hooks/useLocalGameState"
import { useBattleLog } from "../hooks/useBattleLog"
import {
  starterPokemon,
  wildPokemon,
  pokeballs,
  calculateHP,
  calculateAttackPower,
  wildPokemonStats,
  getRandomWildPokemon,
  getDamageMultiplier,
  initializePP, // Import new helper
} from "../data/pokemonData"
import { BattleArena } from "../components/BattleArena"
import { PokemonCard } from "../components/PokemonCard"
import { saveGameToFirebase } from "../lib/firebaseRtdbService"

type Screen = "main-menu" | "menu" | "battle" | "shop" | "select-slot" | "select-continue" | "game" // Added 'game' screen
type Modal = "starter" | "attacks" | "capture" | "switch" | "team" | "heal" | "inventory" | "evolution-attacks" | null

const GAME_SAVE_KEY = "pokemon-adventure-save-slots"

const saveSource = "firebase"

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
  } = useLocalGameState()

  const { battleLog, addLog, clearLog } = useBattleLog()

  const [currentScreen, setCurrentScreen] = useState<Screen>("main-menu")
  const [showModal, setShowModal] = useState<Modal>(null)
  const [isAnimating, setIsAnimating] = useState(false)
  const [selectedAttacks, setSelectedAttacks] = useState<string[]>([])

  const random = useCallback((min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min, [])

  useEffect(() => {
    Object.keys(gameState.playerTeam).forEach((pokemonName) => {
      const pokemon = gameState.playerTeam[pokemonName]
      if (!pokemon.attackPP || Object.keys(pokemon.attackPP).length === 0) {
        const newPP = initializePP(pokemon.attacks)
        updatePokemon(pokemonName, { attackPP: newPP })
      }
    })
  }, [gameState.playerTeam, updatePokemon])

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
      const newSlots = [...saveSlots]
      newSlots[currentSlot].gameState = { ...gameState }
      setSaveSlots(newSlots)
      localStorage.setItem(GAME_SAVE_KEY, JSON.stringify(newSlots))

      // Try to save to Firebase
      const userId = localStorage.getItem("pokemon-adventure-user-id") || "default"
      saveGameToFirebase(userId, gameState, currentSlot).catch((err) => {
        console.log("[v0] Firebase save failed (expected in preview):", err.message)
      })
    }

    setCurrentScreen("main-menu")
    addLog("🏠 Voltou ao menu principal!")
  }, [currentSlot, gameState, saveSlots, setSaveSlots, GAME_SAVE_KEY, addLog])

  const statusBar = useMemo(
    () =>
      currentScreen !== "main-menu" && gameState.activePokemon ? (
        <div className="flex flex-wrap justify-between items-center gap-2 mb-4 p-3 bg-white/10 backdrop-blur-xl rounded-lg border border-white/20">
          <Badge className="bg-gradient-to-r from-yellow-500 to-yellow-600 text-white px-3 py-1">
            💰 {gameState.money}
          </Badge>
          <Badge className="bg-gradient-to-r from-red-500 to-red-600 text-white px-3 py-1">⚔️ {gameState.battles}</Badge>
          <Badge className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-3 py-1">
            🎯 {gameState.activePokemon || "Nenhum"}
          </Badge>
          {gameState.activePokemon && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-green-400">
                ❤️ {gameState.playerTeam[gameState.activePokemon].HP}/
                {gameState.playerTeam[gameState.activePokemon].maxHP}
              </span>
              <span className="text-blue-400">⭐ {gameState.playerTeam[gameState.activePokemon].xp}/100</span>
            </div>
          )}
        </div>
      ) : null,
    [gameState, currentScreen],
  )

  const battleLogComponent = useMemo(
    () => (
      <div className="mt-4 p-3 bg-white/10 backdrop-blur-xl rounded-lg border border-white/20">
        <h3 className="font-bold text-white mb-2 text-sm">📜 Log</h3>
        <div className="h-32 overflow-y-auto space-y-1 text-xs">
          {battleLog.slice(-10).map((entry, index) => (
            <div key={index} className="p-2 bg-white/5 rounded border border-white/10">
              {entry}
            </div>
          ))}
        </div>
      </div>
    ),
    [battleLog],
  )

  const chooseStarter = useCallback(
    (starterName: string) => {
      const basePokemon = { ...starterPokemon[starterName] }
      const calculatedHP = calculateHP(basePokemon.HP, basePokemon.level, starterName)

      const newPokemon = {
        ...basePokemon,
        HP: calculatedHP,
        maxHP: calculatedHP,
        attacks: Object.fromEntries(
          Object.entries(basePokemon.attacks).map(([name, power]) => [
            name,
            calculateAttackPower(power, basePokemon.level),
          ]),
        ),
        attackPP: initializePP(basePokemon.attacks),
      }

      updateGameState({
        playerTeam: { [starterName]: newPokemon },
        activePokemon: starterName,
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

    const enemyName = getRandomWildPokemon(gameState.battles)
    const maxLevel = Math.floor(gameState.battles / 10) * 10 + 10
    const minLevel = Math.max(1, maxLevel - 9)
    const enemyLevel = random(minLevel, maxLevel)

    const enemyStats = wildPokemonStats[enemyName] || { baseHP: 40, hpMultiplier: 1.0 }
    const enemyMaxHP = calculateHP(enemyStats.baseHP, enemyLevel, enemyName)

    const enemyAttacks = Object.fromEntries(
      Object.entries(wildPokemon[enemyName].attacks).map(([name, power]) => [
        name,
        calculateAttackPower(power, enemyLevel),
      ]),
    )

    const enemySpeed = wildPokemon[enemyName].speed || 50

    const newBattle = {
      enemyName,
      enemyType: wildPokemon[enemyName].type,
      enemyHP: enemyMaxHP,
      enemyMaxHP: enemyMaxHP,
      enemyLevel,
      enemyAttacks,
      enemySpeed,
    }

    updateGameState({
      battles: gameState.battles + 1,
      currentBattle: newBattle,
    })

    setCurrentScreen("battle")

    const rarity = wildPokemon[enemyName].rarity
    const rarityEmoji = rarity === "lendario" ? "🌟" : rarity === "raro" ? "💎" : "🌿"

    addLog(`${rarityEmoji} ${enemyName} ${rarity} apareceu! (Nv.${enemyLevel}, ${enemyMaxHP}HP)`)
  }, [gameState, updateGameState, addLog, random])

  const handleAttack = useCallback(
    async (attackName: string) => {
      if (!gameState.activePokemon || !gameState.currentBattle) return

      const pokemon = gameState.playerTeam[gameState.activePokemon!]

      if (!pokemon.attackPP?.[attackName] || pokemon.attackPP[attackName].current <= 0) {
        addLog(`⚠️ ${attackName} não tem PP restante!`)
        return
      }

      const [minDamage, maxDamage] = pokemon.attacks[attackName]
      const baseDamage = random(minDamage, maxDamage)

      const typeMultiplier = getDamageMultiplier(
        pokemon.type || "Normal",
        gameState.currentBattle.enemyType || "Normal",
      )
      const finalDamage = Math.floor(baseDamage * typeMultiplier)

      const newPP = { ...pokemon.attackPP }
      newPP[attackName] = {
        ...newPP[attackName],
        current: newPP[attackName].current - 1,
      }
      updatePokemon(gameState.activePokemon, { attackPP: newPP })

      const newEnemyHP = Math.max(0, gameState.currentBattle!.enemyHP - finalDamage)
      updateBattle({ enemyHP: newEnemyHP })

      if (typeMultiplier > 1) {
        addLog(`🔥 Super efetivo! ${attackName}: ${finalDamage} dano! (+${Math.floor((typeMultiplier - 1) * 100)}%)`)
      } else {
        addLog(`⚔️ ${attackName}: ${finalDamage} dano!`)
      }
      setShowModal(null)

      if (newEnemyHP <= 0) {
        const rarity = wildPokemon[gameState.currentBattle!.enemyName].rarity
        const reward = rarity === "lendario" ? 100 : rarity === "raro" ? 50 : 15

        addLog(`🎉 ${gameState.currentBattle!.enemyName} derrotado! +${reward} moedas`)
        updateGameState({ money: gameState.money + reward })

        if ((gameState.battles + 1) % 10 === 0) {
          restoreAllPP()
          addLog(`✨ PP de todos os ataques restaurado! (10 batalhas completadas)`)
        }

        levelUp()
        setTimeout(() => endBattle(), 1500)
      } else {
        setTimeout(() => enemyAttack(), 1000)
      }
    },
    [gameState, updateBattle, updatePokemon, addLog, random, updateGameState],
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

  const enemyAttack = useCallback(() => {
    if (!gameState.currentBattle || !gameState.activePokemon || gameState.currentBattle.enemyHP <= 0) return

    const attacks = Object.keys(gameState.currentBattle.enemyAttacks)
    const attackName = attacks[Math.floor(Math.random() * attacks.length)]
    const [minDamage, maxDamage] = gameState.currentBattle.enemyAttacks[attackName]
    const baseDamage = Math.floor(random(minDamage, maxDamage) / 2)

    const playerPokemon = gameState.playerTeam[gameState.activePokemon]
    const typeMultiplier = getDamageMultiplier(
      gameState.currentBattle.enemyType || "Normal",
      playerPokemon.type || "Normal",
    )
    const damage = Math.floor(baseDamage * typeMultiplier)

    const newHP = Math.max(0, playerPokemon.HP - damage)
    updatePokemon(gameState.activePokemon, { HP: newHP })

    if (typeMultiplier > 1) {
      addLog(`💥 Super efetivo! ${attackName}: ${damage} dano em você! (+${Math.floor((typeMultiplier - 1) * 100)}%)`)
    } else {
      addLog(`💥 ${attackName}: ${damage} dano em você!`)
    }

    if (newHP <= 0) {
      addLog(`😵 ${gameState.activePokemon} desmaiou!`)

      const alivePokemon = Object.keys(gameState.playerTeam).filter((name) => {
        if (name === gameState.activePokemon) {
          return newHP > 0
        }
        return gameState.playerTeam[name].HP > 0
      })

      if (alivePokemon.length > 0) {
        addLog("⚠️ Você deve escolher outro Pokémon!")
        setShowModal("switch")
      } else {
        addLog("💀 Game Over! Todos os Pokémon desmaiaram!")

        setTimeout(() => {
          deleteSaveSlot(currentSlot ?? undefined)

          setGameState({
            playerTeam: {},
            activePokemon: null,
            money: 50,
            battles: 0,
            inventory: { Pokébola: 5 },
            capturedPokemon: [],
            currentBattle: null,
          })
          clearLog()
          setCurrentScreen("main-menu")
          setShowModal(null)
        }, 1500)
      }
    }
  }, [gameState, updatePokemon, addLog, random, setGameState, clearLog, deleteSaveSlot, currentSlot])

  const levelUp = useCallback(() => {
    if (!gameState.activePokemon) return

    const enemyLevel = gameState.currentBattle?.enemyLevel || 1
    const baseXP = 10
    const xpGain = baseXP + Math.floor(enemyLevel * 2.5) + random(0, 10)

    const pokemon = gameState.playerTeam[gameState.activePokemon]
    const newXP = pokemon.xp + xpGain

    if (newXP >= 100) {
      const newLevel = pokemon.level + 1
      const oldMaxHP = pokemon.maxHP

      const newMaxHP = calculateHP(starterPokemon[gameState.activePokemon]?.HP || 40, newLevel, gameState.activePokemon)
      const hpIncrease = newMaxHP - oldMaxHP
      const newCurrentHP = pokemon.HP + hpIncrease

      const baseAttacks = starterPokemon[gameState.activePokemon]?.attacks || pokemon.attacks
      const newAttacks = Object.fromEntries(
        Object.entries(baseAttacks).map(([name, power]) => [name, calculateAttackPower(power, newLevel)]),
      )

      const attackCount = Object.keys(newAttacks).length
      if (attackCount > 4) {
        updatePokemon(gameState.activePokemon, {
          level: newLevel,
          xp: 0,
          maxHP: newMaxHP,
          HP: newCurrentHP,
          pendingAttacks: newAttacks,
        })
        setSelectedAttacks(Object.keys(pokemon.attacks).slice(0, 4))
        addLog(`🌟 Nível ${newLevel}! +${hpIncrease} HP máximo!`)
        addLog(`⚠️ Escolha 4 ataques para manter!`)
        setShowModal("evolution-attacks")
      } else {
        updatePokemon(gameState.activePokemon, {
          level: newLevel,
          xp: 0,
          maxHP: newMaxHP,
          HP: newCurrentHP,
          attacks: newAttacks,
        })
        addLog(`🌟 Nível ${newLevel}! +${hpIncrease} HP máximo!`)
      }
    } else {
      updatePokemon(gameState.activePokemon, { xp: newXP })
    }

    addLog(`✨ +${xpGain} XP`)
  }, [gameState, updatePokemon, addLog, random])

  const handlePokeball = useCallback(
    (ballType: string) => {
      if (!gameState.currentBattle || gameState.currentBattle.enemyHP <= 0) return

      const newInventory = { ...gameState.inventory }
      newInventory[ballType]--

      const baseChance = pokeballs[ballType].chance
      const rarity = wildPokemon[gameState.currentBattle.enemyName].rarity

      const rarityModifier = rarity === "lendario" ? 0.3 : rarity === "raro" ? 0.7 : 1.0
      const finalChance = baseChance * rarityModifier

      setShowModal(null)

      if (Math.random() < finalChance) {
        addLog(`🎉 ${gameState.currentBattle.enemyName} capturado!`)

        const enemyStats = wildPokemonStats[gameState.currentBattle.enemyName] || { baseHP: 40, hpMultiplier: 1.0 }
        const maxHP = calculateHP(
          enemyStats.baseHP,
          gameState.currentBattle.enemyLevel,
          gameState.currentBattle.enemyName,
        )

        const newPokemon = {
          HP: maxHP,
          maxHP: maxHP,
          attacks: gameState.currentBattle.enemyAttacks,
          level: gameState.currentBattle.enemyLevel,
          xp: 0,
          sprite: wildPokemon[gameState.currentBattle.enemyName].sprite,
          type: wildPokemon[gameState.currentBattle.enemyName].type,
          attackPP: initializePP(gameState.currentBattle.enemyAttacks), // Initialize PP for captured Pokemon
        }

        updateGameState({
          inventory: newInventory,
          capturedPokemon: [...gameState.capturedPokemon, gameState.currentBattle.enemyName],
          playerTeam: { ...gameState.playerTeam, [gameState.currentBattle.enemyName]: newPokemon },
        })

        setTimeout(() => endBattle(), 1500)
      } else {
        addLog(`😤 ${gameState.currentBattle.enemyName} escapou!`)
        updateGameState({ inventory: newInventory })
        if (gameState.currentBattle.enemyHP > 0) {
          setTimeout(() => enemyAttack(), 1000)
        }
      }
    },
    [gameState, updateGameState, addLog, enemyAttack],
  )

  const endBattle = useCallback(() => {
    updateGameState({ currentBattle: null })
    setCurrentScreen("menu")
  }, [updateGameState])

  const renderStarterModal = () => (
    <div>
      <h3 className="font-bold text-white mb-6 text-center text-2xl">🌟 Escolha seu Pokémon inicial!</h3>
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
        <p className="text-white/80 text-sm">
          ✨ Escolha sabiamente! Este será seu companheiro inicial na jornada Pokémon!
        </p>
        <p className="text-white/60 text-xs mt-2">🎯 Clique no card do Pokémon que deseja escolher</p>
      </div>
    </div>
  )

  const renderSelectSlotModal = () => (
    <div>
      <h3 className="font-bold text-white mb-6 text-center text-2xl">💾 Escolha um espaço para guardar a run</h3>
      <div className="grid grid-cols-1 gap-3">
        {saveSlots.map((slot) => (
          <div
            key={slot.id}
            onClick={() => {
              startNewGameInSlot(slot.id)
              setShowModal("starter")
            }}
            className="p-4 bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg cursor-pointer hover:scale-105 transform transition-all border-2 border-white/20 hover:border-white/50"
          >
            <div className="text-white font-bold text-lg">Espaço {slot.id + 1}</div>
            {slot.gameState?.activePokemon ? (
              <div className="text-white/80 text-sm mt-2">
                <p>🎯 Pokémon: {slot.gameState.activePokemon}</p>
                <p>⚔️ Batalhas: {slot.gameState.battles}</p>
                <p>💰 Moedas: {slot.gameState.money}</p>
              </div>
            ) : (
              <div className="text-white/60 text-sm mt-2">Vazio - Clique para começar</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )

  const renderSelectContinueModal = () => (
    <div>
      <h3 className="font-bold text-white mb-6 text-center text-2xl">📂 Escolha uma run para continuar</h3>
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
              className="p-4 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-lg cursor-pointer hover:scale-105 transform transition-all border-2 border-white/20 hover:border-white/50"
            >
              <div className="text-white font-bold text-lg">Espaço {slot.id + 1}</div>
              <div className="text-white/80 text-sm mt-2">
                <p>🎯 Pokémon: {slot.gameState?.activePokemon}</p>
                <p>⚔️ Batalhas: {slot.gameState?.battles}</p>
                <p>💰 Moedas: {slot.gameState?.money}</p>
                <p>📊 Nível: {slot.gameState?.playerTeam[slot.gameState.activePokemon!]?.level}</p>
              </div>
            </div>
          ))}
      </div>
      {saveSlots.every((slot) => !slot.gameState?.activePokemon) && (
        <div className="text-center text-white/60 mt-4">
          <p>Nenhuma run salva. Comece um novo jogo!</p>
        </div>
      )}
    </div>
  )

  const renderMainMenu = () => (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8">
      <div className="text-center space-y-4">
        <h2 className="text-5xl font-bold bg-gradient-to-r from-yellow-400 via-pink-500 to-purple-600 bg-clip-text text-transparent">
          Pokémon Adventure
        </h2>
        <p className="text-white/80 text-lg">Bem-vindo à sua jornada Pokémon!</p>
        <p className="text-white/60 text-sm">
          📍 {saveSource === "firebase" ? "Guardado no servidor" : "Guardado no navegador"}
        </p>
      </div>

      <div className="flex flex-col gap-4 w-full max-w-md">
        {saveSlots.some((slot) => slot.gameState?.activePokemon) && (
          <Button
            onClick={() => setCurrentScreen("select-continue")}
            className="h-16 text-xl bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 transform hover:scale-105 transition-all"
          >
            Continuar
          </Button>
        )}

        <Button
          onClick={() => setCurrentScreen("select-slot")}
          className="h-16 text-xl bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 transform hover:scale-105 transition-all"
        >
          🎮 Novo Jogo
        </Button>

        <div className="text-center text-white/60 text-sm mt-4">
          <p>Escolha um espaço para guardar sua aventura!</p>
        </div>
      </div>
    </div>
  )

  const renderGameMenu = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Button
          onClick={startBattle}
          className="h-16 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700"
          disabled={isAnimating}
        >
          ⚔️ Batalhar
        </Button>
        <Button
          onClick={() => setCurrentScreen("shop")}
          className="h-16 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
          disabled={isAnimating}
        >
          🏪 Loja
        </Button>
        <Button
          onClick={() => setShowModal("team")}
          className="h-16 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
          disabled={isAnimating}
        >
          👥 Equipe
        </Button>
        <Button
          onClick={() => setShowModal("inventory")}
          className="h-16 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700"
          disabled={isAnimating}
        >
          🎒 Inventário
        </Button>
      </div>
      <Button
        onClick={returnToMenu}
        className="w-full h-12 bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800"
      >
        🏠 Voltar ao Menu
      </Button>
    </div>
  )

  const renderBattleScreen = () => {
    if (!gameState.currentBattle || !gameState.activePokemon) return null

    return (
      <div className="space-y-4">
        <BattleArena
          playerName={gameState.activePokemon}
          playerPokemon={gameState.playerTeam[gameState.activePokemon]}
          battle={gameState.currentBattle}
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Button
            onClick={() => setShowModal("attacks")}
            className="h-10 bg-gradient-to-r from-red-500 to-red-600 text-xs font-semibold"
            disabled={isAnimating}
          >
            ⚔️ Atacar
          </Button>
          <Button
            onClick={() => setShowModal("capture")}
            className="h-10 bg-gradient-to-r from-blue-500 to-blue-600 text-xs font-semibold"
            disabled={isAnimating}
          >
            🎯 Capturar
          </Button>
          <Button
            onClick={() => setShowModal("switch")}
            className="h-10 bg-gradient-to-r from-green-500 to-green-600 text-xs font-semibold"
            disabled={isAnimating}
          >
            🔄 Trocar
          </Button>
          <Button
            onClick={() => {
              const playerPokemon = gameState.playerTeam[gameState.activePokemon!]
              const playerSpeed = playerPokemon.speed || 50
              const enemySpeed = gameState.currentBattle?.enemySpeed || 50

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
                endBattle()
              } else {
                addLog(`❌ Não conseguiu fugir! (${Math.floor(fleeChance * 100)}% chance)`)
                addLog("💥 O Pokemon selvagem atacou!")
                enemyAttack()
              }
            }}
            className="h-10 bg-gradient-to-r from-gray-500 to-gray-600 text-xs font-semibold"
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
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold text-white">🏪 Loja</h2>
        <Badge className="bg-gradient-to-r from-yellow-500 to-yellow-600 text-white px-4 py-2">
          💰 {gameState.money}
        </Badge>
      </div>

      <div className="grid gap-4">
        <div className="p-4 bg-white/10 backdrop-blur-xl rounded-lg border border-white/20">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-white font-bold text-lg">💊 Potion</h3>
              <p className="text-white/60 text-sm">Restaura HP de todos os Pokemon</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-yellow-400 font-bold">25 💰</span>
              <Button
                onClick={() => {
                  if (gameState.money >= 25) {
                    // Heal all Pokemon in the team
                    Object.keys(gameState.playerTeam).forEach((pokemonName) => {
                      const pokemon = gameState.playerTeam[pokemonName]
                      updatePokemon(pokemonName, { HP: pokemon.maxHP })
                    })
                    updateGameState({
                      money: gameState.money - 25,
                    })
                    addLog("💊 Potion usada! Todos os Pokemon foram curados!")
                  } else {
                    addLog("⚠️ Dinheiro insuficiente!")
                  }
                }}
                disabled={gameState.money < 25}
                className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
              >
                Comprar
              </Button>
            </div>
          </div>
        </div>

        <div className="p-4 bg-white/10 backdrop-blur-xl rounded-lg border border-white/20">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-white font-bold text-lg">✨ Elixir</h3>
              <p className="text-white/60 text-sm">Restaura PP de todos os ataques</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-yellow-400 font-bold">50 💰</span>
              <Button
                onClick={() => {
                  if (gameState.money >= 50) {
                    const newInventory = { ...gameState.inventory }
                    newInventory["Elixir"] = (newInventory["Elixir"] || 0) + 1
                    updateGameState({
                      money: gameState.money - 50,
                      inventory: newInventory,
                    })
                    addLog("✨ Elixir comprado!")
                  } else {
                    addLog("⚠️ Dinheiro insuficiente!")
                  }
                }}
                disabled={gameState.money < 50}
                className="bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700"
              >
                Comprar
              </Button>
            </div>
          </div>
        </div>

        {Object.entries(pokeballs).map(([name, ball]) => (
          <div key={name} className="p-4 bg-white/10 backdrop-blur-xl rounded-lg border border-white/20">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-white font-bold text-lg">{name}</h3>
                <p className="text-white/60 text-sm">Taxa de captura: {Math.floor(ball.chance * 100)}%</p>
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
                  className={`bg-gradient-to-r ${ball.color}`}
                >
                  Comprar
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Button onClick={() => setCurrentScreen("game")} className="w-full bg-gray-600 hover:bg-gray-700 mt-4">
        Voltar
      </Button>
    </div>
  )

  const renderSelectSlotScreen = () => (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      {renderSelectSlotModal()}
      <Button
        onClick={() => setCurrentScreen("main-menu")}
        className="mt-6 bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800"
      >
        🏠 Voltar ao Menu
      </Button>
    </div>
  )

  const renderSelectContinueScreen = () => (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      {renderSelectContinueModal()}
      <Button
        onClick={() => setCurrentScreen("main-menu")}
        className="mt-6 bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800"
      >
        🏠 Voltar ao Menu
      </Button>
    </div>
  )

  const renderModal = () => {
    if (!showModal) return null

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
                    className={`w-full h-16 text-lg ${
                      !hasPP
                        ? "opacity-50 cursor-not-allowed bg-gray-500"
                        : "bg-gradient-to-r from-red-500 to-orange-500"
                    }`}
                  >
                    <div className="flex justify-between items-center w-full">
                      <span>{attackName}</span>
                      <div className="flex flex-col items-end text-xs">
                        <span className="text-white/80">
                          {minDmg}-{maxDmg} dano
                        </span>
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

        case "capture":
          const availableBalls = Object.keys(gameState.inventory).filter((ball) => gameState.inventory[ball] > 0)
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
              <div className="space-y-2">
                {availableBalls.map((ball) => (
                  <Button
                    key={ball}
                    onClick={() => handlePokeball(ball)}
                    className={`w-full h-12 bg-gradient-to-r ${pokeballs[ball].color} text-sm`}
                    disabled={isAnimating}
                  >
                    <div className="flex justify-between items-center w-full">
                      <span>{ball}</span>
                      <div className="text-right text-xs">
                        <div>{Math.floor(pokeballs[ball].chance * 100)}%</div>
                        <div>x{gameState.inventory[ball]}</div>
                      </div>
                    </div>
                  </Button>
                ))}
              </div>
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
                      addLog(`🔄 Trocou para ${name}!`)
                      setShowModal(null)
                    }}
                  >
                    <div className="text-2xl mb-1">{gameState.playerTeam[name].sprite}</div>
                    <div className="text-white font-semibold text-sm">{name}</div>
                    <div className="text-white/70 text-xs">{gameState.playerTeam[name].type}</div>
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
              <h3 className="font-bold text-white mb-4 text-center">👥 Equipe</h3>
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
                        addLog(`✨ ${name} ativo!`)
                        setShowModal(null)
                      }
                    }}
                  >
                    <div className="text-2xl mb-1">{pokemon.sprite}</div>
                    <div className="text-white font-semibold text-sm">{name}</div>
                    <div className="text-white/70 text-xs">{pokemon.type}</div>
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
                    <div className="text-2xl mb-1">{gameState.playerTeam[name].sprite}</div>
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
          return (
            <div className="space-y-3">
              <h3 className="text-white font-bold text-xl mb-4">Inventário:</h3>
              {Object.entries(gameState.inventory).map(([item, count]) => (
                <div key={item} className="flex justify-between items-center p-3 bg-white/10 rounded-lg">
                  <span className="text-white">{item}</span>
                  <div className="flex items-center gap-3">
                    <Badge className="bg-blue-500">{count}x</Badge>
                    {item === "Elixir" && count > 0 && (
                      <Button
                        onClick={useElixir}
                        className="bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700"
                        size="sm"
                      >
                        Usar
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )

        case "evolution-attacks":
          if (!gameState.activePokemon) return null
          const pokemonForEvolution = gameState.playerTeam[gameState.activePokemon]
          const pendingAttacks = pokemonForEvolution.pendingAttacks || pokemonForEvolution.attacks

          return (
            <div>
              <h3 className="font-bold text-white mb-4 text-center">🌟 Escolha 4 Ataques</h3>
              <p className="text-white/80 text-center mb-4 text-sm">
                Selecione os ataques que deseja manter (máximo 4)
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                {Object.entries(pendingAttacks).map(([attack, [min, max]]) => {
                  const isSelected = selectedAttacks.includes(attack)
                  return (
                    <Button
                      key={attack}
                      onClick={() => {
                        if (isSelected) {
                          setSelectedAttacks(selectedAttacks.filter((a) => a !== attack))
                        } else if (selectedAttacks.length < 4) {
                          setSelectedAttacks([...selectedAttacks, attack])
                        }
                      }}
                      className={`h-12 text-sm ${
                        isSelected
                          ? "bg-gradient-to-r from-green-500 to-emerald-500"
                          : "bg-gradient-to-r from-gray-500 to-gray-600"
                      }`}
                    >
                      <div>
                        <div className="font-bold">
                          {isSelected && "✓ "}
                          {attack}
                        </div>
                        <div className="text-xs opacity-80">
                          {min}-{max}
                        </div>
                      </div>
                    </Button>
                  )
                })}
              </div>
              <Button
                onClick={() => {
                  if (selectedAttacks.length === 4) {
                    const finalAttacks = Object.fromEntries(
                      selectedAttacks.map((attack) => [attack, pendingAttacks[attack]]),
                    )
                    updatePokemon(gameState.activePokemon!, { attacks: finalAttacks, pendingAttacks: undefined })
                    addLog(`✅ Ataques atualizados!`)
                    setShowModal(null)
                  }
                }}
                disabled={selectedAttacks.length !== 4}
                className="w-full bg-gradient-to-r from-blue-500 to-blue-600"
              >
                Confirmar ({selectedAttacks.length}/4)
              </Button>
            </div>
          )

        default:
          return null
      }
    }

    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="w-full max-w-6xl mx-4 max-h-[90vh] overflow-y-auto p-6 bg-white/10 backdrop-blur-xl rounded-lg border border-white/20">
          {modalContent()}
          <div className="mt-4 text-center">
            {showModal !== "select-continue" &&
              showModal !== "select-slot" &&
              !(
                showModal === "switch" &&
                gameState.activePokemon &&
                gameState.playerTeam[gameState.activePokemon].HP <= 0
              ) && (
                <Button onClick={() => setShowModal(null)} className="bg-gradient-to-r from-gray-600 to-gray-700">
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 text-white flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-6xl animate-bounce">⚡</div>
          <h2 className="text-2xl font-bold">Carregando jogo...</h2>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 p-4 text-white">
      <div className="max-w-4xl mx-auto">
        {gameState.activePokemon && currentScreen !== "main-menu" && statusBar}

        <div className={`transition-all duration-500 ${isAnimating ? "opacity-50" : "opacity-100"}`}>
          {currentScreen === "main-menu" && renderMainMenu()}
          {currentScreen === "select-slot" && renderSelectSlotScreen()}
          {currentScreen === "select-continue" && renderSelectContinueScreen()}
          {currentScreen === "menu" && renderGameMenu()}
          {currentScreen === "battle" && renderBattleScreen()}
          {currentScreen === "shop" && renderShop()}
          {currentScreen === "game" && renderGameMenu()} {/* Added route for 'game' */}
        </div>

        {battleLogComponent}

        {showModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
            <div className="bg-gradient-to-br from-purple-800 to-blue-800 p-6 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto border-4 border-white/20">
              {renderModal()}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
