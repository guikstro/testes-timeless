import Link from "next/link";
import { redirect } from "next/navigation";
import { apiFetch, ApiRequestError } from "@/lib/api-client";

interface SessionContext {
  user: { id: string; name: string; email: string; isPlatformAdmin: boolean };
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
  if (!session.user.isPlatformAdmin) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-800 bg-slate-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm font-semibold text-white">Administração da plataforma</p>
            <p className="text-xs text-slate-400">{session.user.email}</p>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/admin" className="text-slate-300 hover:text-white">
              Clientes
            </Link>
            <Link href="/admin/acessos" className="text-slate-300 hover:text-white">
              Acessos
            </Link>
            <Link href="/dashboard" className="text-slate-300 hover:text-white">
              Minha organização
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
