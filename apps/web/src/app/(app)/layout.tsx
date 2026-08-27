import Link from "next/link";
import { redirect } from "next/navigation";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { LogoutButton } from "./logout-button";
import { ImpersonationBanner } from "./impersonation-banner";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/leads", label: "Leads" },
  { href: "/links", label: "Links" },
  { href: "/integrations", label: "Integrações" },
  { href: "/settings", label: "Configurações" },
];

interface SessionContext {
  user: { id: string; name: string; email: string; platformRole: "SUPPORT" | "ADMIN" | null };
  organization: { id: string; name: string };
  impersonating: boolean;
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let session: SessionContext;
  try {
    session = await apiFetch<SessionContext>("/auth/session");
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) {
      redirect("/login");
    }
    throw error;
  }

  return (
    <div className="flex min-h-screen flex-col">
      {session.impersonating ? <ImpersonationBanner organizationName={session.organization.name} /> : null}

      <div className="flex flex-1">
        <aside className="flex w-56 flex-col border-r border-slate-200 bg-white px-4 py-6">
          <div className="mb-8 px-2">
            <p className="text-sm font-semibold text-slate-900">{session.organization.name}</p>
          </div>
          <nav className="flex flex-1 flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-2 py-2 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Só aparece na sessão própria do operador: de dentro de um
              cliente, o caminho de volta é o botão "Sair do cliente". */}
          {session.user.platformRole && !session.impersonating ? (
            <Link
              href="/admin"
              className="mb-3 rounded-md bg-slate-900 px-2 py-2 text-center text-sm font-medium text-white hover:bg-slate-800"
            >
              Administração
            </Link>
          ) : null}

          <LogoutButton />
        </aside>
        <main className="flex-1 bg-slate-50 p-8">{children}</main>
      </div>
    </div>
  );
}
