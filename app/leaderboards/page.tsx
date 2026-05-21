"use client"

import dynamic from "next/dynamic"

const PokemonAdventureAppNoSSR = dynamic(
  () => import("../page").then((mod) => mod.PokemonAdventureApp),
  { ssr: false }
)

export default function LeaderboardsPage() {
  return <PokemonAdventureAppNoSSR initialScreen="leaderboards" />
}
