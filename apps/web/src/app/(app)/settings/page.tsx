import { apiFetch } from "@/lib/api-client";
import { GrupoDePilulas } from "@/components/ui/pill-group";
import { AbaGatilhos } from "./aba-gatilhos";
import { AbaAparencia } from "./aba-aparencia";
import { AbaSeguranca } from "./aba-seguranca";
import { AbaEquipe } from "./aba-equipe";
import { Papel } from "./team-list";

/*
  Na ordem em que se usa, e não na ordem em que foram escritas. Gatilhos e
  equipe mudam toda semana; logo, cor e senha se definem uma vez e quase não
  se voltam a tocar. Abrir no que se usa mais poupa um clique por visita.
*/
const ABAS = [
  { chave: "gatilhos", rotulo: "Gatilhos" },
  { chave: "equipe", rotulo: "Equipe" },
  { chave: "aparencia", rotulo: "Aparência" },
  { chave: "seguranca", rotulo: "Segurança" },
] as const;

type Aba = (typeof ABAS)[number]["chave"];

interface Sessao {
  user: { id: string; name: string; email: string };
  role: Papel;
  impersonating: boolean;
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string }>;
}) {
  const { aba } = await searchParams;
  const atual: Aba = ABAS.some((opcao) => opcao.chave === aba) ? (aba as Aba) : "gatilhos";

  // A sessão diz quem é você e o que você pode: as três abas dependem disso,
  // então vem antes de escolher o que buscar.
  const sessao = await apiFetch<Sessao>("/auth/session");

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Configurações</h1>
      <p className="mt-1 text-corpo text-ink-mute">Identidade, gatilhos, credenciais e quem tem acesso.</p>

      {/*
        Abas em vez de uma página só. O conteúdo já não cabia numa rolagem
        confortável, e misturar identidade visual com troca de senha na mesma
        tela faz procurar em vez de escolher.
      */}
      <div className="my-6">
        <GrupoDePilulas
          ativo={atual}
          opcoes={ABAS.map((opcao) => ({
            chave: opcao.chave,
            rotulo: opcao.rotulo,
            href: `/settings?aba=${opcao.chave}`,
          }))}
        />
      </div>

      {/* Cada aba busca só o que ela mostra, em vez de a página buscar tudo. */}
      {atual === "gatilhos" ? <AbaGatilhos /> : null}
      {atual === "aparencia" ? <AbaAparencia /> : null}
      {atual === "seguranca" ? (
        <AbaSeguranca emailAtual={sessao.user.email} impersonando={sessao.impersonating} />
      ) : null}
      {atual === "equipe" ? <AbaEquipe euId={sessao.user.id} meuPapel={sessao.role} /> : null}
    </div>
  );
}
