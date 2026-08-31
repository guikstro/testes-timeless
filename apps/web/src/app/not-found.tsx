import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{ padding: "3rem 1.5rem", textAlign: "center" }}>
      <h1>404 — Página não encontrada</h1>
      <p>O endereço acessado não existe ou o registro não está mais disponível.</p>
      <Link href="/">Voltar para o início</Link>
    </main>
  );
}
