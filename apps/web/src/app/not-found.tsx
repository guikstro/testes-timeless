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
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center">
        <p className="text-sm font-medium text-slate-400">404</p>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">Página não encontrada</h1>
        <p className="mt-2 text-sm text-slate-500">
          O endereço não existe ou o registro que você procura foi removido.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Voltar ao início
        </Link>
      </div>
    </main>
  );
}
