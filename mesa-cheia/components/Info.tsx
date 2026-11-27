/** Ícone "i" com explicação ao passar o mouse ou focar (teclado). Sem estado. */
export function Info({ texto }: { texto: string }) {
  return (
    <span className="info" tabIndex={0} role="img" aria-label={texto}>
      <span aria-hidden="true">i</span>
      <span className="info-balao" aria-hidden="true">
        {texto}
      </span>
    </span>
  );
}
