/**
 * Uma recusa do Google, com o que a tela precisa para dizer o que fazer.
 *
 * Separada do erro de rede de propósito: recusa (permissão, cota, acesso
 * revogado) não melhora tentando de novo em segundos, e fica escrita na tela;
 * erro de rede volta para a fila, que tenta de novo.
 */
export class ErroDoGoogle extends Error {
  constructor(
    message: string,
    public readonly status: number,
    /** `invalid_grant`, `PERMISSION_DENIED`, `RESOURCE_EXHAUSTED`... como o Google escreve. */
    public readonly codigo: string | null,
  ) {
    super(message);
    this.name = "ErroDoGoogle";
  }

  /** O acesso da conta da equipe acabou: só conectando de novo. */
  get acessoPerdido(): boolean {
    return this.codigo === "invalid_grant" || this.status === 401;
  }
}

/** Lê o corpo de erro das APIs do Google, nos dois formatos que elas usam. */
export function erroDaResposta(status: number, corpo: unknown): ErroDoGoogle {
  const objeto = (corpo ?? {}) as Record<string, unknown>;
  // As APIs: { error: { code, message, status } }.
  if (objeto.error && typeof objeto.error === "object") {
    const erro = objeto.error as { message?: string; status?: string };
    return new ErroDoGoogle(erro.message ?? `O Google respondeu ${status}.`, status, erro.status ?? null);
  }
  // O OAuth: { error: "invalid_grant", error_description }.
  if (typeof objeto.error === "string") {
    const descricao = typeof objeto.error_description === "string" ? objeto.error_description : objeto.error;
    return new ErroDoGoogle(descricao, status, objeto.error);
  }
  return new ErroDoGoogle(`O Google respondeu ${status}.`, status, null);
}

/**
 * A recusa em português, com o próximo passo. O texto do Google vai junto no
 * fim, porque é o que a equipe procura na documentação dele.
 */
export function explicaErroDoGoogle(erro: ErroDoGoogle): string {
  const original = erro.message.slice(0, 300);
  if (erro.acessoPerdido) {
    return `A conta Google da equipe perdeu o acesso. Conecte de novo em Clientes, Perfil da Empresa. (Google: ${original})`;
  }
  if (erro.codigo === "RESOURCE_EXHAUSTED" || erro.status === 429) {
    return `O Google não liberou cota para esta leitura. Sem a aprovação do acesso à API do Perfil da Empresa, a cota é zero. (Google: ${original})`;
  }
  if (/has not been used|is disabled|SERVICE_DISABLED/i.test(erro.message)) {
    return `A API do Perfil da Empresa não está ativada no projeto do Google Cloud. Em APIs e serviços, Biblioteca, ative: My Business Account Management API, My Business Business Information API e Business Profile Performance API. (Google: ${original})`;
  }
  if (erro.codigo === "PERMISSION_DENIED" || erro.status === 403) {
    return `A conta Google da equipe não tem acesso a este perfil. Confira o convite de gerente no Gerenciador de Perfis. (Google: ${original})`;
  }
  if (erro.status === 404) {
    return `O Google não encontrou este perfil. Ele pode ter sido removido ou transferido. (Google: ${original})`;
  }
  return `O Google recusou a leitura. (Google: ${original})`;
}
