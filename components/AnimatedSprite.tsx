"use client"

import { memo } from "react"
import { motion } from "framer-motion"

interface AnimatedSpriteProps {
  sprite: string
  size?: "sm" | "md" | "lg" | "xl"
  animate?: boolean
  className?: string
  spriteScale?: number
  attackMode?: "attacking" | "hit" | null
  attackSide?: "player" | "enemy"
}

const sizeClasses = {
  sm: "w-16 h-16",
  md: "w-24 h-24",
  lg: "w-40 h-40",
  xl: "w-56 h-56",
}

export const AnimatedSprite = memo(
  ({
    sprite,
    size = "md",
    animate = true,
    className = "",
    spriteScale = 1,
    attackMode = null,
    attackSide = "player",
  }: AnimatedSpriteProps) => {
  const isEmoji = !sprite.startsWith("http") && !sprite.startsWith("/")
  const attackVector = attackSide === "player" ? 42 : -42

  const animationTarget = animate
    ? {
        y: attackMode === "attacking" ? [0, -10, -4, 0] : [0, -4, 0],
        x: attackMode === "attacking" ? [0, attackVector, 0] : attackMode === "hit" ? [0, -10, 10, -6, 0] : 0,
        rotate: attackMode === "attacking" ? [0, attackSide === "player" ? -8 : 8, 0] : attackMode === "hit" ? [0, -5, 4, -3, 0] : 0,
        opacity: 1,
        scale: attackMode === "attacking" ? [1, 1.12, 1] : attackMode === "hit" ? [1, 1.08, 0.96, 1] : 1,
        filter:
          attackMode === "hit"
            ? ["brightness(1)", "brightness(2) contrast(1.2)", "brightness(0.92)", "brightness(1)"]
            : ["brightness(1) contrast(1)", "brightness(1.1) contrast(1.1)", "brightness(1) contrast(1)"],
      }
    : { opacity: 1, scale: 1 }

  const animationTransition = {
    y: { duration: attackMode ? 0.55 : 3.4, repeat: attackMode ? 0 : Infinity, ease: "easeInOut" },
    x: { duration: attackMode ? 0.55 : 0.2, repeat: 0, ease: "easeInOut" },
    rotate: { duration: attackMode ? 0.55 : 0.2, repeat: 0, ease: "easeInOut" },
    opacity: { duration: 0.5 },
    scale: { duration: attackMode ? 0.55 : 0.5, repeat: 0 },
    filter: { duration: attackMode ? 0.55 : 4, repeat: attackMode ? 0 : Infinity, ease: "linear" },
  }

  const attackClassName =
    attackMode === "attacking"
      ? attackSide === "player"
        ? "battle-sprite-attack-player"
        : "battle-sprite-attack-enemy"
      : attackMode === "hit"
        ? "battle-sprite-hit"
        : ""

  return (
    <motion.div
      initial={animate ? { y: 0, opacity: 0, scale: 0.5 } : false}
      animate={animationTarget}
      transition={animationTransition}
      className={`
        relative flex items-center justify-center overflow-visible
        ${sizeClasses[size]} 
        transition-all duration-300 hover:scale-105 
        ${attackClassName}
        ${className}
      `}
    >
      {isEmoji ? (
        <span className="text-6xl [image-rendering:pixelated] drop-shadow-[4px_4px_0_rgba(0,0,0,0.35)]">{sprite}</span>
      ) : (
        <>
          <div className="absolute bottom-1 left-1/2 z-0 h-3 w-3/4 -translate-x-1/2 rounded-[100%] bg-black/20 opacity-60" />
          <img
            src={sprite}
            alt="Pokemon Sprite"
            className="relative z-10 h-full w-full object-contain drop-shadow-[6px_6px_0_rgba(0,0,0,0.28)] [image-rendering:pixelated]"
            style={{ imageRendering: 'pixelated', transform: `scale(${spriteScale})`, transformOrigin: 'center bottom' }}
          />
        </>
      )}
    </motion.div>
  )
})

AnimatedSprite.displayName = "AnimatedSprite"
