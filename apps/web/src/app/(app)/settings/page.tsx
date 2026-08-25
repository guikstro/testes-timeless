import { apiFetch } from "@/lib/api-client";
import { CreateRuleForm } from "./create-rule-form";
import { DeleteRuleButton } from "./delete-rule-button";

interface ClassificationRule {
  id: string;
  targetStatus: "QUALIFIED" | "WON";
  phrase: string;
  createdAt: string;
}

const TARGET_LABELS: Record<ClassificationRule["targetStatus"], string> = {
  QUALIFIED: "Qualifica o lead",
  WON: "Marca como venda",
};

export default async function SettingsPage() {
  const rules = await apiFetch<ClassificationRule[]>("/classification-rules");

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">Configurações</h1>

      <h2 className="mb-3 text-sm font-semibold text-slate-900">Gatilhos de qualificação e venda</h2>
      <p className="mb-4 text-sm text-slate-500">
        Quando uma mensagem recebida contiver a frase exata (sem diferenciar maiúsculas/minúsculas), o lead muda de
        estágio automaticamente. Prefira frases distintas e específicas — frases genéricas podem gerar falsos
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
    </div>
  );
}
