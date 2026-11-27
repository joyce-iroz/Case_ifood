import Link from "next/link";
import { Marca } from "@/components/Marca";
import { Diagnostico } from "@/components/Diagnostico";

export const metadata = { title: "Diagnóstico de mesas vazias · Mesa Cheia" };

export default function PaginaDiagnostico() {
  return (
    <>
      <header className="barra">
        <div className="barra-conteudo">
          <Marca />
          <nav className="papeis-nav" aria-label="Navegação">
            <Link href="/">Início</Link>
          </nav>
        </div>
      </header>
      <main className="pagina diagnostico">
        <section className="diag-promessa" aria-labelledby="t-promessa">
          <h1 id="t-promessa">
            Você só paga pelo cliente <span className="vermelho">que nunca veio.</span>
          </h1>
          <p>
            O Mesa Cheia cobra por cliente novo sentado na mesa: quem pede seu delivery e nunca entrou no salão, quem
            pede comida como a sua em outro restaurante da região, quem sumiu há meses. Cliente que já vinha naquele
            horário não entra na conta.
          </p>
          <ul className="diag-provas">
            <li>
              <b>Medido, não estimado.</b> 20% dos clientes de cada campanha ficam sem a oferta. A diferença de visitas
              entre os dois grupos é o que a campanha trouxe.
            </li>
            <li>
              <b>Você põe o limite.</b> Teto de desconto por mês, desconto máximo por conta e ocupação mínima. Campanha
              fora disso não sai.
            </li>
            <li>
              <b>Para sozinha.</b> Se o horário encheu, a campanha pausa e os benefícios que sobraram expiram.
            </li>
          </ul>
        </section>
        <div className="diagnostico-intro">
          <h2>Quantas mesas o seu salão deixa vazias?</h2>
          <p className="legenda">
            Marque como costuma estar cada turno. Em um minuto você vê as cadeiras-hora vazias por mês e quanto daria
            para recuperar nos horários fracos.
          </p>
        </div>
        <Diagnostico />
      </main>
    </>
  );
}
