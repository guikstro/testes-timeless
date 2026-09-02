import { redirect } from "next/navigation";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { BrandStyle } from "@/components/brand-style";
import { LivingBackground } from "@/components/living-background";
import { AppNav } from "./app-nav";
import { ImpersonationHairline } from "./impersonation-banner";
import { AppMain } from "./app-main";
import { NotificationProvider } from "@/components/notifications/notification-provider";
import { NotificationToasts } from "@/components/notifications/notification-toasts";
import { NotificationBell } from "@/components/notifications/notification-bell";

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
    <NotificationProvider>
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
          {/*
            Faixa fina no topo, grudada: o sino precisa estar visível de
            qualquer tela, porque o lead chega enquanto o operador está em
            outro lugar do sistema. Sem fundo sólido ela deixaria o conteúdo
            passar por baixo ao rolar.
          */}
          <div className="sticky top-0 z-30 flex justify-end gap-1 border-b border-line/60 bg-canvas/80 px-6 py-2 backdrop-blur-xl sm:px-8">
            <NotificationBell />
          </div>

          {/* `key` na rota faz a entrada tocar a cada navegação, em vez de só
              na primeira montagem do layout. */}
          <AppMain>{children}</AppMain>
        </main>
      </div>

      <NotificationToasts />
    </div>
    </NotificationProvider>
  );
}
