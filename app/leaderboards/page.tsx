"use client"

import dynamic from "next/dynamic"

const PokemonAdventureAppNoSSR = dynamic(
  () => import("../../components/PokemonAdventureClient"),
  { ssr: false }
)

export default function LeaderboardsPage() {
  return <PokemonAdventureAppNoSSR initialScreen="leaderboards" />
}
