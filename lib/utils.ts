import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

const mojibakeReplacements: Array<[string, string]> = [
  ["ÃƒÂ", "Á"],
  ["ÃƒÂ", "É"],
  ["ÃƒÂ", "Í"],
  ["ÃƒÂ", "Ó"],
  ["ÃƒÂ", "Ú"],
  ["ÃƒÂ ", "à"],
  ["ÃƒÂ¡", "á"],
  ["ÃƒÂ¢", "â"],
  ["ÃƒÂ£", "ã"],
  ["ÃƒÂ§", "ç"],
  ["ÃƒÂ¨", "è"],
  ["ÃƒÂ©", "é"],
  ["ÃƒÂª", "ê"],
  ["ÃƒÂ­", "í"],
  ["ÃƒÂ³", "ó"],
  ["ÃƒÂ´", "ô"],
  ["ÃƒÂµ", "õ"],
  ["ÃƒÂº", "ú"],
  ["Ã‚Âº", "º"],
  ["Ã‚Âª", "ª"],
  ["Ã‚", ""],
  ["Ã", "Á"],
  ["Ã‰", "É"],
  ["Ã", "Í"],
  ["Ã“", "Ó"],
  ["Ãš", "Ú"],
  ["Ã¡", "á"],
  ["Ã¢", "â"],
  ["Ã£", "ã"],
  ["Ã§", "ç"],
  ["Ã©", "é"],
  ["Ãª", "ê"],
  ["Ã­", "í"],
  ["Ã³", "ó"],
  ["Ã´", "ô"],
  ["Ãµ", "õ"],
  ["Ãº", "ú"],
  ["Â", ""],
]

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function normalizeDisplayText(value: string | undefined | null) {
  if (!value) return ""

  let normalized = value

  for (let attempt = 0; attempt < 3; attempt += 1) {
    let replaced = normalized

    for (const [from, to] of mojibakeReplacements) {
      replaced = replaced.split(from).join(to)
    }

    if (replaced === normalized) break
    normalized = replaced
  }

  return normalized.replace(/�/g, "")
}

export function normalizeTypeText(value: string | undefined | null) {
  return normalizeDisplayText(value)
}

export function normalizeShowdownName(name: string | undefined | null) {
  return normalizeDisplayText(name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
}

export type PokemonSpriteVariant = "original" | "front" | "back"

export interface PokemonSpriteSet {
  original: string
  front: string
  back: string
}

export function getShowdownSpriteUrl(name: string | undefined | null, variant: "front" | "back" = "front") {
  return getShowdownSpriteUrlWithShiny(name, variant, false)
}

export function getShowdownSpriteUrlWithShiny(
  name: string | undefined | null,
  variant: "front" | "back" = "front",
  isShiny = false,
) {
  const normalizedName = normalizeShowdownName(name)

  if (!normalizedName) return ""

  if (isShiny) {
    if (variant === "back") {
      return `https://play.pokemonshowdown.com/sprites/ani-back-shiny/${normalizedName}.gif?v=back-shiny`
    }

    return `https://play.pokemonshowdown.com/sprites/ani-shiny/${normalizedName}.gif?v=front-shiny`
  }

  if (variant === "back") {
    return `https://play.pokemonshowdown.com/sprites/ani-back/${normalizedName}.gif?v=back`
  }

  return `https://play.pokemonshowdown.com/sprites/ani/${normalizedName}.gif?v=front`
}

export function getPokemonSpriteSet(name: string | undefined | null, fallbackSprite?: string | null, isShiny = false): PokemonSpriteSet {
  const front = getShowdownSpriteUrlWithShiny(name, "front", isShiny)
  const back = getShowdownSpriteUrlWithShiny(name, "back", isShiny)

  return {
    original: isShiny ? front : fallbackSprite || front,
    front,
    back,
  }
}

export function getPokemonSpriteUrl(
  name: string | undefined | null,
  fallbackSprite?: string | null,
  variant: PokemonSpriteVariant = "front",
  isShiny = false,
) {
  const spriteSet = getPokemonSpriteSet(name, fallbackSprite, isShiny)
  return spriteSet[variant]
}

export function getShowdownBackSprite(sprite: string | undefined | null) {
  if (!sprite) return ""

  if (sprite.includes("/sprites/ani/")) {
    return sprite.replace("/sprites/ani/", "/sprites/ani-back/")
  }

  if (sprite.includes("/sprites/ani-shiny/")) {
    return sprite.replace("/sprites/ani-shiny/", "/sprites/ani-back-shiny/")
  }

  return sprite
}
