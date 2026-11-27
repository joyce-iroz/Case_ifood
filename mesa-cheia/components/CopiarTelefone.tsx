"use client";

import { useState } from "react";
import { copiar } from "@/lib/copiar";

/** Botão de copiar ao lado de um telefone de teste, para colar na tela do salão. */
export function CopiarTelefone({ telefone }: { telefone: string }) {
  const [estado, setEstado] = useState<"pronto" | "copiado" | "falhou">("pronto");
  return (
    <button
      type="button"
      className={`copiar-tel ${estado === "copiado" ? "ok" : ""}`}
      aria-label={`Copiar ${telefone}`}
      onClick={async () => {
        setEstado((await copiar(telefone)) ? "copiado" : "falhou");
        setTimeout(() => setEstado("pronto"), 1800);
      }}
    >
      {estado === "copiado" ? "copiado" : estado === "falhou" ? "selecione e copie" : "copiar"}
    </button>
  );
}
