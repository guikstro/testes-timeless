"use client";

/**
 * Último recurso: substitui o layout raiz inteiro, inclusive o `<html>`.
 *
 * Por isso o estilo é inline e não Tailwind — o `globals.css` é importado
 * pelo layout, que neste caminho não chegou a renderizar. Classes aqui
 * simplesmente não teriam efeito, e a tela de erro apareceria sem formatação
 * nenhuma justamente no momento em que algo já deu errado.
 */
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
