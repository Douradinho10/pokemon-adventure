"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signOut,
  updatePassword,
  updateProfile,
} from "firebase/auth"
import { Button } from "@/components/ui/button"
import { getFirebaseAuth, initializeFirebase } from "../../lib/firebase"

const mapFirebaseError = (code: string) => {
  const readable: Record<string, string> = {
    "auth/invalid-credential": "Credenciais invalidas.",
    "auth/wrong-password": "Password atual incorreta.",
    "auth/weak-password": "A nova password deve ter pelo menos 6 caracteres.",
    "auth/requires-recent-login": "Por seguranca, termina sessao e entra novamente antes de mudar a password.",
    "auth/too-many-requests": "Muitas tentativas. Tenta novamente mais tarde.",
    "auth/missing-password": "Indica a password atual.",
  }

  return readable[code] || "Nao foi possivel concluir a operacao."
}

export default function PerfilPage() {
  const router = useRouter()
  const [authReady, setAuthReady] = useState(false)
  const [email, setEmail] = useState("")
  const [displayName, setDisplayName] = useState("Treinador")
  const [draftName, setDraftName] = useState("")
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    initializeFirebase()
    const auth = getFirebaseAuth()

    if (!auth) {
      setError("Firebase Auth nao esta disponivel.")
      setAuthReady(true)
      return
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/login")
        return
      }

      const resolvedName = user.displayName || user.email?.split("@")[0] || "Treinador"
      setDisplayName(resolvedName)
      setDraftName(resolvedName)
      setEmail(user.email || "")
      setAuthReady(true)
    })

    return () => unsubscribe()
  }, [router])

  const clearFeedback = useCallback(() => {
    setMessage(null)
    setError(null)
  }, [])

  const handleSaveName = useCallback(async () => {
    clearFeedback()
    const auth = getFirebaseAuth()

    if (!auth?.currentUser) {
      setError("Sessao invalida. Faz login novamente.")
      router.replace("/login")
      return
    }

    const trimmedName = draftName.trim()
    if (!trimmedName) {
      setError("Indica um nome valido.")
      return
    }

    setBusy(true)
    try {
      await updateProfile(auth.currentUser, { displayName: trimmedName })
      setDisplayName(trimmedName)
      setMessage("Perfil atualizado com sucesso.")
    } catch (unknownError) {
      const authError = unknownError as { code?: string }
      setError(mapFirebaseError(authError.code || ""))
    } finally {
      setBusy(false)
    }
  }, [clearFeedback, draftName, router])

  const handleChangePassword = useCallback(async () => {
    clearFeedback()
    const auth = getFirebaseAuth()

    if (!auth?.currentUser || !auth.currentUser.email) {
      setError("Sessao invalida. Faz login novamente.")
      router.replace("/login")
      return
    }

    if (!currentPassword) {
      setError("Indica a password atual.")
      return
    }

    if (newPassword.length < 6) {
      setError("A nova password deve ter pelo menos 6 caracteres.")
      return
    }

    if (newPassword !== confirmPassword) {
      setError("A confirmacao da nova password nao coincide.")
      return
    }

    setBusy(true)
    try {
      const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword)
      await reauthenticateWithCredential(auth.currentUser, credential)
      await updatePassword(auth.currentUser, newPassword)

      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      setMessage("Password atualizada com sucesso.")
    } catch (unknownError) {
      const authError = unknownError as { code?: string }
      setError(mapFirebaseError(authError.code || ""))
    } finally {
      setBusy(false)
    }
  }, [clearFeedback, confirmPassword, currentPassword, newPassword, router])

  const handleResetPasswordEmail = useCallback(async () => {
    clearFeedback()
    const auth = getFirebaseAuth()

    if (!auth || !email) {
      setError("Email de conta indisponivel.")
      return
    }

    setBusy(true)
    try {
      await sendPasswordResetEmail(auth, email)
      setMessage("Email para redefinir password enviado.")
    } catch (unknownError) {
      const authError = unknownError as { code?: string }
      setError(mapFirebaseError(authError.code || ""))
    } finally {
      setBusy(false)
    }
  }, [clearFeedback, email])

  const handleLogout = useCallback(async () => {
    clearFeedback()
    const auth = getFirebaseAuth()

    if (!auth) {
      router.replace("/login")
      return
    }

    setBusy(true)
    try {
      await signOut(auth)
      router.replace("/login")
    } catch (unknownError) {
      const authError = unknownError as { code?: string }
      setError(mapFirebaseError(authError.code || ""))
      setBusy(false)
    }
  }, [clearFeedback, router])

  if (!authReady) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-4">
        <div className="pixel-window max-w-md bg-[#f8f4dc] p-6 text-center text-slate-900">A carregar perfil...</div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl p-4 sm:p-8">
      <div className="pixel-window bg-[#f8f4dc] p-5 sm:p-7">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h1 className="font-pixel text-sm leading-relaxed text-slate-900 sm:text-base">Perfil do Treinador</h1>
            <p className="text-xs text-slate-600">Gerir conta e seguranca</p>
          </div>
          <Button
            onClick={() => router.push("/?from=perfil")}
            className="pixel-menu-button bg-[linear-gradient(180deg,#3b82f6_0%,#3b82f6_50%,#2563eb_50%,#2563eb_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)] text-[10px] leading-relaxed sm:text-xs"
          >
            Voltar
          </Button>
        </div>

        <div className="mb-4 rounded-lg border-2 border-slate-700 bg-white px-3 py-2 text-sm text-slate-900">
          {email || "Sem email"}
        </div>

        <div className="mb-6 space-y-2">
          <label className="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-700">Nome do perfil</label>
          <input
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            placeholder="Nome do treinador"
            className="w-full rounded-lg border-2 border-slate-700 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-600"
          />
          <Button
            onClick={handleSaveName}
            disabled={busy}
            className="pixel-menu-button w-full bg-[linear-gradient(180deg,#22c55e_0%,#22c55e_50%,#059669_50%,#059669_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)] text-[10px] leading-relaxed sm:text-xs"
          >
            Guardar nome
          </Button>
        </div>

        <div className="mb-6 space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-700">Alterar password</div>
          <input
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            placeholder="Password atual"
            className="w-full rounded-lg border-2 border-slate-700 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-600"
            autoComplete="current-password"
          />
          <input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="Nova password"
            className="w-full rounded-lg border-2 border-slate-700 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-600"
            autoComplete="new-password"
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Confirmar nova password"
            className="w-full rounded-lg border-2 border-slate-700 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-600"
            autoComplete="new-password"
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button
              onClick={handleChangePassword}
              disabled={busy}
              className="pixel-menu-button bg-[linear-gradient(180deg,#f59e0b_0%,#f59e0b_50%,#d97706_50%,#d97706_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)] text-[10px] leading-relaxed sm:text-xs"
            >
              Atualizar password
            </Button>
            <Button
              onClick={handleResetPasswordEmail}
              disabled={busy}
              className="pixel-menu-button bg-[linear-gradient(180deg,#6366f1_0%,#6366f1_50%,#4338ca_50%,#4338ca_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)] text-[10px] leading-relaxed sm:text-xs"
            >
              Enviar email reset
            </Button>
          </div>
        </div>

        <Button
          onClick={handleLogout}
          disabled={busy}
          className="pixel-menu-button w-full bg-[linear-gradient(180deg,#ef4444_0%,#ef4444_50%,#dc2626_50%,#dc2626_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_8px,rgba(0,0,0,0.06)_8px_16px)] text-[10px] leading-relaxed sm:text-xs"
        >
          Terminar sessao
        </Button>

        {message && (
          <div className="mt-4 rounded-xl border-2 border-emerald-700 bg-emerald-100 p-3 text-sm text-emerald-900">{message}</div>
        )}

        {error && <div className="mt-4 rounded-xl border-2 border-rose-700 bg-rose-100 p-3 text-sm text-rose-900">{error}</div>}

        <div className="mt-4 text-xs text-slate-600">Conta atual: {displayName}</div>
      </div>
    </div>
  )
}
