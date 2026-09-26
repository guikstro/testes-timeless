import { apiFetch } from "@/lib/api-client";
import { GrupoDePilulas } from "@/components/ui/pill-group";
import { AbaOperacao } from "./aba-operacao";
import { AbaAparencia } from "./aba-aparencia";
import { AbaSeguranca } from "./aba-seguranca";
import { AbaEquipe } from "./aba-equipe";
import { AbaAuditoria } from "./aba-auditoria";
import { Papel } from "./papeis";

/*
  Na ordem em que se usa, e não na ordem em que foram escritas. Gatilhos e
  equipe mudam toda semana; logo, cor e senha se definem uma vez e quase não
  se voltam a tocar. Abrir no que se usa mais poupa um clique por visita.
*/
const ABAS = [
  { chave: "operacao", rotulo: "Operação" },
  { chave: "equipe", rotulo: "Equipe" },
  { chave: "aparencia", rotulo: "Aparência" },
  { chave: "seguranca", rotulo: "Segurança" },
  { chave: "auditoria", rotulo: "Auditoria" },
] as const;

/** Só dono e administrador veem a auditoria; é a mesma regra da API. */
const PAPEIS_QUE_VEEM_AUDITORIA: Papel[] = ["OWNER", "ADMIN"];

/**
 * Configurações da conta de quem opera a plataforma. Na área da Timeless são
 * só estas; dentro de um cliente elas saem, porque ali o que se configura é
 * o cliente.
 */
const DA_CONTA: Aba[] = ["equipe", "aparencia", "seguranca"];

type Aba = (typeof ABAS)[number]["chave"];

interface Sessao {
  user: { id: string; name: string; email: string; platformRole: "SUPPORT" | "ADMIN" | null };
  role: Papel;
  impersonating: boolean;
  areas: string[] | null;
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; categoria?: string; pessoa?: string; depoisDe?: string }>;
}) {
  const { aba, categoria, pessoa, depoisDe } = await searchParams;

  // A sessão diz quem é você e o que você pode: as abas dependem disso,
  // então vem antes de escolher o que buscar.
  const sessao = await apiFetch<Sessao>("/auth/session");

  const areaDaTimeless = Boolean(sessao.user.platformRole) && !sessao.impersonating;
  const abas = ABAS.filter((opcao) => {
    if (areaDaTimeless) return DA_CONTA.includes(opcao.chave);
    if (sessao.impersonating && DA_CONTA.includes(opcao.chave)) return false;
    // Quem tem áreas limitadas: a própria senha sempre; a operação, se tiver a área.
    if (sessao.areas) return opcao.chave === "seguranca" || (opcao.chave === "operacao" && sessao.areas.includes("configuracoes"));
    return opcao.chave !== "auditoria" || PAPEIS_QUE_VEEM_AUDITORIA.includes(sessao.role);
  });
  const atual: Aba = abas.some((opcao) => opcao.chave === aba) ? (aba as Aba) : abas[0].chave;

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Configurações</h1>
      <p className="mt-1 text-corpo text-ink-mute">
        {areaDaTimeless
          ? "Sua conta e a equipe Timeless: quem tem acesso, a aparência e a segurança."
          : "Identidade, gatilhos, credenciais, quem tem acesso e o que foi feito."}
      </p>

      {/*
        Abas em vez de uma página só. O conteúdo já não cabia numa rolagem
        confortável, e misturar identidade visual com troca de senha na mesma
        tela faz procurar em vez de escolher.
      */}
      <div className="my-6">
        <GrupoDePilulas
          ativo={atual}
          opcoes={abas.map((opcao) => ({
            chave: opcao.chave,
            rotulo: opcao.rotulo,
            href: `/settings?aba=${opcao.chave}`,
          }))}
        />
      </div>

      {/* Cada aba busca só o que ela mostra, em vez de a página buscar tudo. */}
      {atual === "operacao" ? <AbaOperacao /> : null}
      {atual === "aparencia" ? <AbaAparencia /> : null}
      {atual === "seguranca" ? (
        <AbaSeguranca emailAtual={sessao.user.email} impersonando={sessao.impersonating} />
      ) : null}
      {atual === "equipe" ? <AbaEquipe euId={sessao.user.id} meuPapel={sessao.role} areaDaTimeless={areaDaTimeless} /> : null}
      {atual === "auditoria" ? <AbaAuditoria filtro={{ categoria, pessoa, depoisDe }} /> : null}
    </div>
  );
}
