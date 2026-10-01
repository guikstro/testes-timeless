import Link from "next/link";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { WhatsAppDoCliente, WhatsAppDoClienteDados } from "./whatsapp-do-cliente";
import { CorDoCliente } from "../cor-do-cliente";
import { PessoaDoCliente, PessoasDoCliente } from "./pessoas-do-cliente";
import { ExcluirCliente } from "./excluir-cliente";
import { FocoDoCliente } from "./foco-do-cliente";
import { PerfilDaEmpresaDoCliente, ResultadoDaConexao } from "./perfil-da-empresa-do-cliente";
import type { PerfilDoCliente, SituacaoDoPerfil } from "../actions";

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
  const [dados, pessoas, situacaoDoPerfil, perfil] = await Promise.all([
    apiFetch<WhatsAppDoClienteDados>(`/admin/organizations/${id}/whatsapp`),
    apiFetch<PessoaDoCliente[]>(`/admin/organizations/${id}/pessoas`),
    // Opcionais: sem eles a página continua, só sem o cartão do perfil.
    apiFetch<SituacaoDoPerfil>("/admin/perfil-da-empresa").catch(semCartao),
    apiFetch<PerfilDoCliente>(`/admin/organizations/${id}/perfil-da-empresa`).catch(semCartao),
  ]);

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
