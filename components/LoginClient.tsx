"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut, updateProfile } from "firebase/auth"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getFirebaseAuth, initializeFirebase } from "../lib/firebase"

const mapFirebaseError = (code: string) => {
  const readable: Record<string, string> = {
    "auth/invalid-email": "Email inválido.",
    "auth/missing-password": "Indica a password.",
    "auth/weak-password": "A password deve ter pelo menos 6 caracteres.",
    "auth/email-already-in-use": "Este email já está registado.",
    "auth/invalid-credential": "Credenciais inválidas.",
    "auth/user-not-found": "Utilizador não encontrado.",
    "auth/wrong-password": "Password incorreta.",
    "auth/too-many-requests": "Muitas tentativas. Tenta novamente mais tarde.",
  }

  return readable[code] || "Não foi possível autenticar."
}

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login")
  const [displayName, setDisplayName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null)
  const gameRedirectTimeoutRef = useRef<number | null>(null)

  const getSafeNextPath = useCallback(() => {
    if (typeof window === "undefined") {
      return "/"
    }

    const params = new URLSearchParams(window.location.search)
    const nextPath = params.get("next") || "/"

    if (!nextPath.startsWith("/") || nextPath.startsWith("//") || nextPath.includes("://")) {
      return "/"
    }

    return nextPath
  }, [])

  const redirectToGame = useCallback(() => {
    if (typeof window === "undefined") {
      return
    }

    const nextPath = getSafeNextPath()

    if (window.location.pathname === "/" && nextPath === "/") {
      return
    }

    window.location.replace(nextPath)

    if (gameRedirectTimeoutRef.current) {
      window.clearTimeout(gameRedirectTimeoutRef.current)
    }

    gameRedirectTimeoutRef.current = window.setTimeout(() => {
      if (window.location.pathname !== nextPath) {
        window.location.replace(nextPath)
      }
    }, 250)
  }, [getSafeNextPath])

  useEffect(() => {
    initializeFirebase()
    const auth = getFirebaseAuth()

    if (!auth) {
      setError("Firebase Auth não está configurado.")
      return
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUserEmail(user?.email || null)

      if (user) {
        redirectToGame()
      }
    })

    return () => unsubscribe()
  }, [redirectToGame])

  useEffect(() => {
    return () => {
      if (gameRedirectTimeoutRef.current) {
        window.clearTimeout(gameRedirectTimeoutRef.current)
      }
    }
  }, [])

  const pageTitle = useMemo(() => (mode === "login" ? "Entrar" : "Criar Conta"), [mode])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)
    setError(null)

    const auth = getFirebaseAuth()
    if (!auth) {
      setError("Firebase Auth não está disponível. Verifica as variáveis NEXT_PUBLIC_FIREBASE.")
      return
    }

    if (!email.trim()) {
      setError("Indica o email.")
      return
    }

    if (!password) {
      setError("Indica a password.")
      return
    }

    setBusy(true)

    try {
      if (mode === "register") {
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password)
        if (displayName.trim()) {
          await updateProfile(credential.user, { displayName: displayName.trim() })
        }
        setMessage("Conta criada com sucesso! Bem-vindo ao Pokémon Adventure.")
        return
      }

      await signInWithEmailAndPassword(auth, email.trim(), password)
      setMessage("Login efetuado com sucesso.")
    } catch (unknownError) {
      const authError = unknownError as { code?: string }
      setError(mapFirebaseError(authError.code || ""))
    } finally {
      setBusy(false)
    }
  }

  const handleLogout = async () => {
    const auth = getFirebaseAuth()
    if (!auth) return

    setBusy(true)
    setError(null)
    setMessage(null)

    try {
      await signOut(auth)
      setMessage("Sessão terminada.")
    } catch {
      setError("Não foi possível terminar a sessão.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="pixel-window w-full max-w-md bg-[#f8f4dc] p-5">
        <div className="pixel-band mb-5 bg-[linear-gradient(180deg,#dbeafe_0%,#dbeafe_50%,#bfdbfe_50%,#bfdbfe_100%)] px-4 py-3 text-center">
          <h1 className="font-pixel text-sm leading-relaxed text-slate-900">{pageTitle}</h1>
          <p className="mt-1 text-xs text-slate-700">Autenticação Firebase</p>
        </div>

        {currentUserEmail && (
          <div className="mb-4 rounded-xl border-2 border-emerald-700 bg-emerald-100 p-3 text-sm text-emerald-900">
            Sessão ativa: {currentUserEmail}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" && (
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-700">Nome no jogo</label>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Ex.: Treinador João"
                className="w-full rounded-lg border-2 border-slate-700 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-600"
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-700">Email</label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="email@exemplo.com"
              className="w-full rounded-lg border-2 border-slate-700 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-600"
              autoComplete="email"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-700">Password</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              className="w-full rounded-lg border-2 border-slate-700 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-600"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" disabled={busy} className="pixel-menu-button flex-1 bg-[linear-gradient(180deg,#3b82f6_0%,#3b82f6_50%,#2563eb_50%,#2563eb_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)] text-[10px] leading-relaxed sm:text-xs">
              {busy ? "A processar..." : mode === "login" ? "Entrar" : "Criar conta"}
            </Button>

            <Button
              type="button"
              disabled={busy}
              onClick={() => {
                setMode((previous) => (previous === "login" ? "register" : "login"))
                setMessage(null)
                setError(null)
              }}
              className="pixel-menu-button flex-1 bg-[linear-gradient(180deg,#22c55e_0%,#22c55e_50%,#16a34a_50%,#16a34a_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)] text-[10px] leading-relaxed sm:text-xs"
            >
              {mode === "login" ? "Criar conta" : "Já tenho conta"}
            </Button>
          </div>

          {currentUserEmail && (
            <Button
              type="button"
              disabled={busy}
              onClick={handleLogout}
              className="pixel-menu-button w-full bg-[linear-gradient(180deg,#ef4444_0%,#ef4444_50%,#dc2626_50%,#dc2626_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)] text-[10px] leading-relaxed sm:text-xs"
            >
              Terminar sessão
            </Button>
          )}
        </form>

        {error && (
          <div className="mt-4 rounded-xl border-2 border-rose-700 bg-rose-100 p-3 text-sm text-rose-900">
            {error}
          </div>
        )}

        {message && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border-2 border-emerald-700 bg-emerald-100 p-3 text-sm text-emerald-900">
            <Badge className="bg-emerald-700 text-white">OK</Badge>
            <span>{message}</span>
          </div>
        )}
      </div>
    </div>
  )
}
