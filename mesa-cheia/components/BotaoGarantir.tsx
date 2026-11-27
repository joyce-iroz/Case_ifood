"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** "Garantir minha mesa": guarda a vaga e recarrega a página com o novo estado. */
export function BotaoGarantir({ token }: { token: string }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className="botao-grande primario"
        disabled={enviando}
        onClick={async () => {
          setEnviando(true);
          setErro(null);
          try {
            const r = await fetch(`/api/oferta/${token}/confirmar`, { method: "POST" });
            const j = await r.json();
            if (!j.ok) throw new Error(j.erro ?? "Não deu certo.");
            router.refresh();
          } catch (e) {
            setErro(e instanceof Error ? e.message : "Sem conexão. Tente de novo.");
          } finally {
            setEnviando(false);
          }
        }}
      >
        {enviando ? "Guardando…" : "Garantir minha mesa"}
      </button>
      {erro && <p className="erro">{erro}</p>}
    </>
  );
}
