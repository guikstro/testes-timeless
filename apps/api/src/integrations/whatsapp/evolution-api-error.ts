/**
 * Erro vindo da Evolution API. Diferente da Graph API da Meta (que tem um
 * envelope `{error:{code,message}}` estável e documentado), a Evolution
 * devolve formatos variados conforme a rota e a versão — por isso a mensagem
 * é extraída defensivamente em `evolution-client.ts` e o status HTTP é o
 * sinal confiável para classificar o erro.
 */
export class EvolutionApiError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number,
  ) {
    super(message);
    this.name = "EvolutionApiError";
  }

  /** A instância não existe (ou foi removida) do lado da Evolution. */
  get isInstanceNotFound(): boolean {
    return this.httpStatus === 404;
  }

  /**
   * O número não está conectado: a sessão caiu, o QR expirou ou o usuário
   * desconectou o aparelho. Recuperável apenas relendo o QR Code.
   */
  get isDisconnected(): boolean {
    return this.httpStatus === 400 || this.httpStatus === 401 || this.httpStatus === 403;
  }
}
