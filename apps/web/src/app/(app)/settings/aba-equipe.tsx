import { apiFetch } from "@/lib/api-client";
import { Card, CardHeader } from "@/components/ui/card";
import { Membro, Papel, PAPEL, TeamList } from "./team-list";

export async function AbaEquipe({ euId, meuPapel }: { euId: string; meuPapel: Papel }) {
  const membros = await apiFetch<Membro[]>("/organizations/current/members");
  const posso = meuPapel === "OWNER" || meuPapel === "ADMIN";

  return (
    <div className="space-y-5">
      <Card className="p-6">
        <CardHeader
          title="Quem tem acesso"
          description={
            posso
              ? "Mude o papel ou tire alguém da conta. A pessoa perde o acesso na hora, em todos os aparelhos."
              : "Estas são as pessoas com acesso a esta conta."
          }
          className="mb-5"
        />

        <TeamList membros={membros} euId={euId} meuPapel={meuPapel} />

        {!posso ? (
          <p className="mt-3 text-apoio text-ink-mute">
            Só donos e administradores mudam papéis ou removem alguém.
          </p>
        ) : null}
      </Card>

      <Card className="p-6">
        <CardHeader title="O que cada papel faz" className="mb-4" />
        <dl className="space-y-2.5">
          {(Object.keys(PAPEL) as Papel[]).map((papel) => (
            <div key={papel} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <dt className="w-32 shrink-0 text-corpo font-medium text-ink">{PAPEL[papel].rotulo}</dt>
              <dd className="min-w-0 flex-1 text-apoio text-ink-mute">{PAPEL[papel].explica}</dd>
            </div>
          ))}
        </dl>
        {/*
          Convidar ainda não existe. Dizer isso é melhor que deixar procurar um
          botão que não está lá.
        */}
        <p className="mt-4 rounded-xl border border-line bg-panel-soft/60 px-3.5 py-2.5 text-apoio leading-relaxed text-ink-mute">
          Ainda não dá para convidar alguém por aqui: novas pessoas entram criando conta e sendo adicionadas pelo
          suporte. Convite por e-mail depende do envio de e-mail, que o produto ainda não tem.
        </p>
      </Card>
    </div>
  );
}
