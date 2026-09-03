export const WHATSAPP_EVENTS_QUEUE = "whatsapp-events";
export const WHATSAPP_SEND_QUEUE = "whatsapp-send";
export const META_SYNC_QUEUE = "meta-sync";
export const META_CONVERSIONS_QUEUE = "meta-conversions";
/** Entrega de e-mail, fora do caminho da requisição. */
export const EMAIL_QUEUE = "email";
/** Limpeza periódica do que já não serve para ninguém. */
export const MANUTENCAO_QUEUE = "manutencao";

/**
 * Nomes dos jobs da fila de sincronia da Meta.
 *
 * Duas formas na mesma fila: a periódica não tem organização e só abre o
 * leque, e a de uma sincroniza um cliente. Separar por nome deixa o
 * processador escolher sem inspecionar o formato do dado.
 */
export const SINCRONIA_PERIODICA = "sincronizar-todas";
export const SINCRONIA_DE_UMA = "sync";

/** O job diário de faxina. */
export const FAXINA_PERIODICA = "faxina";
