"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** DEMO: registra a primeira ocorrência com 85% de ocupação para mostrar a pausa automática. */
export function BotaoSimularCheia({ campanhaId }: { campanhaId: string }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  async function simular() {
    if (!confirm("Registrar 85% de ocupação na primeira ocorrência desta campanha? É só para demonstração.")) return;
    setEnviando(true);
    try {
      await fetch(`/api/campanhas/${campanhaId}/simular-cheia`, { method: "POST" });
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }
  return (
    <button type="button" className="botao botao-mini" onClick={simular} disabled={enviando}>
      {enviando ? "Registrando…" : "Simular ocorrência cheia (demo)"}
    </button>
  );
}
