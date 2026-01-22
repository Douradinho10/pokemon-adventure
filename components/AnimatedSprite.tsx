import { memo } from "react"

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
    <div
      className={`
      ${sizeClasses[size]} 
      ${animate ? "animate-bounce" : ""} 
      transition-all duration-300 hover:scale-110 
      drop-shadow-2xl
      ${className}
    `}
    >
      {sprite}
    </div>
  )
})

AnimatedSprite.displayName = "AnimatedSprite"
