"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { mostrarMarcador, segundosDeFala } from "@/lib/kit-regras";
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

  const [escrevendo, setEscrevendo] = useState(false);
  const [falhaModelo, setFalhaModelo] = useState<string | null>(null);

  // Requisição própria, separada da proposta do planejador: o limite por minuto do
  // plano gratuito não derruba as duas juntas.
  async function escreverComModelo() {
    if (!item || escrevendo) return;
    setEscrevendo(true);
    setFalhaModelo(null);
    try {
      const r = await fetch(`/api/kits/${item.campanhaId}/escrever`, { method: "POST" });
      const j = (await r.json()) as { ok: boolean; erro?: string };
      if (!j.ok) setFalhaModelo(j.erro ?? "O modelo não respondeu.");
      else router.refresh();
    } catch {
      setFalhaModelo("Sem conexão. Tente de novo.");
    } finally {
      setEscrevendo(false);
    }
  }

  // Edição pelo dono: os quatro textos de uma vez; o servidor confere as mesmas regras.
  const [editando, setEditando] = useState<null | Record<"script_garcom" | "mensagem_equipe" | "cartaz_titulo" | "cartaz_linha", string>>(null);
  const [errosEdicao, setErrosEdicao] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);

  async function salvarEdicao() {
    if (!item || !editando || salvando) return;
    setSalvando(true);
    setErrosEdicao([]);
    try {
      const r = await fetch(`/api/kits/${item.campanhaId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(editando),
      });
      const j = (await r.json()) as { ok: boolean; erros?: string[] };
      if (!j.ok) setErrosEdicao(j.erros ?? ["Não deu para salvar."]);
      else {
        setEditando(null);
        router.refresh();
      }
    } catch {
      setErrosEdicao(["Sem conexão. Tente de novo."]);
    } finally {
      setSalvando(false);
    }
  }

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
        <div className="aviso">
          <p>Esta campanha ficou sem kit: o texto fixo não foi gravado.</p>
          <button type="button" className="botao" onClick={escreverComModelo} disabled={escrevendo}>
            {escrevendo ? "Escrevendo…" : "Escrever com IA"}
          </button>
          {falhaModelo && <p>{falhaModelo}</p>}
        </div>
      ) : (
        <>
          <div className="kit-cabeca">
            <span className="legenda">
              {item.rotulo} · {item.beneficio}
            </span>
            {kit.modelo === "dono" ? (
              <span className="selo">texto editado por você</span>
            ) : kit.modelo ? (
              <span className="selo">texto da IA</span>
            ) : (
              <span className="selo selo-demo">texto fixo deste público</span>
            )}
            {!editando && (
              <button
                type="button"
                className="botao"
                onClick={() => {
                  setErrosEdicao([]);
                  setEditando({
                    script_garcom: mostrarMarcador(kit.script_garcom).replace("[nome do cliente], ", ""),
                    mensagem_equipe: kit.mensagem_equipe,
                    cartaz_titulo: kit.cartaz_titulo,
                    cartaz_linha: kit.cartaz_linha,
                  });
                }}
              >
                Editar
              </button>
            )}
            <button type="button" className="botao botao-ia" onClick={escreverComModelo} disabled={escrevendo}>
              {escrevendo ? "Escrevendo…" : kit.modelo ? "Reescrever com IA" : "Escrever com IA"}
            </button>
            {kit.entregue_em && (
              <span className="selo selo-resgatado">entregue à equipe em {dataHora.format(new Date(kit.entregue_em))}</span>
            )}
          </div>

          {falhaModelo && <p className="aviso kit-falha">{falhaModelo}</p>}
          {kit.substituido && (
            <p className="legenda kit-falha">
              O texto anterior não seguia as regras (pedia telefone ou soava como desconto para todos). Mostrando o texto fixo
              deste público.
            </p>
          )}

          {editando && (
            <div className="kit-edicao">
              {(
                [
                  ["script_garcom", "Script do garçom", "Lido só para quem tem desconto, depois que a tela confirmar.", 3],
                  ["mensagem_equipe", "Mensagem para a equipe", "Vai para o grupo da equipe.", 4],
                  ["cartaz_titulo", "Título do cartaz", "Até 6 palavras. Todas as mesas leem.", 1],
                  ["cartaz_linha", "Linha do cartaz", "Como usar: falar com quem recebeu a mensagem.", 2],
                ] as const
              ).map(([campo, rotulo, ajuda, linhas]) => (
                <label key={campo} className="campo">
                  {rotulo}
                  <textarea
                    rows={linhas}
                    value={editando[campo]}
                    onChange={(e) => setEditando({ ...editando, [campo]: e.target.value })}
                  />
                  <small className="legenda">{ajuda}</small>
                </label>
              ))}
              {errosEdicao.length > 0 && (
                <ul className="aviso kit-erros">
                  {errosEdicao.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}
              <div className="kit-acoes">
                <button type="button" className="botao primario" onClick={salvarEdicao} disabled={salvando}>
                  {salvando ? "Salvando…" : "Salvar"}
                </button>
                <button type="button" className="botao" onClick={() => setEditando(null)} disabled={salvando}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          <div className="kit-abas" role="tablist" aria-label="Peças do kit" hidden={!!editando}>
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

          <div className="kit-painel" hidden={!!editando} role="tabpanel" id={`painel-${aba}`} aria-labelledby={`aba-${aba}`}>
            {aba === "script" && (
              <>
                <blockquote className="kit-script">{mostrarMarcador(kit.script_garcom)}</blockquote>
                <p className="legenda">
                  Só para quem tem desconto, depois que a tela confirmar · cerca de {segundosDeFala(kit.script_garcom)} s de fala
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
