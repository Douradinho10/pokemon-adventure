"use client"

import { useState, useCallback } from "react"

export const useBattleLog = () => {
  const [battleLog, setBattleLog] = useState<string[]>(["🌟 Bem-vindo ao mundo Pokémon!"])

  const addLog = useCallback((message: string) => {
    setBattleLog((prev) => [...prev.slice(-20), message])
  }, [])

  const clearLog = useCallback(() => {
    setBattleLog(["🌟 Bem-vindo ao mundo Pokémon!"])
  }, [])

  return { battleLog, addLog, clearLog }
}
