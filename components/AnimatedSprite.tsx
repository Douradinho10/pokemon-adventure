"use client"

import { memo } from "react"
import { motion } from "framer-motion"

interface AnimatedSpriteProps {
  sprite: string
  size?: "sm" | "md" | "lg" | "xl"
  animate?: boolean
  className?: string
}

const sizeClasses = {
  sm: "w-16 h-16",
  md: "w-24 h-24",
  lg: "w-40 h-40",
  xl: "w-56 h-56",
}

export const AnimatedSprite = memo(({ sprite, size = "md", animate = true, className = "" }: AnimatedSpriteProps) => {
  const isEmoji = !sprite.startsWith("http") && !sprite.startsWith("/");

  return (
    <motion.div
      initial={animate ? { y: 0, opacity: 0, scale: 0.5 } : false}
      animate={animate ? { 
        y: [0, -15, 0],
        opacity: 1,
        scale: 1,
        filter: ["brightness(1) contrast(1)", "brightness(1.1) contrast(1.1)", "brightness(1) contrast(1)"]
      } : { opacity: 1, scale: 1 }}
      transition={{ 
        y: { duration: 3, repeat: Infinity, ease: "easeInOut" },
        opacity: { duration: 0.5 },
        scale: { duration: 0.5 },
        filter: { duration: 4, repeat: Infinity, ease: "linear" }
      }}
      className={`
        relative flex items-center justify-center
        ${sizeClasses[size]} 
        transition-all duration-300 hover:scale-110 
        ${className}
      `}
    >
      {isEmoji ? (
        <span className="text-6xl drop-shadow-2xl">{sprite}</span>
      ) : (
        <>
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-4 bg-black/20 blur-md rounded-[100%] z-0" />
          <img 
            src={sprite} 
            alt="Pokemon Sprite" 
            className="w-full h-full object-contain relative z-10 drop-shadow-[0_20px_20px_rgba(0,0,0,0.4)]"
            style={{ imageRendering: sprite.endsWith('.gif') ? 'pixelated' : 'auto' }}
          />
        </>
      )}
    </motion.div>
  )
})

AnimatedSprite.displayName = "AnimatedSprite"
