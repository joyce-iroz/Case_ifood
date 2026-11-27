import { notFound } from "next/navigation";
import { Marca } from "@/components/Marca";
import { BotaoGarantir } from "@/components/BotaoGarantir";
import { carregarOferta } from "@/lib/oferta";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sua oferta · Mesa Cheia", robots: { index: false, follow: false } };

const quando = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** O que o cliente vê ao abrir o link da mensagem. Nenhum dado pessoal aparece aqui. */
export default async function PaginaOferta({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const o = await carregarOferta(token);
  if (!o) notFound();

  return (
    <main className="oferta-pagina">
      <p className="oferta-simulacao">
        Simulação da tela do cliente. No produto, a oferta chega no app em que ele pede comida ou por WhatsApp; o
        restaurante não vê esta tela.
      </p>
      <Marca />
      <section className={`oferta-cartao oferta-${o.estado}`}>
        <span className="oferta-casa">{o.restaurante}</span>
        <h1>{o.beneficio}</h1>
        <p className="oferta-quando">{o.validade}</p>

        {o.estado === "disponivel" && (
          <>
            <p className="oferta-vagas">
              <b>{o.vagasLivres}</b> {o.vagasLivres === 1 ? "vaga livre" : "vagas livres"} de {o.vagasTotal}
            </p>
            <BotaoGarantir token={token} />
            <p className="legenda">
              Confirme para garantir a sua. Sem confirmar, vale se ainda tiver vaga quando você chegar.
            </p>
          </>
        )}
        {o.estado === "garantida" && (
          <div className="oferta-ok">
            <b>Mesa garantida.</b>
            <span>
              Na hora da conta, diga seu telefone ao garçom. Vale até {quando.format(new Date(o.garantidaAte!))}.
            </span>
          </div>
        )}
        {o.estado === "esgotada" && (
          <div className="oferta-fim">
            <b>As vagas desta oferta acabaram.</b>
            <span>Que pena. A gente avisa na próxima.</span>
          </div>
        )}
        {o.estado === "usada" && (
          <div className="oferta-fim">
            <b>Você já usou esta oferta.</b>
            <span>Obrigado pela visita. Quando chegar outra, é só confirmar por aqui.</span>
          </div>
        )}
        {o.estado === "encerrada" && (
          <div className="oferta-fim">
            <b>Esta oferta terminou.</b>
            <span>A gente avisa na próxima.</span>
          </div>
        )}
      </section>
      <p className="legenda oferta-rodape">Oferta pessoal, vale uma vez. Não precisa mostrar cupom.</p>
    </main>
  );
}
