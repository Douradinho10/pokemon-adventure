"use client"

import dynamic from "next/dynamic"

const PokemonAdventureClient = dynamic(() => import("../components/PokemonAdventureClient"), {
  ssr: false,
})

export default function Page() {
  return <PokemonAdventureClient initialScreen="main-menu" />
}
