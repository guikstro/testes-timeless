import { redirect } from "next/navigation";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { BrandStyle } from "@/components/brand-style";
import { LivingBackground } from "@/components/living-background";
import { AppNav } from "./app-nav";
import { ImpersonationHairline } from "./impersonation-banner";
import { AppMain } from "./app-main";
import { ConexaoDoWhatsApp, ConnectionStatus } from "./connection-status";
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

  /*
    A faixa do topo mostra o estado da conexão, então ele é buscado aqui. O
    try/catch não é zelo excessivo: sem ele, uma falha nesta consulta derruba
    o layout inteiro, e o app ficaria inacessível por causa de um indicador.
  */
  let conexao: ConexaoDoWhatsApp | null = null;
  try {
    conexao = await apiFetch<ConexaoDoWhatsApp | null>("/integrations/whatsapp");
  } catch {
    conexao = null;
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
          {/*
            Faixa fina no topo, grudada. Antes gastava cinquenta e três pixels
            para carregar um sino e nada mais; agora tem quarenta e cinco e
            diz se o WhatsApp está no ar, que é o sinal que decide se leads
            estão entrando.
          */}
          <div data-imprimir="esconder" className="sticky top-0 z-30 flex h-[var(--faixa-do-topo)] items-center justify-end gap-1 border-b border-line/60 bg-canvas/80 px-4 backdrop-blur-xl sm:px-6">
            {/*
              Ambos à direita, e não o estado à esquerda: a barra lateral
              expande sobre este canto, e um indicador que some quando o mouse
              passa no menu não serve como sinal permanente.
            */}
            <ConnectionStatus conexao={conexao} />
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
