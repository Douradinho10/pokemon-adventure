import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { ReactNode } from "react"

interface GlassCardProps {
  children: ReactNode
  title?: string
  className?: string
  gradient?: string
  onClick?: () => void
}

export const GlassCard = ({ children, title, className = "", gradient, onClick }: GlassCardProps) => {
  return (
    <Card
      onClick={onClick}
      className={`
      pixel-surface pixel-inset backdrop-blur-[2px] bg-[#f8f4dc]/92 border-slate-800
      hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all duration-300
      ${gradient ? `bg-gradient-to-br ${gradient}` : ""}
      ${className}
    `}
    >
      {title && (
        <CardHeader className="pb-3">
          <CardTitle className="text-slate-900 text-center text-lg sm:text-xl font-pixel">{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent className={title ? "pt-0" : "p-6"}>{children}</CardContent>
    </Card>
  )
}
