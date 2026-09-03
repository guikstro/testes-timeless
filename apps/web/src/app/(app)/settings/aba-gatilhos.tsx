import { apiFetch } from "@/lib/api-client";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/skeleton";
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

export async function AbaGatilhos() {
  const rules = await apiFetch<ClassificationRule[]>("/classification-rules");

  return (
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
              <li key={rule.id} className="flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-panel-soft/50">
                <Badge tone={ALVO[rule.targetStatus].tom}>{ALVO[rule.targetStatus].rotulo}</Badge>
                {/* A frase em mono e entre aspas: é texto literal, e o espaço
                    em branco nela muda o que casa. */}
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
  );
}
