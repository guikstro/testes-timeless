import Link from "next/link";
import { Sair } from "./sair";

const SITE_DO_CLIENTE = process.env.NEXT_PUBLIC_WEB_APP_URL ?? "http://localhost:3000";

interface Operador {
  email: string;
  platformRole: "SUPPORT" | "ADMIN";
}

/**
 * A moldura da administração.
 *
 * Duas diferenças em relação ao shell que ela tinha dentro do site do
 * cliente, e as duas vêm da separação:
 *
 * 1. **Não existe mais "estou dentro de um cliente" aqui.** A sessão desta
 *    origem é sempre a do operador; entrar num cliente acontece no site do
 *    cliente, com sessão dele. O aviso de impersonação e a conferência que o
 *    acompanhava deixaram de fazer sentido neste lado.
 *
 * 2. **O link para o painel do próprio operador é absoluto**, porque aponta
 *    para outro endereço. Ele também pode não levar a lugar nenhum útil: quem
 *    opera a plataforma não precisa ter organização própria.
 */
export function MolduraDaAdministracao({
  operador,
  children,
}: {
  operador: Operador;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-panel">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="min-w-0">
            <p className="text-rotulo font-semibold uppercase tracking-[0.16em] text-ink-mute">
              Timeless · Administração
            </p>
            <p className="mt-0.5 truncate text-apoio text-ink-soft">
              {operador.email} · {operador.platformRole === "ADMIN" ? "Administrador" : "Suporte"}
            </p>
          </div>

          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-corpo">
            <Link href="/" className="focus-ring rounded text-ink-mute transition-colors hover:text-ink">
              Clientes
            </Link>
            <Link href="/acessos" className="focus-ring rounded text-ink-mute transition-colors hover:text-ink">
              Acessos
            </Link>
            {/* Gestão de operadores é exclusiva de ADMIN. A API também barra;
                isto só evita oferecer um link que daria 403. */}
            {operador.platformRole === "ADMIN" ? (
              <Link href="/operadores" className="focus-ring rounded text-ink-mute transition-colors hover:text-ink">
                Operadores
              </Link>
            ) : null}
            <a
              href={SITE_DO_CLIENTE}
              className="focus-ring rounded text-ink-mute transition-colors hover:text-ink"
            >
              Ir para o painel
            </a>
            <Sair />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
