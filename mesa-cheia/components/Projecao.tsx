import { formatarMoeda } from "@/lib/dominio";
import type { Projecao } from "@/lib/projecao";
import { Info } from "./Info";

const pct = (v: number) => `${String(Math.round(v * 1000) / 10).replace(".", ",")}%`;

const horas = (h: number) => `${String(Math.round(h * 10) / 10).replace(".", ",")}h`;

/** Como a conta foi feita, para o ícone "i". Fica fora da tela principal. */
function comoCalcula(p: Projecao): string {
  const base =
    p.base === "historico"
      ? `Base: campanhas anteriores deste público, ${pct(p.taxaReferencia)} usaram o desconto (de ${formatarMoeda(p.descontoRef)}, em janela de ${horas(p.horasRef)}).`
      : `Sem campanha anterior deste público: estimativa de ${pct(p.taxaReferencia)} de uso, para desconto de ${formatarMoeda(p.descontoRef)} em janela de ${horas(p.horasRef)}.`;
  const ajuste =
    Math.abs(p.taxaBase - p.taxaReferencia) > 0.0005
      ? ` Com este desconto e esta janela, vira ${pct(p.taxaBase)}: desconto ou janela 2x maior trazem ~41% mais uso.`
      : "";
  const semanas = p.semanas > 1 ? ` Cada semana a mais soma metade disso, até dobrar.` : "";
  return `${base}${ajuste}${semanas} Desconto típico de ${formatarMoeda(p.descontoMedio)} numa conta de ticket médio.`;
}

/** Retorno esperado de uma campanha. Sem estado: serve ao planejador e ao formulário. */
export function ProjecaoView({ projecao, controle }: { projecao: Projecao; controle: number }) {
  const p = projecao;
  return (
    <div className="projecao" aria-live="polite">
      <div className="projecao-cabeca">
        <b>Retorno esperado</b>
        <Info texto={comoCalcula(p)} />
      </div>
      <div className="projecao-numeros">
        <div>
          <span>Resgates</span>
          <b>{p.resgates}</b>
        </div>
        <div>
          <span>Clientes novos</span>
          <b className={p.incrementais > 0 ? "verde" : undefined}>{p.incrementais}</b>
        </div>
        <div>
          <span>Receita nova</span>
          <b className={p.receitaIncremental > 0 ? "verde" : undefined}>{formatarMoeda(p.receitaIncremental)}</b>
        </div>
        <div>
          <span>Custo esperado</span>
          <b>{formatarMoeda(p.custo)}</b>
        </div>
        <div>
          <span>Custo por cliente novo</span>
          <b className={p.custoPorIncremental === null ? "alerta-texto" : undefined}>
            {p.custoPorIncremental === null ? "sem cliente novo" : formatarMoeda(p.custoPorIncremental)}
          </b>
        </div>
      </div>
      <p className="legenda">
        {p.emitidos} recebem a oferta
        {controle > 0 ? `; ${controle} ficam de fora para medir o efeito real.` : "."}
      </p>
      {p.limitadoPeloTeto && (
        <p className="aviso projecao-teto">
          O teto paga só {p.cabeNoTeto} descontos, e a procura esperada é de {p.demanda}. Suba o teto ou baixe o desconto.
        </p>
      )}
    </div>
  );
}
