"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function BotaoResetar() {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [atualizando, startTransition] = useTransition();
  const ocupado = enviando || atualizando;

  async function resetar() {
    if (!confirm("Apagar todos os dados e recriar a demo?")) return;
    setEnviando(true);
    setErro(null);
    try {
      const resp = await fetch("/api/reset", { method: "POST" });
      const corpo = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(corpo.erro ?? `Falha no reset (${resp.status})`);
      startTransition(() => router.refresh());
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div>
      <button className="botao" onClick={resetar} disabled={ocupado}>
        {ocupado ? "Resetando…" : "Resetar demo"}
      </button>
      {erro && <p className="erro">{erro}</p>}
    </div>
  );
}
