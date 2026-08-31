import { apiFetch } from "@/lib/api-client";
import { Card, CardHeader } from "@/components/ui/card";
import { BrandForm } from "./brand-form";
import { CreateRuleForm } from "./create-rule-form";
import { DeleteRuleButton } from "./delete-rule-button";

interface ClassificationRule {
  id: string;
  targetStatus: "QUALIFIED" | "MEETING_SCHEDULED" | "WON";
  phrase: string;
  createdAt: string;
}

const TARGET_LABELS: Record<ClassificationRule["targetStatus"], string> = {
  QUALIFIED: "Qualifica o lead",
  MEETING_SCHEDULED: "Marca reunião agendada",
  WON: "Marca como venda",
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
    <div className="mx-auto max-w-5xl">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">Configurações</h1>
      <p className="mb-8 mt-1 text-sm text-slate-500">Identidade visual, gatilhos e acessos.</p>

      <Card className="mb-8 p-6">
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

      <h2 className="mb-3 text-sm font-semibold text-slate-900">Gatilhos de qualificação e venda</h2>
      <p className="mb-4 text-sm text-slate-500">
        Quando uma mensagem recebida contiver a frase exata (sem diferenciar maiúsculas/minúsculas), o lead muda de
        estágio automaticamente. Prefira frases distintas e específicas. Frases genéricas podem gerar falsos
        positivos.
      </p>

      <div className="mb-6">
        <CreateRuleForm />
      </div>

      {rules.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
          Nenhum gatilho configurado ainda.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Frase</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 text-slate-700">{TARGET_LABELS[rule.targetStatus]}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{rule.phrase}</td>
                  <td className="px-4 py-3 text-right">
                    <DeleteRuleButton id={rule.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mb-3 mt-10 text-sm font-semibold text-slate-900">Acessos do suporte à sua conta</h2>
      <p className="mb-4 text-sm text-slate-500">
        Sempre que alguém da nossa equipe precisa entrar na sua conta para dar suporte, o acesso aparece aqui.
      </p>

      {supportAccesses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
          Ninguém da nossa equipe acessou sua conta.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Quando</th>
                <th className="px-4 py-3 font-medium">Quem</th>
              </tr>
            </thead>
            <tbody>
              {supportAccesses.map((access) => (
                <tr key={access.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(access.createdAt).toLocaleString("pt-BR")}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {access.user?.name ?? "Usuário removido"}
                    <span className="block text-xs text-slate-400">{access.user?.email}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
