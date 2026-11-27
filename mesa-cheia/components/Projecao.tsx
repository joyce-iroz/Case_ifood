import { formatarMoeda } from "@/lib/dominio";
import type { Projecao } from "@/lib/projecao";

const pct = (v: number) => `${String(Math.round(v * 1000) / 10).replace(".", ",")}%`;

/** Retorno esperado de uma campanha. Sem estado: serve ao planejador e ao formulário. */
export function ProjecaoView({ projecao, controle }: { projecao: Projecao; controle: number }) {
  const p = projecao;
  return (
    <div className="projecao" aria-live="polite">
      <div className="projecao-cabeca">
        <b>Retorno esperado</b>
        <span className="legenda">
          {p.base === "historico"
            ? `pelo histórico deste segmento: ${pct(p.taxaReferencia)} de resgate com desconto de ${formatarMoeda(p.descontoRef)}, ${pct(p.taxaIncremental)} incrementais`
            : `sem histórico deste segmento: ${pct(p.taxaReferencia)} de resgate (padrão, com desconto de ${formatarMoeda(p.descontoRef)}), ${pct(p.taxaIncremental)} incrementais pela definição do segmento`}
        </span>
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
        {p.emitidos} recebem o benefício
        {controle > 0 ? `; ${controle} sorteados ficam no grupo de controle, sem benefício, para medir o efeito real.` : "."}{" "}
        Desconto típico de {formatarMoeda(p.descontoMedio)} por conta de ticket médio
        {Math.abs(p.taxaBase - p.taxaReferencia) > 0.0005
          ? `; com ele, a taxa de resgate passa de ${pct(p.taxaReferencia)} para ${pct(p.taxaBase)} (premissa: a taxa acompanha a raiz da razão entre os descontos; o dobro do desconto traz cerca de 41% mais resgates).`
          : "."}
        {p.semanas > 1 &&
          ` Com ${p.semanas} semanas, premissa: cada semana extra soma metade da taxa de uma semana (${pct(p.taxaBase)}), até dobrar; cada benefício continua valendo um resgate só.`}
      </p>
      {p.limitadoPeloTeto && (
        <p className="aviso projecao-teto">
          O teto limita a campanha: a procura esperada é de {p.demanda} resgates, mas o teto paga só {p.cabeNoTeto}{" "}
          descontos de {formatarMoeda(p.descontoMedio)}. Depois disso o salão aplica desconto zero. Suba o teto ou baixe o
          desconto para atender todos.
        </p>
      )}
    </div>
  );
}
