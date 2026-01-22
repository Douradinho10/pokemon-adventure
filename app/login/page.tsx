"use client";

import { useState } from "react";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const endpoint = mode === "login" ? "/api/login" : "/api/register";

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || "Erro");
      return;
    }

    if (mode === "register") {
      setMessage("Conta criada com sucesso! Agora faz login.");
      setMode("login");
      setPassword("");
    } else {
      setMessage("Login efetuado! Entrada no jogo...");
      // aqui podes redirecionar para a página principal do jogo
      // e.g. window.location.href = "/";
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
      <form onSubmit={submit} style={{ width: 360, padding: 20, border: "1px solid #ccc", borderRadius: 8 }}>
        <h2>{mode === "login" ? "Entrar" : "Criar conta"}</h2>
        <div style={{ marginBottom: 8 }}>
          <label>Username</label>
          <input value={username} onChange={e => setUsername(e.target.value)} style={{ width: "100%" }} />
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={{ width: "100%" }} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit">{mode === "login" ? "Entrar" : "Criar conta"}</button>
          <button type="button" onClick={() => setMode(mode === "login" ? "register" : "login")}>
            {mode === "login" ? "Quero criar conta" : "Já tenho conta"}
          </button>
        </div>
        {message && <p style={{ marginTop: 10 }}>{message}</p>}
      </form>
    </div>
  );
}
