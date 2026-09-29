/**
 * De quando é o dado que a tela mostra.
 *
 * O script do Google e a sincronia da Meta rodam de hora em hora. Três horas
 * sem dado novo é sinal de que pararam: a mesma régua da Saúde da plataforma.
 * Sem isto, uma conexão viva que parou de mandar número mente do mesmo jeito
 * que uma desligada, porque a tela continua cheia.
 */
export const ATRASO_MAXIMO_MS = 3 * 60 * 60 * 1000;

export type EstadoDaFonte = "em-dia" | "atrasada" | "falha";

export interface FrescorDaFonte {
  estado: EstadoDaFonte;
  /** Quando o último dado chegou. Null quando nunca chegou. */
  atualizadoEm: string | null;
  /** O motivo, quando não está em dia, em palavras de gente. */
  motivo: string | null;
}

interface ConexaoDaMeta {
  status: string;
  lastSyncedAt: Date | null;
}

interface ConexaoDoGoogle {
  ultimoEnvioEm: Date | null;
}

const atrasado = (quando: Date, agora: Date) => agora.getTime() - quando.getTime() > ATRASO_MAXIMO_MS;

/**
 * A Meta desligada de propósito não aparece: não é dado velho, é dado que
 * ninguém espera. Token vencido e sincronia com erro aparecem como falha,
 * mesmo com a última sincronia recente, porque a próxima não vem.
 */
export function frescorDaMeta(conexao: ConexaoDaMeta | null, agora = new Date()): FrescorDaFonte | null {
  if (!conexao || conexao.status === "DISCONNECTED") return null;
  const atualizadoEm = conexao.lastSyncedAt?.toISOString() ?? null;
  if (conexao.status === "TOKEN_EXPIRED") return { estado: "falha", atualizadoEm, motivo: "O acesso à Meta venceu; reconecte em Integrações." };
  if (conexao.status === "SYNC_FAILED") return { estado: "falha", atualizadoEm, motivo: "A última sincronia com a Meta falhou." };
  if (!conexao.lastSyncedAt) return { estado: "atrasada", atualizadoEm, motivo: "A Meta ainda não sincronizou." };
  if (atrasado(conexao.lastSyncedAt, agora)) return { estado: "atrasada", atualizadoEm, motivo: "A Meta sincroniza de hora em hora e passou de 3 horas sem sincronizar." };
  return { estado: "em-dia", atualizadoEm, motivo: null };
}

export function frescorDoGoogle(conexao: ConexaoDoGoogle | null, agora = new Date()): FrescorDaFonte | null {
  if (!conexao) return null;
  const atualizadoEm = conexao.ultimoEnvioEm?.toISOString() ?? null;
  if (!conexao.ultimoEnvioEm) return { estado: "atrasada", atualizadoEm, motivo: "O script do Google Ads ainda não mandou nada." };
  if (atrasado(conexao.ultimoEnvioEm, agora)) {
    return { estado: "atrasada", atualizadoEm, motivo: "O script roda de hora em hora e passou de 3 horas sem enviar." };
  }
  return { estado: "em-dia", atualizadoEm, motivo: null };
}
