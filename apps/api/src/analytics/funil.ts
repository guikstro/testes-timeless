import { LeadStatus } from "@prisma/client";
import { ORDEM_DO_FUNIL } from "../leads/ordem-do-funil";
import { rotuloDaOrigem } from "./overview-aggregation";

/**
 * O funil da aba Funil: dos leads que chegaram no período, até onde cada um foi.
 *
 * Cada etapa conta quem chegou nela **ou além**. Contar só quem está parado
 * em cada estágio agora responderia outra pergunta ("como está o quadro
 * hoje"), e faria uma venda sumir das etapas de cima: o funil passaria a
 * dizer que ninguém foi qualificado num mês em que todo mundo comprou.
 *
 * Pela mesma razão as etapas nunca crescem de uma para a seguinte. A etapa
 * alcançada de um lead é uma só, e ele entra em todas as anteriores a ela.
 *
 * Fica fora do service por ser conta pura sobre uma lista de leads, como a
 * agregação do dashboard: os casos de borda são testados sem banco.
 */

/** Na ordem em que o lead anda. O índice é o mesmo de `ORDEM_DO_FUNIL`. */
export const ETAPAS_DO_FUNIL = ["leads", "contatados", "qualificados", "reuniao", "vendas"] as const;

export type ChaveDaEtapa = (typeof ETAPAS_DO_FUNIL)[number];

/** Só o que a conta lê. */
export interface LeadDoFunil {
  status: LeadStatus;
  /** Quando o lead entrou em atendimento. Fica gravado mesmo se o estágio voltar. */
  emAtendimentoAt: Date | null;
  /**
   * A equipe respondeu no WhatsApp. É a prova de contato dos leads que
   * chegaram antes de existir o estágio "Em atendimento" e continuam em Novo.
   */
  respondido: boolean;
  disqualifiedAt: Date | null;
  disqualifiedReason: string | null;
}

/**
 * Até que etapa o lead chegou, de 0 (chegou) a 4 (venda).
 *
 * O estágio atual decide quase tudo. A exceção é o contato: um lead em Novo
 * que a equipe já respondeu foi contatado, só não teve o estágio trocado.
 * Isso acontece com todo lead anterior ao estágio "Em atendimento", e sem
 * esta regra o funil diria que ninguém daquele período foi atendido.
 */
export function etapaAlcancada(lead: LeadDoFunil): number {
  const pelaOrdem = ORDEM_DO_FUNIL[lead.status];
  if (pelaOrdem >= ORDEM_DO_FUNIL.IN_PROGRESS) return pelaOrdem;
  if (lead.emAtendimentoAt !== null || lead.respondido) return ORDEM_DO_FUNIL.IN_PROGRESS;
  return ORDEM_DO_FUNIL.NEW;
}

export interface EtapaMontada {
  chave: ChaveDaEtapa;
  /** Quem chegou nesta etapa ou foi além dela. */
  quantidade: number;
  /** Fração da etapa anterior que chegou aqui. Null na primeira, e quando a anterior está vazia. */
  conversao: number | null;
  /** Pararam nesta etapa e foram marcados como perdidos. */
  perdidos: number;
  /** Pararam nesta etapa e continuam abertos: ainda podem andar. */
  abertos: number;
}

export interface MotivoDePerda {
  /** Null quando o lead foi marcado como perdido sem motivo. */
  motivo: string | null;
  quantidade: number;
}

export interface FunilMontado {
  etapas: EtapaMontada[];
  /** Vendas sobre leads. Null sem lead: 0% diria que ninguém comprou, e não houve a quem vender. */
  conversaoTotal: number | null;
  /** Todos os perdidos, em qualquer etapa. */
  perdidos: number;
  /** Quem ainda não comprou nem foi perdido. */
  abertos: number;
  motivosDePerda: MotivoDePerda[];
}

