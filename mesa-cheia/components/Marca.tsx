import Link from "next/link";

/** Logo: quadrado com uma mesa ocupada no meio. */
export function Marca({ tamanho = 28 }: { tamanho?: number }) {
  return (
    <Link href="/" className="marca">
      <svg width={tamanho} height={tamanho} viewBox="0 0 28 28" aria-hidden="true">
        <rect x="1" y="1" width="26" height="26" rx="8" fill="none" stroke="#ff5a4e" strokeWidth="2" />
        <circle cx="14" cy="14" r="5" fill="#ff5a4e" />
      </svg>
      <span>Mesa Cheia</span>
    </Link>
  );
}
