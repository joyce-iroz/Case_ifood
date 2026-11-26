"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Regras } from "@/lib/campanha";
import { formatarNumeroBR, lerNumeroBR } from "@/lib/numero";

const CAMPOS: { k: keyof Regras; rotulo: string; sufixo: string; casas: number | [number, number] }[] = [
  { k: "desconto_max", rotulo: "Desconto máximo", sufixo: "%", casas: [0, 2] },
  { k: "teto_mes", rotulo: "Teto do mês", sufixo: "R$", casas: 2 },
  { k: "ocupacao_min", rotulo: "Ocupação mínima", sufixo: "%", casas: [0, 2] },
  { k: "dias_entre_ofertas", rotulo: "Dias entre ofertas", sufixo: "dias", casas: 0 },
];

export function FormRegras({ regras }: { regras: Regras }) {
  const router = useRouter();
  const [valores, setValores] = useState<Record<string, string>>(
    Object.fromEntries(CAMPOS.map((c) => [c.k, formatarNumeroBR(regras[c.k], c.casas)])),
  );
  const [estado, setEstado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const invalidos = CAMPOS.filter((c) => !Number.isFinite(lerNumeroBR(valores[c.k])));
    if (invalidos.length) {
      setEstado({
        ok: false,
        texto: `Não entendi: ${invalidos.map((c) => `${c.rotulo.toLowerCase()} "${valores[c.k]}"`).join(", ")}. Use, por exemplo, 2.400,00.`,
      });
      return;
    }
    setSalvando(true);
    setEstado(null);
    try {
      const corpo = Object.fromEntries(CAMPOS.map((c) => [c.k, lerNumeroBR(valores[c.k])]));
      const r = await fetch("/api/regras", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erros?.join("; ") ?? j.erro ?? "Falha");
      const salvas = j.regras as Regras;
      setValores(Object.fromEntries(CAMPOS.map((c) => [c.k, formatarNumeroBR(salvas[c.k], c.casas)])));
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
                onBlur={() =>
                  setValores((v) => {
                    const n = lerNumeroBR(v[c.k]);
                    return Number.isFinite(n) ? { ...v, [c.k]: formatarNumeroBR(n, c.casas) } : v;
                  })
                }
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
