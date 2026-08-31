import Link from "next/link";
import { redirect } from "next/navigation";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { LeaveClientNotice } from "./leave-client-notice";

interface SessionContext {
  user: { id: string; name: string; email: string; platformRole: "SUPPORT" | "ADMIN" | null };
  impersonating: boolean;
}

/**
 * Shell da administração da plataforma, separado do shell do cliente
 * (`(app)/layout.tsx`) de propósito: aquele exige uma organização, e um
 * operador da plataforma não precisa pertencer a nenhuma.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let session: SessionContext;
  try {
    session = await apiFetch<SessionContext>("/auth/session");
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) {
      redirect("/login");
    }
    throw error;
  }

  // A API já barra estas rotas pelo PlatformAdminGuard; esconder a tela é
  // só para não exibir um shell vazio a quem não pode usá-lo.
  if (!session.user.platformRole) {
    redirect("/dashboard");
  }

  // Estar dentro de um cliente não é erro, é uma situação prevista com saída
  // conhecida. Deixar a chamada seguinte estourar mostraria uma tela de
  // exceção para algo que se resolve com um botão.
  if (session.impersonating) {
    return <LeaveClientNotice />;
  }

  return (
    <div className="min-h-screen bg-panel-soft">
      <header className="border-b border-line bg-ink">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm font-semibold text-canvas">Administração da plataforma</p>
            <p className="text-xs text-ink-mute">
              {session.user.email} · {session.user.platformRole === "ADMIN" ? "Administrador" : "Suporte"}
            </p>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/admin" className="text-ink-mute hover:text-canvas">
              Clientes
            </Link>
            <Link href="/admin/acessos" className="text-ink-mute hover:text-canvas">
              Acessos
            </Link>
            {/* Gestão de operadores é exclusiva de ADMIN — a API também
                barra, isto só evita oferecer um link que daria 403. */}
            {session.user.platformRole === "ADMIN" ? (
              <Link href="/admin/operadores" className="text-ink-mute hover:text-canvas">
                Operadores
              </Link>
            ) : null}
            <Link href="/dashboard" className="text-ink-mute hover:text-canvas">
              Minha organização
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
