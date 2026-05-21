"use client"

import { useEffect } from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"

const PokemonAdventureApp = dynamic(() => import("../../components/PokemonAdventureClient"), {
  ssr: false,
})

export default function SoloPage() {
  const router = useRouter()

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
  }, [router])

  return <PokemonAdventureApp initialScreen="solo-menu" />
}
