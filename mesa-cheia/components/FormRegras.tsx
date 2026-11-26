"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Regras } from "@/lib/campanha";

const CAMPOS: { k: keyof Regras; rotulo: string; sufixo: string }[] = [
  { k: "desconto_max", rotulo: "Desconto máximo", sufixo: "%" },
  { k: "teto_mes", rotulo: "Teto do mês", sufixo: "R$" },
  { k: "ocupacao_min", rotulo: "Ocupação mínima", sufixo: "%" },
  { k: "dias_entre_ofertas", rotulo: "Dias entre ofertas", sufixo: "dias" },
];

export function FormRegras({ regras }: { regras: Regras }) {
  const router = useRouter();
  const [valores, setValores] = useState<Record<string, string>>(
    Object.fromEntries(CAMPOS.map((c) => [c.k, String(regras[c.k])])),
  );
  const [estado, setEstado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setEstado(null);
    try {
      const corpo = Object.fromEntries(CAMPOS.map((c) => [c.k, Number(valores[c.k].replace(",", "."))]));
      const r = await fetch("/api/regras", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erros?.join("; ") ?? j.erro ?? "Falha");
      setEstado({ ok: true, texto: "Regras salvas. Valem para o formulário e para o planejador." });
      router.refresh();
    } catch (err) {
      setEstado({ ok: false, texto: err instanceof Error ? err.message : "Falha" });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form className="form-regras" onSubmit={salvar}>
      <div className="duas">
        {CAMPOS.map((c) => (
          <label key={c.k} className="campo">
            {c.rotulo}
            <span className="entrada">
              {c.sufixo === "R$" && <span>R$</span>}
              <input
                inputMode="decimal"
                value={valores[c.k]}
                onChange={(e) => setValores((v) => ({ ...v, [c.k]: e.target.value }))}
              />
              {c.sufixo !== "R$" && <span>{c.sufixo}</span>}
            </span>
          </label>
        ))}
      </div>
      <button className="botao" disabled={salvando}>
        {salvando ? "Salvando…" : "Salvar regras"}
      </button>
      {estado && <p className={estado.ok ? "legenda" : "erro"}>{estado.texto}</p>}
    </form>
  );
}
