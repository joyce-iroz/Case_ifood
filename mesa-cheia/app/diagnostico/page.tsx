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
            <Link href="/">Ver a demonstração</Link>
          </nav>
        </div>
      </header>
      <main className="pagina diagnostico">
        <section className="diag-promessa" aria-labelledby="t-promessa">
          <h1 id="t-promessa">
            Você só paga pelo cliente <span className="vermelho">que nunca veio.</span>
          </h1>
          <p>
            A cobrança é por cliente novo na mesa: quem pede seu delivery e nunca entrou, quem come comida como a sua em
            outro lugar, quem sumiu. Quem já vinha naquele horário não conta.
          </p>
          <ul className="diag-provas">
            <li>
              <b>Medido, não estimado.</b> 20% dos clientes ficam sem a oferta. A diferença entre os grupos é o que a
              campanha trouxe.
            </li>
            <li>
              <b>Você põe o limite.</b> Teto do mês e desconto máximo. Nada passa disso.
            </li>
            <li>
              <b>Para sozinha.</b> Se o horário encheu, a campanha pausa.
            </li>
          </ul>
        </section>
        <div className="diagnostico-intro">
          <h2>Quantas mesas o seu salão deixa vazias?</h2>
          <p className="legenda">Marque como costuma estar cada turno.</p>
        </div>
        <Diagnostico />
      </main>
    </>
  );
}
