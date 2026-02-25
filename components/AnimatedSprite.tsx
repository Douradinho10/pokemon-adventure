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
  sm: "text-4xl",
  md: "text-6xl",
  lg: "text-8xl",
  xl: "text-9xl",
}

export const AnimatedSprite = memo(({ sprite, size = "md", animate = true, className = "" }: AnimatedSpriteProps) => {
  return (
    <motion.div
      initial={animate ? { y: 0 } : false}
      animate={animate ? { 
        y: [0, -10, 0],
        scale: [1, 1.05, 1],
        rotate: [0, -2, 2, 0]
      } : false}
      transition={{ 
        duration: 2, 
        repeat: Infinity, 
        ease: "easeInOut" 
      }}
      className={`
        ${sizeClasses[size]} 
        transition-all duration-300 hover:scale-125 
        drop-shadow-[0_10px_10px_rgba(0,0,0,0.5)]
        filter saturate-150
        ${className}
      `}
    >
      {sprite}
    </motion.div>
  )
})

AnimatedSprite.displayName = "AnimatedSprite"
