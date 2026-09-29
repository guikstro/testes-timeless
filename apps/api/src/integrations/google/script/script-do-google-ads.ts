/**
 * O script que roda dentro da conta do Google Ads e manda os números para cá.
 *
 * Montado aqui, e não copiado de um documento, para já sair com o endereço e
 * a chave certos: colar e agendar é tudo o que a pessoa faz. Lê só; não pausa
 * nem muda nada na conta.
 *
 * Janela de 35 dias, de hoje para trás: cobre o mês corrente inteiro mesmo no
 * dia 31, e reenviar um dia só substitui o que já estava.
 *
 * Versão 2: também ligações vindas dos anúncios e ações locais (rotas,
 * ligações contadas como conversão, visitas à loja). Cada parte nova roda
 * numa consulta separada e protegida: se o Google recusar numa conta, o gasto
 * continua chegando, e o envio diz o que faltou.
 */
export const VERSAO_DO_SCRIPT = 2;

export function scriptDoGoogleAds(endereco: string, chave: string): string {
  return `/**
 * Timeless: envia o gasto, as ligações e as ações locais das campanhas desta conta.
 * Só lê. Não pausa, não muda orçamento, não mexe em nada.
 * Agende para rodar a cada hora.
 */
var ENDERECO = ${JSON.stringify(endereco)};
var CHAVE = ${JSON.stringify(chave)};
var DIAS = 35;
var VERSAO = ${VERSAO_DO_SCRIPT};

function main() {
  var conta = AdsApp.currentAccount();
  var fuso = conta.getTimeZone();
  var hoje = new Date();
  var inicio = new Date(hoje.getTime() - (DIAS - 1) * 24 * 60 * 60 * 1000);
  var de = Utilities.formatDate(inicio, fuso, "yyyy-MM-dd");
  var ate = Utilities.formatDate(hoje, fuso, "yyyy-MM-dd");

  var linhas = AdsApp.search(
    "SELECT campaign.id, campaign.name, campaign.status, campaign_budget.amount_micros, " +
    "segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, " +
    "metrics.conversions, metrics.conversions_value " +
    "FROM campaign WHERE segments.date BETWEEN '" + de + "' AND '" + ate + "'"
  );

  var campanhas = {};
  while (linhas.hasNext()) {
    var l = linhas.next();
    var id = String(l.campaign.id);
    if (!campanhas[id]) {
      campanhas[id] = {
        id: id,
        nome: l.campaign.name,
        status: l.campaign.status,
        orcamentoMicros: l.campaignBudget ? Number(l.campaignBudget.amountMicros) : null,
        dias: []
      };
    }
    campanhas[id].dias.push({
      data: l.segments.date,
      custoMicros: Number(l.metrics.costMicros || 0),
      impressoes: Number(l.metrics.impressions || 0),
      cliques: Number(l.metrics.clicks || 0),
      conversoes: Number(l.metrics.conversions || 0),
      valorConversoes: Number(l.metrics.conversionsValue || 0)
    });
  }

  // As partes novas não podem derrubar o envio do gasto.
  var partes = {};
  var locais = [];
  var periodo = " WHERE segments.date BETWEEN '" + de + "' AND '" + ate + "'";

  try {
    var ligacoes = AdsApp.search(
      "SELECT campaign.id, segments.date, metrics.phone_calls, metrics.phone_impressions FROM campaign" + periodo
    );
    while (ligacoes.hasNext()) {
      var g = ligacoes.next();
      var feitas = Number(g.metrics.phoneCalls || 0);
      var vistas = Number(g.metrics.phoneImpressions || 0);
      if (feitas > 0) locais.push({ campanha: String(g.campaign.id), data: g.segments.date, metrica: "LIGACOES_DOS_ANUNCIOS", valor: feitas });
      if (vistas > 0) locais.push({ campanha: String(g.campaign.id), data: g.segments.date, metrica: "EXIBICOES_DO_TELEFONE", valor: vistas });
    }
    partes.ligacoes = "ok";
  } catch (e) {
    partes.ligacoes = "falhou: " + String(e).slice(0, 200);
  }

  var CATEGORIAS = { GET_DIRECTIONS: "ROTAS", PHONE_CALL_LEAD: "LIGACOES_CONVERSAO", STORE_VISIT: "VISITAS_A_LOJA" };
  try {
    var acoes = AdsApp.search(
      "SELECT campaign.id, segments.date, segments.conversion_action_category, metrics.all_conversions FROM campaign" +
      periodo + " AND segments.conversion_action_category IN ('GET_DIRECTIONS', 'PHONE_CALL_LEAD', 'STORE_VISIT')"
    );
    while (acoes.hasNext()) {
      var a = acoes.next();
      var valor = Number(a.metrics.allConversions || 0);
      var metrica = CATEGORIAS[a.segments.conversionActionCategory];
      if (metrica && valor > 0) locais.push({ campanha: String(a.campaign.id), data: a.segments.date, metrica: metrica, valor: valor });
    }
    partes.acoesLocais = "ok";
  } catch (e) {
    partes.acoesLocais = "falhou: " + String(e).slice(0, 200);
  }

  var corpo = {
    versao: VERSAO,
    partes: partes,
    locais: locais,
    conta: { id: String(conta.getCustomerId()).replace(/-/g, ""), nome: conta.getName(), moeda: conta.getCurrencyCode() },
    campanhas: Object.keys(campanhas).map(function (k) { return campanhas[k]; })
  };

  var resposta = UrlFetchApp.fetch(ENDERECO, {
    method: "post",
    contentType: "application/json",
    headers: { "X-Chave-Timeless": CHAVE },
    payload: JSON.stringify(corpo),
    muteHttpExceptions: true
  });
  Logger.log("Timeless respondeu " + resposta.getResponseCode() + ": " + resposta.getContentText());
  if (resposta.getResponseCode() >= 300) {
    throw new Error("A Timeless recusou o envio: " + resposta.getContentText());
  }
}
`;
}
