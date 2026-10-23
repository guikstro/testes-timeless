import { unstable_rethrow } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { Foco, temPresencaLocal } from "@/lib/foco";
import { Intervalo, periodoEquivalente } from "@/lib/periodo";
import type { Anuncios } from "../verba/tipos";
import { anunciosPorCampanha, LinhaDeCampanha, linhasPorResultado } from "./linhas-por-resultado";
import type { AnuncioDaCampanha, DesempenhoDeCampanhas } from "./tipos";

/** Ligações e rotas de uma campanha do Google, pelo id dela na plataforma. */
export type AcoesLocais = Map<string, { ligacoes: number | null; rotas: number | null }>;

interface NumerosLocais {
  ligacoes: number | null;
  rotas: number | null;
}

/** O pedaço de `GET /presenca-local/campanhas` que a lista usa: ligação e rota por campanha. */
interface CampanhasLocais {
  campanhas: { externalId: string; atual: NumerosLocais | null; anterior: NumerosLocais | null }[];
}

export interface BuscaDeCampanhas {
  dados: DesempenhoDeCampanhas;
  locais: CampanhasLocais | null;
  anuncios: Map<string, AnuncioDaCampanha[]>;
}

/**
 * O caminho único das campanhas, para todo cliente e toda tela.
 *
 * Antes eram três: um para quem mede leads, outro para quem é só presença
 * local (com tela própria) e um terceiro no Resumo. Cada cliente via uma cara
 * diferente da mesma coisa. Agora a base é sempre a mesma consulta de
 * campanhas; quem mede presença local ganha por cima as ligações e rotas de
 * cada campanha do Google.
 *
 * Ligações, rotas e anúncios são opcionais: se falharem, a lista continua,
 * só sem eles. A consulta das campanhas é a que não pode faltar.
 */
export async function buscaCampanhas({
  periodo,
  comparacao,
  foco,
  comAnuncios = true,
}: {
  periodo: Intervalo;
  comparacao: Intervalo;
  foco: Foco | null | undefined;
  comAnuncios?: boolean;
}): Promise<BuscaDeCampanhas> {
  const consulta = new URLSearchParams({
    de: periodo.de,
    ate: periodo.ate,
    compararDe: comparacao.de,
    compararAte: comparacao.ate,
  }).toString();
  const opcional = <T>(promessa: Promise<T>) =>
    promessa.catch((erro) => {
      unstable_rethrow(erro);
      return null;
    });

  const [dados, locais, anuncios] = await Promise.all([
    apiFetch<DesempenhoDeCampanhas>(`/analytics/campanhas?${consulta}`),
    temPresencaLocal(foco) ? opcional(apiFetch<CampanhasLocais>(`/presenca-local/campanhas?${consulta}`)) : null,
    comAnuncios ? opcional(apiFetch<Anuncios>(`/analytics/anuncios?de=${periodo.de}&ate=${periodo.ate}`)) : null,
  ]);
  return { dados, locais, anuncios: anunciosPorCampanha(anuncios?.anuncios ?? []) };
}

export function montaLinhas(busca: BuscaDeCampanhas, { medido, foco }: { medido: boolean; foco: Foco | null | undefined }): LinhaDeCampanha[] {
  return linhasPorResultado({
    dados: busca.dados,
    medido,
    comLoja: temPresencaLocal(foco),
    soLocal: foco === "PRESENCA_LOCAL",
    acoesLocais: acoesLocaisDe(busca.locais, "atual"),
    acoesLocaisAnteriores: acoesLocaisDe(busca.locais, "anterior"),
    anuncios: busca.anuncios,
  });
}

function acoesLocaisDe(dados: CampanhasLocais | null, lado: "atual" | "anterior"): AcoesLocais | undefined {
  if (!dados) return undefined;
  return new Map(
    dados.campanhas.flatMap((linha) => {
      const numeros = linha[lado];
      return numeros ? [[linha.externalId, { ligacoes: numeros.ligacoes, rotas: numeros.rotas }] as const] : [];
    }),
  );
}

/**
 * Com o que o detalhe da campanha compara: a comparação escolhida ou, sem
 * escolha, o período equivalente logo antes. O mês corrente conta só até
 * hoje, para não comparar 23 dias com um mês inteiro.
 */
export function comparacaoDoDetalhe(periodo: Intervalo, escolhida: Intervalo | null): Intervalo {
  if (escolhida) return escolhida;
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return periodoEquivalente({ de: periodo.de, ate: periodo.ate > hoje && periodo.de <= hoje ? hoje : periodo.ate });
}
