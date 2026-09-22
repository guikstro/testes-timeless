import { AdIds } from "../leads/ad-references";

/**
 * Sobe do anúncio para o conjunto e a campanha.
 *
 * Os dois caminhos de identificação chegam com profundidades diferentes, e
 * essa assimetria vinha causando um buraco silencioso no relatório:
 *
 * - `TRACKING_LINK` guarda campanha, conjunto e anúncio em colunas próprias,
 *   porque os três vêm nos parâmetros da URL.
 * - `CTWA_REFERRAL` traz **só o anúncio**. A Meta manda o `source_id` do
 *   criativo no referral da mensagem e mais nada.
 *
 * Como o desempenho por campanha lia o id da campanha direto da evidência,
 * todo lead vindo de Click-to-WhatsApp, que é a evidência mais forte que
 * existe neste produto, entrava com campanha nula e desaparecia do relatório.
 * O mesmo lead aparecia com o nome da campanha na própria ficha dele, porque
 * ali a hierarquia já era resolvida pelo anúncio.
 *
 * A hierarquia já está sincronizada na nossa base. Descer por ela não é
 * dedução: é o mesmo vínculo que a Meta declara.
 */

export interface HierarquiaDoAnuncio {
  campaignExternalId: string;
  adSetExternalId: string;
}

export function completaIdsDoAnuncio(
  ids: AdIds,
  hierarquia: Map<string, HierarquiaDoAnuncio>,
): AdIds {
  if (!ids.adId) return ids;

  const acima = hierarquia.get(ids.adId);
  if (!acima) return ids;

  /*
    O que já veio na evidência tem precedência.

    Não é desempate teórico: se a campanha do clique divergir da campanha a que
    o anúncio pertence hoje, o clique é o que aconteceu de fato, e a hierarquia
    é o estado atual da conta. Um anúncio movido de campanha depois da veiculação
    não pode reescrever de onde o lead veio.
  */
  return {
    campaignId: ids.campaignId ?? acima.campaignExternalId,
    adsetId: ids.adsetId ?? acima.adSetExternalId,
    adId: ids.adId,
  };
}
