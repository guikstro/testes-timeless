/**
 * Quanto esperar quando a Meta bloqueia as chamadas de uma conta.
 *
 * No acesso limitado da API de Marketing, o padrão de todo app novo, cada
 * conta de anúncios tem teto de 60 pontos (cada leitura vale 1), o saldo se
 * renova em 5 minutos, e quem estoura fica 5 minutos bloqueado. Tentar de
 * novo dentro do bloqueio não adianta: a chamada é recusada, conta como erro
 * e mantém o saldo estourado. E o erro pesa: a Meta só libera o acesso
 * completo para quem tem menos de 15% de erro nas últimas 500 chamadas.
 *
 * A própria Meta diz quanto falta, em dois cabeçalhos da resposta: um em
 * minutos (`X-Business-Use-Case-Usage`) e outro em segundos
 * (`X-Ad-Account-Usage`). Sem nenhum dos dois, vale o bloqueio padrão.
 */

/** O bloqueio do acesso limitado, em segundos. */
export const BLOQUEIO_PADRAO_S = 300;

/** Um minuto a mais, para a próxima tentativa não cair no último segundo do bloqueio. */
const FOLGA_S = 60;

/** Acima disto o valor do cabeçalho não é espera, é defeito: seis horas. */
const ESPERA_MAXIMA_S = 6 * 60 * 60;

interface Cabecalhos {
  get(nome: string): string | null;
}

function leJson(texto: string | null | undefined): unknown {
  if (!texto) return null;
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

/**
 * Quantos segundos a Meta diz faltar para liberar, ou null quando ela não diz.
 *
 * Quando os dois cabeçalhos vêm, vale o maior: liberar um limite não adianta
 * se o outro continua fechado.
 */
export function segundosAteLiberar(cabecalhos: Cabecalhos | null | undefined): number | null {
  if (!cabecalhos || typeof cabecalhos.get !== "function") return null;
  const esperas: number[] = [];

  // `{ "<id da empresa>": [{ "type": "ads_management", "estimated_time_to_regain_access": 19, ... }] }`, em minutos.
  const porCasoDeUso = leJson(cabecalhos.get("x-business-use-case-usage"));
  if (porCasoDeUso && typeof porCasoDeUso === "object") {
    for (const lista of Object.values(porCasoDeUso as Record<string, unknown>)) {
      if (!Array.isArray(lista)) continue;
      for (const item of lista) {
        const minutos = Number((item as { estimated_time_to_regain_access?: unknown })?.estimated_time_to_regain_access);
        if (Number.isFinite(minutos) && minutos > 0) esperas.push(minutos * 60);
      }
    }
  }

  // `{ "acc_id_util_pct": 100, "reset_time_duration": 280, ... }`, em segundos.
  const daConta = leJson(cabecalhos.get("x-ad-account-usage"));
  const segundos = Number((daConta as { reset_time_duration?: unknown } | null)?.reset_time_duration);
  if (Number.isFinite(segundos) && segundos > 0) esperas.push(segundos);

  return esperas.length > 0 ? Math.max(...esperas) : null;
}

/**
 * Quando vale tentar de novo.
 *
 * Nunca antes do bloqueio padrão, mesmo que o cabeçalho diga menos: o saldo
 * pode liberar antes do bloqueio acabar, e a Meta recusa do mesmo jeito.
 */
export function liberadaEm(agora: Date, segundosDaMeta: number | null | undefined): Date {
  const espera = Math.min(Math.max(segundosDaMeta ?? 0, BLOQUEIO_PADRAO_S), ESPERA_MAXIMA_S) + FOLGA_S;
  return new Date(agora.getTime() + espera * 1000);
}
