import Link from "next/link";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { WhatsAppDoCliente, WhatsAppDoClienteDados } from "./whatsapp-do-cliente";
import { CorDoCliente } from "../cor-do-cliente";
import { PessoaDoCliente, PessoasDoCliente } from "./pessoas-do-cliente";
import { ExcluirCliente } from "./excluir-cliente";
import { FocoDoCliente } from "./foco-do-cliente";
import { PerfilDaEmpresaDoCliente, ResultadoDaConexao } from "./perfil-da-empresa-do-cliente";
import type { PerfilDoCliente, SituacaoDoPerfil } from "../actions";
import { sessaoAtual } from "@/lib/sessao";
import { QuemAtende } from "../../equipe/formularios";

export default async function ClientePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  /** O resultado da volta do Google, quando a conta da equipe acabou de ser conectada daqui. */
  searchParams: Promise<ResultadoDaConexao>;
}) {
  const { id } = await params;
  const resultado = await searchParams;
  const { user } = await sessaoAtual();
  const socio = user.platformRole === "ADMIN";
  const [dados, pessoas, situacaoDoPerfil, perfil, atendem, equipe] = await Promise.all([
    apiFetch<WhatsAppDoClienteDados>(`/admin/organizations/${id}/whatsapp`),
    apiFetch<PessoaDoCliente[]>(`/admin/organizations/${id}/pessoas`),
    // Opcionais: sem eles a página continua, só sem o cartão do perfil.
    apiFetch<SituacaoDoPerfil>("/admin/perfil-da-empresa").catch(semCartao),
    apiFetch<PerfilDoCliente>(`/admin/organizations/${id}/perfil-da-empresa`).catch(semCartao),
    apiFetch<{ id: string; name: string; email: string }[]>(`/admin/organizations/${id}/operadores`).catch(() => []),
    // A lista da equipe é só do sócio; para o operador basta saber quem atende.
    socio
      ? apiFetch<{ id: string; name: string; email: string; platformRole: string }[]>("/admin/operators").catch(() => [])
      : Promise.resolve([]),
  ]);
  const operadores = socio ? equipe.filter((p) => p.platformRole === "SUPPORT") : atendem;

  return (
    <div className="max-w-2xl">
      <Link href="/clientes" className="text-corpo text-ink-mute hover:text-ink">
        ← Clientes
      </Link>
      <h1 className="mt-2 flex items-center gap-3 font-display text-2xl font-semibold tracking-tight text-ink">
        <CorDoCliente cor={dados.organizacao.brandColor} />
        {dados.organizacao.name}
      </h1>
      <FocoDoCliente organizationId={id} foco={dados.organizacao.foco} />
      <WhatsAppDoCliente dados={dados} />
      {situacaoDoPerfil && perfil ? (
        <PerfilDaEmpresaDoCliente
          organizationId={id}
          nome={dados.organizacao.name}
          situacao={situacaoDoPerfil}
          perfil={perfil}
          resultado={{ perfil: texto(resultado.perfil), motivo: texto(resultado.motivo) }}
        />
      ) : null}
      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold tracking-tight text-ink">Quem da equipe atende</h2>
        <p className="mb-3 mt-1 text-corpo text-ink-mute">Operadores só veem e entram nos clientes que atendem.</p>
        <QuemAtende organizationId={id} operadores={operadores} marcados={atendem.map((o) => o.id)} podeAlterar={socio} />
      </section>
      <PessoasDoCliente organizationId={id} pessoas={pessoas} />
      <ExcluirCliente organizationId={id} nome={dados.organizacao.name} />
    </div>
  );
}

/** Parâmetro repetido na URL vira lista; aqui só vale texto. */
const texto = (valor: unknown) => (typeof valor === "string" ? valor : undefined);

/**
 * Erro da API vira página sem o cartão. Qualquer outro segue: é por ele que
 * passa o redirecionamento ao login quando a sessão acabou.
 */
function semCartao(erro: unknown): null {
  if (erro instanceof ApiRequestError) return null;
  throw erro;
}
