"use client";

import { useMemo, useState } from "react";
import { NOMES_DIA, formatarMoeda, ordenarDiasSemana } from "@/lib/dominio";
import { lerNumeroBR } from "@/lib/numero";
import {
  META_RECUPERACAO,
  OCUPACAO_NIVEL,
  PERMANENCIA_H,
  SEMANAS_MES,
  diagnosticar,
  type EntradaDiagnostico,
  type Nivel,
} from "@/lib/diagnostico";

const fmt = new Intl.NumberFormat("pt-BR");
const ROTULO: Record<Nivel, string> = { cheio: "cheio", medio: "médio", vazio: "vazio" };
const PROXIMO: Record<Nivel, Nivel> = { medio: "vazio", vazio: "cheio", cheio: "medio" };
const TURNOS = [
  { nome: "Almoço", inicio: 11, fim: 15 },
  { nome: "Jantar", inicio: 18, fim: 23 },
];
const TODOS_DIAS = ordenarDiasSemana([0, 1, 2, 3, 4, 5, 6]);

export function Diagnostico() {
  const [capacidade, setCapacidade] = useState("64");
  const [ticket, setTicket] = useState("78");
  const [dias, setDias] = useState<number[]>([2, 3, 4, 5, 6, 0]);
  const [niveis, setNiveis] = useState<Record<string, Nivel>>({
    "2-0": "vazio", "2-1": "vazio", "3-0": "medio", "3-1": "vazio", "4-0": "medio", "4-1": "medio",
    "5-0": "medio", "5-1": "cheio", "6-0": "cheio", "6-1": "cheio", "0-0": "cheio", "0-1": "medio",
  });
  const [nome, setNome] = useState("");
  const [contato, setContato] = useState("");
  const [envio, setEnvio] = useState<{ ok: boolean; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  const entrada: EntradaDiagnostico | null = useMemo(() => {
    const cap = lerNumeroBR(capacidade);
    const t = lerNumeroBR(ticket);
    if (!Number.isInteger(cap) || cap < 1 || !(t > 0)) return null;
    return { capacidade: cap, ticketMedio: t, turnos: TURNOS, dias, niveis };
  }, [capacidade, ticket, dias, niveis]);
  const r = entrada ? diagnosticar(entrada) : null;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!entrada || enviando) return;
    setEnviando(true);
    setEnvio(null);
    try {
      const resp = await fetch("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nome, contato, entrada }),
      });
      const j = await resp.json();
      if (!resp.ok) throw new Error(j.erro ?? "Falha ao enviar");
      setEnvio({ ok: true, texto: "Recebido. Vamos entrar em contato para ligar o Mesa Cheia na sua casa." });
    } catch (err) {
      setEnvio({ ok: false, texto: err instanceof Error ? err.message : "Falha ao enviar" });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="duas-colunas">
      <section className="cartao-painel ocupacao" aria-labelledby="t-sua-casa">
        <h2 id="t-sua-casa">Sua casa</h2>
        <div className="duas">
          <label className="campo">
            Lugares no salão
            <span className="entrada">
              <input inputMode="numeric" value={capacidade} onChange={(e) => setCapacidade(e.target.value)} />
            </span>
          </label>
          <label className="campo">
            Ticket médio
            <span className="entrada">
              <span>R$</span>
              <input inputMode="decimal" value={ticket} onChange={(e) => setTicket(e.target.value)} />
            </span>
          </label>
        </div>

        <div className="campo" style={{ marginTop: 16 }}>
          <span id="rot-dias">Dias abertos</span>
          <div className="dias dias-7" role="group" aria-labelledby="rot-dias">
            {TODOS_DIAS.map((d) => (
              <button
                key={d}
                type="button"
                className="opcao"
                aria-pressed={dias.includes(d)}
                onClick={() => setDias((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d]))}
              >
                {NOMES_DIA[d]}
              </button>
            ))}
          </div>
        </div>

        <div className="campo" style={{ marginTop: 16 }}>
          <span>Como costuma estar cada turno? Toque para trocar.</span>
          <div className="rolagem">
            <table className="grade grade-diagnostico">
              <thead>
                <tr>
                  <th />
                  {ordenarDiasSemana(dias).map((d) => (
                    <th key={d} scope="col">{NOMES_DIA[d]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TURNOS.map((t, i) => (
                  <tr key={t.nome}>
                    <th scope="row">{t.nome}</th>
                    {ordenarDiasSemana(dias).map((d) => {
                      const k = `${d}-${i}`;
                      const n = niveis[k] ?? "medio";
                      return (
                        <td key={k} className={n === "vazio" ? "c-v3" : n === "medio" ? "c-n1" : "c-n3"}>
                          <button
                            type="button"
                            className="nivel"
                            onClick={() => setNiveis((x) => ({ ...x, [k]: PROXIMO[n] }))}
                            aria-label={`${NOMES_DIA[d]} ${t.nome}: ${ROTULO[n]}. Toque para trocar.`}
                          >
                            {ROTULO[n]}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <div className="coluna-direita">
        <section className="cartao-painel" aria-labelledby="t-res-diag">
          <h2 id="t-res-diag">O que o diagnóstico mostra</h2>
          {!r ? (
            <p className="legenda">Preencha lugares e ticket médio.</p>
          ) : (
            <div className="diag-resultado">
              <div>
                <span className="kpi-rotulo">Cadeiras-hora vazias por mês</span>
                <span className="kpi-valor destaque">{fmt.format(r.vaziasMes)}</span>
              </div>
              <div>
                <span className="kpi-rotulo">Turnos com mais cadeiras vazias</span>
                <ul className="diag-piores">
                  {r.piores.map((p) => (
                    <li key={p.rotulo}>
                      <b>{p.rotulo}</b> · {fmt.format(p.vazias)} cadeiras-hora vazias por semana ({p.ocupacao}% de ocupação)
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <span className="kpi-rotulo">Recuperando {Math.round(META_RECUPERACAO * 100)}% dos turnos vazios</span>
                <span className="kpi-valor verde">{formatarMoeda(r.receitaMes)}</span>
                <span className="kpi-nota">
                  por mês em contas novas · {fmt.format(r.recuperavelMes)} cadeiras-hora
                </span>
              </div>
              <p className="premissa">
                Premissas: cheio = {OCUPACAO_NIVEL.cheio * 100}%, médio = {OCUPACAO_NIVEL.medio * 100}%, vazio ={" "}
                {OCUPACAO_NIVEL.vazio * 100}% de ocupação; {String(SEMANAS_MES).replace(".", ",")} semanas por mês; cada
                mesa fica {String(PERMANENCIA_H).replace(".", ",")}h; uma conta por cadeira recuperada, no ticket médio.
                Com o Mesa Cheia, a grade sai do seu histórico real, não de estimativa.
              </p>
            </div>
          )}
        </section>

        <section className="cartao-painel" aria-labelledby="t-quero">
          <h2 id="t-quero">Quero testar na minha casa</h2>
          <form className="form-regras" onSubmit={enviar}>
            <label className="campo">
              Nome do restaurante
              <span className="entrada">
                <input value={nome} onChange={(e) => setNome(e.target.value)} required />
              </span>
            </label>
            <label className="campo">
              E-mail ou WhatsApp
              <span className="entrada">
                <input value={contato} onChange={(e) => setContato(e.target.value)} required />
              </span>
            </label>
            <button className="botao primario" disabled={enviando || !r}>
              {enviando ? "Enviando…" : "Quero o Mesa Cheia"}
            </button>
            {envio && <p className={envio.ok ? "sucesso" : "erro"}>{envio.texto}</p>}
            <p className="legenda">Você só paga pelo cliente que não viria de qualquer jeito.</p>
          </form>
        </section>
      </div>
    </div>
  );
}
