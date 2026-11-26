import Link from "next/link";

export default function Salao() {
  return (
    <main className="pagina">
      <div className="topo">
        <h1>Salão</h1>
        <Link href="/" className="voltar">← Trocar papel</Link>
      </div>
      <p className="legenda">A aplicação de benefícios na conta chega na próxima etapa.</p>
    </main>
  );
}
