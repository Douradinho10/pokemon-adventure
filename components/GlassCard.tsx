import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { ReactNode } from "react"

interface GlassCardProps {
  children: ReactNode
  title?: string
  className?: string
  gradient?: string
}

export const GlassCard = ({ children, title, className = "", gradient }: GlassCardProps) => {
  return (
    <Card
      className={`
      backdrop-blur-xl bg-white/10 border-white/20 shadow-2xl
      hover:bg-white/15 transition-all duration-300
      ${gradient ? `bg-gradient-to-br ${gradient}` : ""}
      ${className}
    `}
    >
      {title && (
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-center font-bold text-xl">{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent className={title ? "pt-0" : "p-6"}>{children}</CardContent>
    </Card>
  )
}
