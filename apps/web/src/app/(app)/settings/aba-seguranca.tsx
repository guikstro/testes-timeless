import { apiFetch } from "@/lib/api-client";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/skeleton";
import { dataCompleta, tempoRelativo } from "@/lib/relative-time";
import { FormularioDeEmail, FormularioDeSenha } from "./security-forms";

interface SupportAccess {
  id: string;
  createdAt: string;
  user: { name: string; email: string } | null;
}

export async function AbaSeguranca({
  emailAtual,
  impersonando,
}: {
  emailAtual: string;
  impersonando: boolean;
}) {
  const acessos = await apiFetch<SupportAccess[]>("/organizations/current/support-accesses");

  return (
    <div className="space-y-5">
      {/*
        Numa visita de suporte, o token continua sendo do operador da
        plataforma: a senha atual que ele conhece é a dele. A API recusa, e
        esconder os formulários evita a pessoa preencher para tomar erro.
      */}
      {impersonando ? (
        <Card className="border-amber-300/60 bg-amber-50 p-5 dark:border-amber-900/60 dark:bg-amber-950/40">
          <p className="text-corpo leading-relaxed text-amber-900 dark:text-amber-100">
            Você está dentro de um cliente como operador da plataforma. Trocar senha ou e-mail está bloqueado aqui,
            de propósito: as credenciais são de quem é dono da conta.
          </p>
        </Card>
      ) : (
        <>
          <Card className="p-6">
            <CardHeader
              title="Senha"
              description="Trocar a senha desconecta os outros aparelhos onde a conta estiver aberta."
              className="mb-5"
            />
            <FormularioDeSenha />
          </Card>

          <Card className="p-6">
            <CardHeader
              title="E-mail de acesso"
              description="É com ele que você entra e que a recuperação de senha funciona."
              className="mb-5"
            />
            <FormularioDeEmail emailAtual={emailAtual} />
          </Card>
        </>
      )}

      <Card className="p-6">
        <CardHeader
          title="Acessos do suporte à sua conta"
          description="Sempre que alguém da nossa equipe entra na sua conta para dar suporte, o acesso aparece aqui."
          className="mb-5"
        />

        {acessos.length === 0 ? (
          <EmptyState
            title="Ninguém da nossa equipe acessou sua conta"
            description="Se algum dia acontecer, o registro aparece aqui com quem entrou e quando."
          />
        ) : (
          <ul className="divide-y divide-line/60 overflow-hidden rounded-xl border border-line/70">
            {acessos.map((acesso) => (
              <li key={acesso.id} className="flex items-center justify-between gap-4 px-3.5 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-corpo text-ink">{acesso.user?.name ?? "Usuário removido"}</span>
                  {acesso.user?.email ? (
                    <span className="block truncate text-rotulo text-ink-mute">{acesso.user.email}</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-apoio text-ink-mute" title={dataCompleta(acesso.createdAt)}>
                  {tempoRelativo(acesso.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
