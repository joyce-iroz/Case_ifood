"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { contarPalavras, mostrarMarcador, segundosDeFala } from "@/lib/kit-regras";
import type { Kit } from "@/lib/kit";
import { copiar } from "@/lib/copiar";

export type ItemKit = { campanhaId: string; rotulo: string; beneficio: string; kit: Kit | null };

type Aba = "script" | "equipe" | "cartaz";
const ABAS: { id: Aba; rotulo: string }[] = [
  { id: "script", rotulo: "Script do garçom" },
  { id: "equipe", rotulo: "Mensagem para a equipe" },
  { id: "cartaz", rotulo: "Cartaz de mesa" },
];

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function KitAtivacao({ itens }: { itens: ItemKit[] }) {
  const router = useRouter();
  const [sel, setSel] = useState(0);
  const [aba, setAba] = useState<Aba>("script");
  const [aviso, setAviso] = useState<string | null>(null);
  const item = itens[Math.min(sel, itens.length - 1)];
  const kit = item?.kit;

  async function copiarAba(qual: Aba) {
    if (!kit) return;
    const texto =
      qual === "script" ? mostrarMarcador(kit.script_garcom) : qual === "equipe" ? kit.mensagem_equipe : `${kit.cartaz_titulo}\n${kit.cartaz_linha}`;
    const ok = await copiar(texto);
    if (!ok) return setAviso("Não consegui copiar. Selecione o texto e copie à mão.");
    if (qual === "equipe") {
      await fetch(`/api/kits/${item.campanhaId}/entregue`, { method: "POST" }).catch(() => null);
      setAviso("Mensagem copiada. Cole no grupo da equipe.");
      router.refresh();
    } else setAviso("Copiado.");
    setTimeout(() => setAviso(null), 2500);
  }

  if (!item) return null;
  return (
    <div className="kit">
      {itens.length > 1 && (
        <div className="kit-campanhas" role="group" aria-label="Campanha">
          {itens.map((it, i) => (
            <button key={it.campanhaId} type="button" className="opcao" aria-pressed={i === sel} onClick={() => setSel(i)}>
              {it.rotulo}
            </button>
          ))}
        </div>
      )}

      {!kit ? (
        <p className="aviso">Esta campanha ficou sem kit: a geração e o template falharam ao gravar.</p>
      ) : (
        <>
          <div className="kit-cabeca">
            <span className="legenda">
              {item.rotulo} · {item.beneficio}
            </span>
            {kit.modelo ? (
              <span className="selo">texto do modelo · {kit.modelo}</span>
            ) : (
              <span className="selo selo-demo">texto fixo deste público: o modelo falhou ou escreveu algo genérico</span>
            )}
            {kit.entregue_em && (
              <span className="selo selo-resgatado">entregue à equipe em {dataHora.format(new Date(kit.entregue_em))}</span>
            )}
          </div>

          <div className="kit-abas" role="tablist" aria-label="Peças do kit">
            {ABAS.map((a) => (
              <button
                key={a.id}
                type="button"
                role="tab"
                id={`aba-${a.id}`}
                aria-selected={aba === a.id}
                aria-controls={`painel-${a.id}`}
                onClick={() => setAba(a.id)}
              >
                {a.rotulo}
              </button>
            ))}
          </div>

          <div className="kit-painel" role="tabpanel" id={`painel-${aba}`} aria-labelledby={`aba-${aba}`}>
            {aba === "script" && (
              <>
                <blockquote className="kit-script">{mostrarMarcador(kit.script_garcom)}</blockquote>
                <p className="legenda">
                  {contarPalavras(kit.script_garcom)} palavras · cerca de {segundosDeFala(kit.script_garcom)} s de fala
                </p>
              </>
            )}
            {aba === "equipe" && <p className="kit-mensagem">{kit.mensagem_equipe}</p>}
            {aba === "cartaz" && (
              <div className="kit-cartaz">
                <strong>{kit.cartaz_titulo}</strong>
                <span>{kit.cartaz_linha}</span>
              </div>
            )}
            <div className="kit-acoes">
              <button type="button" className="botao" onClick={() => copiarAba(aba)}>
                {aba === "equipe" ? (kit.entregue_em ? "Copiar de novo" : "Copiar e marcar como entregue") : "Copiar"}
              </button>
              {aviso && (
                <span className="legenda" role="status">
                  {aviso}
                </span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
