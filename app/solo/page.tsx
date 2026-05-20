"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { PokemonAdventureApp } from "../page"

export default function SoloPage() {
  const router = useRouter()
  const [allowSoloRoute, setAllowSoloRoute] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const navigationEntry = window.performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined
    const navigationType = navigationEntry?.type || (window.performance as Performance & { navigation?: { type?: number } }).navigation?.type
    const isReload = navigationType === "reload" || navigationType === 1

    if (isReload) {
      router.replace("/")
      return
    }

    setAllowSoloRoute(true)
  }, [router])

  if (!allowSoloRoute) {
    return null
  }

  return <PokemonAdventureApp initialScreen="solo-menu" />
}
