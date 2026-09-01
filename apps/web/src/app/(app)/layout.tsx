import { redirect } from "next/navigation";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { BrandStyle } from "@/components/brand-style";
import { LivingBackground } from "@/components/living-background";
import { AppNav } from "./app-nav";
import { ImpersonationHairline } from "./impersonation-banner";

interface SessionContext {
  user: { id: string; name: string; email: string; platformRole: "SUPPORT" | "ADMIN" | null };
  organization: { id: string; name: string; logoUrl: string | null; brandColor: string | null };
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
      {/* Não empurra nada: o fio flutua sobre a borda da janela. */}
      {session.impersonating ? <ImpersonationHairline /> : null}

      <BrandStyle brandColor={session.organization.brandColor} />
      <LivingBackground />

      <div className="flex flex-1">
        <AppNav
          organizationName={session.organization.name}
          logoUrl={session.organization.logoUrl}
          // Só na sessão própria do operador: de dentro de um cliente, o
          // caminho de volta é o botão "Sair do cliente".
          showAdmin={Boolean(session.user.platformRole) && !session.impersonating}
          impersonating={session.impersonating}
        />
        <main className="min-w-0 flex-1">
          {/* `key` na rota faz a entrada tocar a cada navegação, em vez de só
              na primeira montagem do layout. */}
          <div className="animate-rise-in p-6 sm:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
