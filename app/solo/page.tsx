"use client"

import { useEffect } from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"

const PokemonAdventureApp = dynamic(() => import("../../components/PokemonAdventureClient"), {
  ssr: false,
})

export default function SoloPage() {
  const router = useRouter()


  return <PokemonAdventureApp initialScreen="solo-menu" />
}
