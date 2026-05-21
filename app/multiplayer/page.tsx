"use client"

import dynamic from "next/dynamic"

const PokemonAdventureAppNoSSR = dynamic(
  () => import("../../components/PokemonAdventureClient"),
  { ssr: false }
)

export default function MultiplayerPage() {
  return <PokemonAdventureAppNoSSR initialScreen="multiplayer" />
}
