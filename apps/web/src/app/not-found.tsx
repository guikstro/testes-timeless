import Link from "next/link";

/**
 * Sem este arquivo o Next serve a própria 404 genérica, em inglês e sem
 * nenhuma relação visual com o resto do produto.
 *
 * Não é uma tela rara: `notFound()` é chamado em rotas reais — abrir um lead
 * que não existe (ou que pertence a outra organização) cai exatamente aqui.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-panel-soft p-6">
      <div className="w-full max-w-md rounded-xl border border-line bg-panel p-8 text-center">
        <p className="text-sm font-medium text-ink-mute">404</p>
        <h1 className="mt-2 font-display text-xl font-semibold tracking-tight text-ink">Página não encontrada</h1>
        <p className="mt-2 text-sm text-ink-mute">
          O endereço não existe ou o registro que você procura foi removido.
        </p>
        <Link
          href="/"
          className="focus-ring mt-6 inline-flex h-11 items-center rounded-full bg-ink px-5 text-sm font-medium text-canvas shadow-subtle transition-all duration-300 ease-soft hover:shadow-card active:scale-[0.97]"
        >
          Voltar ao início
        </Link>
      </div>
    </main>
  );
}
