import Link from "next/link";

export default function Inicio() {
  return (
    <main className="pagina">
      <h1>Mesa Cheia</h1>
      <p className="legenda">Cantina do Bairro · escolha como você vai usar o app agora.</p>
      <div className="papeis">
        <Link href="/dono" className="papel">
          <strong>Sou o dono</strong>
          <span>Ver os horários vazios e aprovar campanhas.</span>
        </Link>
        <Link href="/salao" className="papel">
          <strong>Sou o salão</strong>
          <span>Aplicar o benefício do cliente na conta.</span>
        </Link>
      </div>
    </main>
  );
}