export function montaFunil(leads: LeadDoFunil[]): FunilMontado {
  const ultima = ETAPAS_DO_FUNIL.length - 1;
  const alcancaram = ETAPAS_DO_FUNIL.map(() => 0);
  const perdidos = ETAPAS_DO_FUNIL.map(() => 0);
  const abertos = ETAPAS_DO_FUNIL.map(() => 0);
  const motivos = new Map<string, MotivoDePerda>();

  for (const lead of leads) {
    const etapa = etapaAlcancada(lead);
    for (let i = 0; i <= etapa; i += 1) alcancaram[i] += 1;

    // Venda é o fim do caminho: não é perda nem pendência. Um lead vendido
    // não pode ser marcado como perdido, mas um dado antigo assim não pode
    // tirar a venda da conta.
    if (etapa === ultima) continue;

    if (lead.disqualifiedAt === null) {
      abertos[etapa] += 1;
      continue;
    }

    perdidos[etapa] += 1;
    const texto = lead.disqualifiedReason?.trim() || null;
    // "Preço" e "preço " são o mesmo motivo escrito de dois jeitos. A grafia
    // que aparece é a da primeira vez em que ele foi registrado.
    const chave = texto?.toLocaleLowerCase("pt-BR") ?? "";
    const existente = motivos.get(chave);
    if (existente) existente.quantidade += 1;
    else motivos.set(chave, { motivo: texto, quantidade: 1 });
  }

  const etapas = ETAPAS_DO_FUNIL.map<EtapaMontada>((chave, i) => ({
    chave,
    quantidade: alcancaram[i],
    conversao: i === 0 || alcancaram[i - 1] === 0 ? null : alcancaram[i] / alcancaram[i - 1],
    perdidos: perdidos[i],
    abertos: abertos[i],
  }));

  return {
    etapas,
    conversaoTotal: leads.length > 0 ? alcancaram[ultima] / leads.length : null,
    perdidos: perdidos.reduce((soma, n) => soma + n, 0),
    abertos: abertos.reduce((soma, n) => soma + n, 0),
    // Mais frequente primeiro; o lead perdido sem motivo vai por último,
    // porque ele não ensina nada sobre o que corrigir.
    motivosDePerda: [...motivos.values()].sort((a, b) => {
      if (a.motivo === null) return 1;
      if (b.motivo === null) return -1;
      return b.quantidade - a.quantidade || a.motivo.localeCompare(b.motivo, "pt-BR");
    }),
  };
}

/** Os recortes da aba. `responsavel` já chega resolvido: "eu" vira o id de quem pergunta. */
export interface FiltrosDoFunil {
  /** Id da campanha na plataforma, ou `nenhuma` para os leads sem campanha. */
  campanha: string | null;
  /** Chave da origem, a mesma da tabela de origens do dashboard. */
  origem: string | null;
  /** Id de alguém da organização, ou `nenhum` para os leads sem responsável. */
  responsavel: string | null;
}

export const SEM_CAMPANHA = "nenhuma";
export const SEM_RESPONSAVEL = "nenhum";

export interface LeadRecortavel extends LeadDoFunil {
  /** Id da campanha já resolvido pelo anúncio, como no desempenho por campanha. */
  campanhaId: string | null;
  origem: { key: string; label: string };
  responsavelId: string | null;
}

export function aplicaFiltros<T extends LeadRecortavel>(leads: T[], filtros: FiltrosDoFunil): T[] {
  return leads.filter((lead) => {
    if (filtros.campanha !== null) {
      const campanha = lead.campanhaId ?? SEM_CAMPANHA;
      if (campanha !== filtros.campanha) return false;
    }
    if (filtros.origem !== null && lead.origem.key !== filtros.origem) return false;
    if (filtros.responsavel !== null) {
      const responsavel = lead.responsavelId ?? SEM_RESPONSAVEL;
      if (responsavel !== filtros.responsavel) return false;
    }
    return true;
  });
}

export interface OpcaoDeFiltro {
  valor: string;
  rotulo: string;
  /** Leads do período com este valor, antes de qualquer recorte. */
  leads: number;
}

