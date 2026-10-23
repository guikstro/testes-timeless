import { trabalhoDaCampanha } from "@/lib/campanhas/trabalho";
import {
  AcoesNaLoja,
  NumerosDaCampanha,
  Objetivo,
  objetivoDoTrabalho,
  Resultado,
  resultadoDaCampanha,
} from "@/lib/campanhas/resultado";
import type { AcoesLocais } from "./campanhas-simples";
import type { AnuncioDaCampanha, DesempenhoDeCampanha, DesempenhoDeCampanhas, DiaDaCampanha } from "./tipos";

/** Uma linha da lista de Campanhas por resultado, pronta para a tela. */
export interface LinhaDeCampanha {
  id: string;
  nome: string;
  plataforma: string;
  /** "Pesquisa, ativa", "Facebook e Instagram, pausada". */
  formato: string;
  status: string;
  imagemUrl: string | null;
  objetivo: Objetivo;
  gastoCentavos: number;
  resultado: Resultado;
  /** O mesmo resultado no período de comparação, quando a campanha rodou nele. */
  anterior: { gastoCentavos: number; resultado: Resultado } | null;
  numeros: NumerosDaCampanha;
  loja: AcoesNaLoja | null;
  porDia: DiaDaCampanha[];
  anuncios: AnuncioDaCampanha[];
}

export function linhasPorResultado({
  dados,
  medido,
  comLoja,
  acoesLocais,
  acoesLocaisAnteriores,
  anuncios,
}: {
  dados: DesempenhoDeCampanhas;
  medido: boolean;
  comLoja: boolean;
  acoesLocais?: AcoesLocais;
  acoesLocaisAnteriores?: AcoesLocais;
  anuncios: Map<string, AnuncioDaCampanha[]>;
}): LinhaDeCampanha[] {
  return dados.campanhas.flatMap((linha) => {
    if (!linha.atual) return [];
    const locais = acoesLocais?.get(linha.externalId) ?? null;
    const trabalho = trabalhoDaCampanha({
      objetivo: linha.objetivo,
      plataforma: linha.plataforma,
      acoesLocais: (locais?.ligacoes ?? 0) + (locais?.rotas ?? 0),
      comLoja,
    });
    const objetivo = objetivoDoTrabalho(trabalho);
    const numeros = numerosDe(linha.atual, linha.plataforma);
    const anteriores = linha.anterior ? numerosDe(linha.anterior, linha.plataforma) : null;
    return [
      {
        id: linha.externalId,
        nome: linha.nome,
        plataforma: linha.plataforma,
        formato: `${formatoDe(linha.plataforma, linha.objetivo)}${STATUS[linha.status] ? `, ${STATUS[linha.status]}` : ""}`,
        status: linha.status,
        imagemUrl: linha.imagemUrl ?? null,
        objetivo,
        gastoCentavos: linha.atual.gastoCentavos,
        resultado: resultadoDaCampanha(objetivo, numeros, { medido, loja: locais }),
        anterior: anteriores
          ? {
              gastoCentavos: anteriores.gastoCentavos,
              resultado: resultadoDaCampanha(objetivo, anteriores, {
                medido,
                loja: acoesLocaisAnteriores?.get(linha.externalId) ?? null,
              }),
            }
          : null,
        numeros,
        loja: locais,
        porDia: linha.atual.porDia ?? [],
        anuncios: anuncios.get(linha.externalId) ?? [],
      },
    ];
  });
}

function numerosDe(d: DesempenhoDeCampanha, plataforma: string): NumerosDaCampanha {
  return {
    plataforma,
    gastoCentavos: d.gastoCentavos,
    impressoes: d.impressoes,
    cliques: d.cliques,
    visualizacoesDeVideo: d.visualizacoesDeVideo ?? null,
    conversasNaPlataforma: d.conversasNaPlataforma,
    leads: d.leads,
    vendas: d.vendas,
    receitaCentavos: d.receitaCentavos,
    vendasSemValor: d.vendasSemValor,
    diasAtivos: d.ativo?.dias ?? null,
  };
}

const STATUS: Record<string, string> = {
  ACTIVE: "ativa",
  ENABLED: "ativa",
  PAUSED: "pausada",
  ARCHIVED: "arquivada",
  REMOVED: "removida",
  DELETED: "excluída",
};

/** O formato que o dono reconhece, a partir do tipo que a plataforma informa. */
const FORMATO_DO_GOOGLE: Record<string, string> = {
  GOOGLE_SEARCH: "Pesquisa no Google",
  GOOGLE_PERFORMANCE_MAX: "Performance Max",
  GOOGLE_SHOPPING: "Shopping",
  GOOGLE_VIDEO: "Vídeo no YouTube",
  GOOGLE_DISPLAY: "Display",
  GOOGLE_DEMAND_GEN: "Demand Gen",
  GOOGLE_DISCOVERY: "Discovery",
  GOOGLE_LOCAL: "Local",
  GOOGLE_SMART: "Campanha inteligente",
  GOOGLE_LOCAL_SERVICES: "Serviços locais",
  GOOGLE_HOTEL: "Hotel",
};

export function formatoDe(plataforma: string, objetivo: string | null): string {
  if (plataforma === "GOOGLE") return (objetivo && FORMATO_DO_GOOGLE[objetivo]) ?? "Google Ads";
  if (plataforma === "META") return "Facebook e Instagram";
  if (plataforma === "TIKTOK") return "TikTok";
  return plataforma;
}

/** Os anúncios do período, agrupados pela campanha a que pertencem. */
export function anunciosPorCampanha(
  lista: { externalId: string; name: string; status: string; campanhaExternalId?: string | null; imagemUrl?: string | null; gastoCentavos: number; leads: number; vendas: number }[],
): Map<string, AnuncioDaCampanha[]> {
  const mapa = new Map<string, AnuncioDaCampanha[]>();
  for (const anuncio of lista) {
    if (!anuncio.campanhaExternalId) continue;
    const doGrupo = mapa.get(anuncio.campanhaExternalId) ?? [];
    doGrupo.push({
      externalId: anuncio.externalId,
      name: anuncio.name,
      status: anuncio.status,
      imagemUrl: anuncio.imagemUrl ?? null,
      gastoCentavos: anuncio.gastoCentavos,
      leads: anuncio.leads,
      vendas: anuncio.vendas,
    });
    mapa.set(anuncio.campanhaExternalId, doGrupo);
  }
  for (const doGrupo of mapa.values()) doGrupo.sort((a, b) => b.gastoCentavos - a.gastoCentavos);
  return mapa;
}
