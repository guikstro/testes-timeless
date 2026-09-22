/**
 * Como cada lead foi identificado, e até onde a identificação chega.
 *
 * Existe porque a tabela por anúncio, sozinha, engana de um jeito específico:
 * um lead que o produto não conseguiu ligar a um anúncio simplesmente não
 * aparece em linha nenhuma. O cliente lê "esses anúncios trouxeram doze leads"
 * quando a verdade é "doze dos quarenta leads puderam ser ligados a um
 * anúncio, e dos outros vinte e oito não se sabe".
 *
 * Os dois caminhos de identificação provam coisas diferentes, e por isso são
 * contados separados em vez de somados num "atribuído":
 *
 * - `CTWA_REFERRAL` é a própria Meta dizendo, na mensagem, de qual anúncio a
 *   pessoa veio. Não há correlação nossa no meio.
 * - `TRACKING_LINK` é o nosso token, embutido no texto do wa.me, casado de
 *   volta com o clique que o gerou.
 *
 * Nenhum dos dois é chute. Quando não há evidência, o lead fica sem origem, e
 * é isso que a tela precisa dizer.
 */

export type MetodoDeIdentificacao = "CTWA_REFERRAL" | "TRACKING_LINK" | "UNKNOWN";

export interface LeadIdentificado {
  metodo: MetodoDeIdentificacao | null;
  /** Id do anúncio na Meta, quando a evidência chegou até esse nível. */
  adExternalId: string | null;
  /** True quando esse id casa com um anúncio que a sincronia já conhece. */
  anuncioConhecido: boolean;
}

export interface Identificacao {
  total: number;
  /** Leads que a tabela por anúncio consegue mostrar. */
  atePeloAnuncio: number;
  /**
   * Veio de anúncio, mas o anúncio não está entre os sincronizados.
   *
   * O caso real é o anúncio apagado da conta depois de rodar: a Meta ainda
   * conta o gasto histórico, e o criativo não existe mais para ser nomeado.
   */
  deAnuncioDesconhecido: number;
  /** Identificado, mas a evidência não carregava o anúncio. */
  semNivelDeAnuncio: number;
  /** Nenhuma evidência utilizável na primeira mensagem. */
  semOrigem: number;
  porMetodo: Record<MetodoDeIdentificacao, number>;
  /** De 0 a 100. Null sem lead nenhum: não existe percentual de nada. */
  coberturaPorCento: number | null;
}

export function identificacaoDosLeads(leads: LeadIdentificado[]): Identificacao {
  const porMetodo: Record<MetodoDeIdentificacao, number> = {
    CTWA_REFERRAL: 0,
    TRACKING_LINK: 0,
    UNKNOWN: 0,
  };

  let atePeloAnuncio = 0;
  let deAnuncioDesconhecido = 0;
  let semNivelDeAnuncio = 0;
  let semOrigem = 0;

  for (const lead of leads) {
    // Lead sem linha de atribuição nenhuma conta igual a UNKNOWN: os dois
    // querem dizer "não se sabe de onde veio".
    porMetodo[lead.metodo ?? "UNKNOWN"] += 1;

    if (!lead.metodo || lead.metodo === "UNKNOWN") {
      semOrigem += 1;
      continue;
    }
    if (!lead.adExternalId) {
      semNivelDeAnuncio += 1;
      continue;
    }
    if (!lead.anuncioConhecido) {
      deAnuncioDesconhecido += 1;
      continue;
    }
    atePeloAnuncio += 1;
  }

  return {
    total: leads.length,
    atePeloAnuncio,
    deAnuncioDesconhecido,
    semNivelDeAnuncio,
    semOrigem,
    porMetodo,
    coberturaPorCento:
      leads.length > 0 ? Math.round((atePeloAnuncio / leads.length) * 1000) / 10 : null,
  };
}