/**
 * O que dá para escolher em cada recorte.
 *
 * As opções saem dos leads do período inteiro, e não dos já recortados:
 * escolher uma campanha não pode fazer as outras sumirem da lista, ou a
 * pessoa precisaria limpar o filtro para trocar de campanha.
 *
 * O valor já escolhido entra mesmo sem lead no período. Um link salvo com a
 * campanha de março, aberto em julho, mostraria a lista em "todas" enquanto
 * o funil continua recortado, e a tela diria uma coisa e mostraria outra.
 */
export function opcoesDosFiltros(
  leads: LeadRecortavel[],
  nomesDasCampanhas: Map<string, string>,
  escolhidos: Pick<FiltrosDoFunil, "campanha" | "origem"> = { campanha: null, origem: null },
): { campanhas: OpcaoDeFiltro[]; origens: OpcaoDeFiltro[] } {
  const campanhas = new Map<string, OpcaoDeFiltro>();
  const origens = new Map<string, OpcaoDeFiltro>();

  for (const lead of leads) {
    const valor = lead.campanhaId ?? SEM_CAMPANHA;
    const campanha = campanhas.get(valor) ?? { valor, rotulo: rotuloDaCampanha(valor, nomesDasCampanhas), leads: 0 };
    campanha.leads += 1;
    campanhas.set(valor, campanha);

    const origem = origens.get(lead.origem.key) ?? { valor: lead.origem.key, rotulo: lead.origem.label, leads: 0 };
    origem.leads += 1;
    origens.set(lead.origem.key, origem);
  }

  if (escolhidos.campanha !== null && !campanhas.has(escolhidos.campanha)) {
    const valor = escolhidos.campanha;
    campanhas.set(valor, { valor, rotulo: rotuloDaCampanha(valor, nomesDasCampanhas), leads: 0 });
  }
  if (escolhidos.origem !== null && !origens.has(escolhidos.origem)) {
    const valor = escolhidos.origem;
    origens.set(valor, { valor, rotulo: rotuloDaOrigem(valor), leads: 0 });
  }

  return {
    campanhas: distingueHomonimas(ordena([...campanhas.values()], SEM_CAMPANHA)),
    origens: ordena([...origens.values()], "unknown"),
  };
}

/**
 * A Meta aceita duas campanhas com o mesmo nome, e duplicar uma para testar
 * sem renomear é comum. Na lista, as duas ganham o final do id, que é o que
 * dá para conferir no Gerenciador de Anúncios.
 */
function distingueHomonimas(opcoes: OpcaoDeFiltro[]): OpcaoDeFiltro[] {
  const vezes = new Map<string, number>();
  for (const opcao of opcoes) vezes.set(opcao.rotulo, (vezes.get(opcao.rotulo) ?? 0) + 1);
  return opcoes.map((opcao) =>
    (vezes.get(opcao.rotulo) ?? 0) > 1 ? { ...opcao, rotulo: `${opcao.rotulo} (id final ${opcao.valor.slice(-4)})` } : opcao,
  );
}

/**
 * O nome da campanha, ou o id dela quando ainda não foi sincronizada.
 *
 * O id cru é feio, mas é verdadeiro e dá para procurar no Gerenciador de
 * Anúncios. Chamar a campanha de "desconhecida" esconderia que ela existe.
 */
export function rotuloDaCampanha(valor: string, nomes: Map<string, string>): string {
  if (valor === SEM_CAMPANHA) return "Sem campanha identificada";
  return nomes.get(valor) ?? `Campanha ${valor}`;
}

/** Mais leads primeiro; o resíduo (sem campanha, sem origem) por último mesmo quando é o maior. */
function ordena(opcoes: OpcaoDeFiltro[], residuo: string): OpcaoDeFiltro[] {
  return opcoes.sort((a, b) => {
    if (a.valor === residuo) return 1;
    if (b.valor === residuo) return -1;
    return b.leads - a.leads || a.rotulo.localeCompare(b.rotulo, "pt-BR");
  });
}
