import { Progress } from "@/components/ui/progress"
import { memo } from "react"

interface AnimatedProgressProps {
  value: number
  max?: number
  color?: string
  label?: string
  showText?: boolean
  className?: string
}

export const AnimatedProgress = memo(
  ({ value, max = 100, color = "bg-green-500", label, showText = true, className = "" }: AnimatedProgressProps) => {
    const percentage = Math.max(0, Math.min(100, (value / max) * 100))

    return (
      <div className={`space-y-1 ${className}`}>
        {label && (
          <div className="flex justify-between font-medium text-white/90">
            <span className="text-sm">{label}</span>
            {showText && (
              <span className="text-xs">
                {value}/{max}
              </span>
            )}
          </div>
        )}
        <div className="relative">
          <Progress value={percentage} className="h-2 bg-white/20 border border-white/30" />
          <div
            className={`absolute top-0 left-0 h-full ${color} rounded-full transition-all duration-500 ease-out`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    )
  },
)

AnimatedProgress.displayName = "AnimatedProgress"
