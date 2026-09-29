import { apiFetch } from "@/lib/api-client";
import { GrupoDePilulas } from "@/components/ui/pill-group";
import { AbaOperacao } from "./aba-operacao";
import { AbaAparencia } from "./aba-aparencia";
import { AbaSeguranca } from "./aba-seguranca";
import { AbaEquipe } from "./aba-equipe";
import { AbaAuditoria } from "./aba-auditoria";
import { Papel } from "./papeis";
import { Capacidade, pode } from "@/lib/permissoes";
import { Foco, temLeads } from "@/lib/foco";

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

/** O que cada aba pede. A API decide quem tem; a tela só esconde a aba de quem não tem. */
const PRECISA: Record<(typeof ABAS)[number]["chave"], Capacidade | null> = {
  operacao: "settings.read",
  equipe: "member.read",
  aparencia: "settings.manage",
  seguranca: null,
  auditoria: "audit.read",
};

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
  capacidades: string[];
  organization: { foco: Foco } | null;
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
  // Horário de atendimento e gatilhos só existem em volta do lead.
  const comLeads = temLeads(sessao.organization?.foco);
  const abas = ABAS.filter((opcao) => {
    if (areaDaTimeless) return DA_CONTA.includes(opcao.chave);
    if (sessao.impersonating && DA_CONTA.includes(opcao.chave)) return false;
    if (opcao.chave === "operacao" && !comLeads) return false;
    // A própria senha sempre; o resto, se a pessoa tiver o que a aba pede.
    const precisa = PRECISA[opcao.chave];
    return precisa === null || pode(sessao, precisa);
  });
  const atual: Aba = abas.some((opcao) => opcao.chave === aba) ? (aba as Aba) : abas[0].chave;

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Configurações</h1>
      <p className="mt-1 text-corpo text-ink-mute">
        {areaDaTimeless
          ? "Sua conta e a equipe Timeless: quem tem acesso, a aparência e a segurança."
          : sessao.areas
            ? "Sua senha, o segundo fator e onde a sua conta está aberta."
            : comLeads
              ? "Identidade, gatilhos, credenciais, quem tem acesso e o que foi feito."
              : "Identidade, credenciais, quem tem acesso e o que foi feito."}
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
        <AbaSeguranca
          emailAtual={sessao.user.email}
          impersonando={sessao.impersonating}
          veAcessosDoSuporte={sessao.capacidades.includes("support_access.read")}
        />
      ) : null}
      {atual === "equipe" ? (
        <AbaEquipe
          euId={sessao.user.id}
          possoGerir={pode(sessao, "member.manage")}
          possoMexerEmDono={pode(sessao, "owner.manage")}
          areaDaTimeless={areaDaTimeless}
        />
      ) : null}
      {atual === "auditoria" ? <AbaAuditoria filtro={{ categoria, pessoa, depoisDe }} /> : null}
    </div>
  );
}
