import { CONFIGURACAO_DO_WEBHOOK, EvolutionWebhookRegistrado } from "./evolution-client";

/**
 * Compara o webhook que a Evolution tem registrado com o que este produto
 * precisa, e devolve por que ele está errado.
 *
 * Os motivos não são enfeite de log. Quando uma instância volta a receber
 * mensagem depois de semanas sem receber, a pergunta é sempre "o que estava
 * errado", e a resposta precisa estar escrita, não deduzida do código da
 * versão que rodava naquele dia.
 */
export function conferenciaDoWebhook(
  registrado: EvolutionWebhookRegistrado | null,
  urlEsperada: string,
): string[] {
  if (!registrado) return ["sem webhook registrado"];

  const motivos: string[] = [];

  if (!registrado.habilitado) motivos.push("desabilitado");
  if (registrado.url !== urlEsperada) motivos.push("url diferente da atual");

  /*
    O motivo desta função existir.

    Uma instância criada antes de `base64: false` continua embutindo a mídia
    inteira no payload. Com a inflação de 4/3 da codificação, um vídeo comum
    passa do limite do body parser e a requisição morre antes de chegar no
    controller: perde-se a mensagem toda, não só o anexo.
  */
  if (registrado.base64 !== CONFIGURACAO_DO_WEBHOOK.base64) motivos.push("mídia embutida em base64");

  if (registrado.porEvento !== CONFIGURACAO_DO_WEBHOOK.byEvents) motivos.push("entrega separada por evento");

  /*
    Falta de evento é defeito; evento a mais também.

    Faltando, a mensagem nunca chega. Sobrando, a Evolution manda presença e
    digitação a cada tecla de cada conversa, tráfego constante que o pipeline
    descarta logo depois de receber.
  */
  const esperados = [...CONFIGURACAO_DO_WEBHOOK.events].sort();
  const atuais = [...registrado.eventos].sort();
  if (esperados.join(",") !== atuais.join(",")) motivos.push("lista de eventos diferente");

  return motivos;
}
