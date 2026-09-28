import { apiFetch } from "@/lib/api-client";
import { Card, CardHeader } from "@/components/ui/card";
import { Membro, TeamList } from "./team-list";
import { PAPEL, Papel } from "./papeis";
import { AdicionarPessoa } from "./adicionar-pessoa";
import { TransferirPosse } from "./transferir-posse";

export async function AbaEquipe({
  euId,
  possoGerir,
  possoMexerEmDono,
  areaDaTimeless = false,
}: {
  euId: string;
  possoGerir: boolean;
  possoMexerEmDono: boolean;
  areaDaTimeless?: boolean;
}) {
  const membros = await apiFetch<Membro[]>("/organizations/current/members");
  // A lista de clientes vem da administração, que exige a verificação em duas etapas.
  const clientes = areaDaTimeless
    ? await apiFetch<{ items: { id: string; name: string }[] }>("/admin/organizations?limit=100")
        .then((resposta) => resposta.items)
        .catch((erro: Error) => erro.message)
    : null;

  return (
    <div className="space-y-5">
      <Card className="p-6">
        <CardHeader
          title="Quem tem acesso"
          description={
            possoGerir
              ? "Mude o papel ou tire alguém da conta. A pessoa perde o acesso na hora, em todos os aparelhos."
              : "Estas são as pessoas com acesso a esta conta."
          }
          className="mb-5"
        />

        <TeamList
          membros={membros}
          euId={euId}
          possoGerir={possoGerir}
          possoMexerEmDono={possoMexerEmDono}
          contaDaEquipe={areaDaTimeless}
        />

        {!possoGerir ? (
          <p className="mt-3 text-apoio text-ink-mute">
            Só donos e administradores mudam papéis ou removem alguém.
          </p>
        ) : null}
      </Card>

      {clientes !== null ? (
        <Card className="p-6">
          <CardHeader
            title="Adicionar pessoa"
            description="Gere um convite: a pessoa abre o link e cria a própria senha. Para um cliente, ela só vê o que você marcar."
            className="mb-5"
          />
          {typeof clientes === "string" ? (
            <p className="text-apoio text-ink-mute">{clientes}</p>
          ) : (
            <AdicionarPessoa clientes={clientes} />
          )}
        </Card>
      ) : null}

      {/* Só o dono, só na conta da equipe, e só para quem já é da equipe. */}
      {areaDaTimeless && possoMexerEmDono ? (
        <Card className="p-6">
          <CardHeader
            title="Transferir a posse"
            description="Passe esta conta para outra pessoa da equipe Timeless. Ela vira dona; você passa a administrador. Pede o código do autenticador."
            className="mb-5"
          />
          <TransferirPosse
            candidatos={membros.filter((m) => m.daEquipe && m.userId !== euId && m.role !== "OWNER")}
          />
        </Card>
      ) : null}

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
      </Card>
    </div>
  );
}
