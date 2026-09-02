import { apiFetch } from "@/lib/api-client";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/skeleton";
import { dataCompleta, tempoRelativo } from "@/lib/relative-time";
import { BrandForm } from "./brand-form";
import { CreateRuleForm } from "./create-rule-form";
import { DeleteRuleButton } from "./delete-rule-button";

interface ClassificationRule {
  id: string;
  targetStatus: "QUALIFIED" | "MEETING_SCHEDULED" | "WON";
  phrase: string;
  createdAt: string;
}

/** O que cada gatilho faz, com o tom do estágio para onde ele leva. */
const ALVO: Record<ClassificationRule["targetStatus"], { rotulo: string; tom: "info" | "warning" | "success" }> = {
  QUALIFIED: { rotulo: "Qualifica o lead", tom: "info" },
  MEETING_SCHEDULED: { rotulo: "Marca reunião", tom: "warning" },
  WON: { rotulo: "Marca venda", tom: "success" },
};

interface SupportAccess {
  id: string;
  createdAt: string;
  user: { name: string; email: string } | null;
}

interface Organization {
  name: string;
  logoUrl: string | null;
  brandColor: string | null;
}

export default async function SettingsPage() {
  // Independentes: buscados em paralelo em vez de um depois do outro.
  const [rules, supportAccesses, organization] = await Promise.all([
    apiFetch<ClassificationRule[]>("/classification-rules"),
    apiFetch<SupportAccess[]>("/organizations/current/support-accesses"),
    apiFetch<Organization>("/organizations/current"),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Configurações</h1>
      <p className="mb-6 mt-1 text-corpo text-ink-mute">Identidade visual, gatilhos e acessos.</p>

      {/*
        As três seções em cartões iguais. Antes uma era cartão e as outras duas
        eram título solto com tabela embaixo, e a tela parecia três telas
        empilhadas em vez de uma.
      */}
      <div className="space-y-5">
        <Card className="p-6">
          <CardHeader
            title="Identidade da empresa"
            description="A logo e a cor aparecem no menu, nos botões e nos destaques da plataforma."
            className="mb-6"
          />
          <BrandForm
            organizationName={organization.name}
            logoUrl={organization.logoUrl}
            brandColor={organization.brandColor}
          />
        </Card>

        <Card className="p-6">
          <CardHeader
            title="Gatilhos de qualificação e venda"
            description="Quando uma mensagem recebida contiver a frase exata, sem diferenciar maiúsculas de minúsculas, o lead muda de estágio sozinho."
            className="mb-5"
          />

          <div className="mb-5">
            <CreateRuleForm />
          </div>

          {rules.length === 0 ? (
            <EmptyState
              title="Nenhum gatilho configurado"
              description="Sem gatilhos, o funil só anda quando alguém move o lead à mão."
            />
          ) : (
            <ul className="divide-y divide-line/60 overflow-hidden rounded-xl border border-line/70">
              {rules.map((rule) => (
                <li
                  key={rule.id}
                  className="flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-panel-soft/50"
                >
                  <Badge tone={ALVO[rule.targetStatus].tom}>{ALVO[rule.targetStatus].rotulo}</Badge>
                  {/* A frase em mono e entre aspas: é texto literal, e o
                      espaço em branco nela muda o que casa. */}
                  <code className="min-w-0 flex-1 truncate font-mono text-apoio text-ink-soft" title={rule.phrase}>
                    &ldquo;{rule.phrase}&rdquo;
                  </code>
                  <DeleteRuleButton id={rule.id} />
                </li>
              ))}
            </ul>
          )}

          <p className="mt-3 text-rotulo leading-relaxed text-ink-mute">
            Prefira frases distintas e específicas. Uma frase genérica como &ldquo;ok&rdquo; qualificaria quase toda
            conversa, e um funil que qualifica todo mundo não separa ninguém.
          </p>
        </Card>

        <Card className="p-6">
          <CardHeader
            title="Acessos do suporte à sua conta"
            description="Sempre que alguém da nossa equipe entra na sua conta para dar suporte, o acesso aparece aqui."
            className="mb-5"
          />

          {supportAccesses.length === 0 ? (
            <EmptyState
              title="Ninguém da nossa equipe acessou sua conta"
              description="Se algum dia acontecer, o registro aparece aqui com quem entrou e quando."
            />
          ) : (
            <ul className="divide-y divide-line/60 overflow-hidden rounded-xl border border-line/70">
              {supportAccesses.map((access) => (
                <li key={access.id} className="flex items-center justify-between gap-4 px-3.5 py-3">
                  <span className="min-w-0">
                    <span className="block truncate text-corpo text-ink">
                      {access.user?.name ?? "Usuário removido"}
                    </span>
                    {access.user?.email ? (
                      <span className="block truncate text-rotulo text-ink-mute">{access.user.email}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-apoio text-ink-mute" title={dataCompleta(access.createdAt)}>
                    {tempoRelativo(access.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
