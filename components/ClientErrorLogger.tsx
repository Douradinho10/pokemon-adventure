"use client"

import { useEffect } from "react"

export default function ClientErrorLogger() {
  useEffect(() => {
    if (typeof window === "undefined") return

    const sendError = async (payload: Record<string, unknown>) => {
      try {
        await fetch("/api/client-error", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          keepalive: true,
        })
      } catch (e) {
        // swallow - best effort
      }
    }

    const onError = (event: ErrorEvent) => {
      const { message, filename, lineno, colno, error } = event
      sendError({ type: "error", message, filename, lineno, colno, stack: error?.stack || null, href: window.location.href, ua: navigator.userAgent })
    }

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason
      const message = typeof reason === "string" ? reason : reason?.message || String(reason)
      const stack = reason?.stack || null
      sendError({ type: "unhandledrejection", message, stack, reason, href: window.location.href, ua: navigator.userAgent })
    }

    window.addEventListener("error", onError)
    window.addEventListener("unhandledrejection", onRejection)

    return () => {
      window.removeEventListener("error", onError)
      window.removeEventListener("unhandledrejection", onRejection)
    }
  }, [])

  return null
}
