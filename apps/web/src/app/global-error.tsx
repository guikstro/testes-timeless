"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body>
        <main style={{ padding: "3rem 1.5rem", textAlign: "center" }}>
          <h1>Algo deu errado</h1>
          <p>Ocorreu um erro inesperado. Tente novamente.</p>
          <button type="button" onClick={() => reset()}>
            Tentar novamente
          </button>
        </main>
      </body>
    </html>
  );
}
