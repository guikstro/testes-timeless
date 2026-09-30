/**
 * Meta's Graph API error shape: `{ error: { message, type, code,
 * error_subcode, fbtrace_id } }`. Code 190 = expired/invalid token; codes
 * 4/17/32/613 (and HTTP 429) = rate limiting — see
 * https://developers.facebook.com/docs/graph-api/guides/error-handling.
 * The 80000 range is the Marketing API's per-ad-account limit (Business Use
 * Case), which is the one a sync actually hits.
 */
export class MetaApiError extends Error {
  constructor(
    public readonly code: number | undefined,
    public readonly subcode: number | undefined,
    message: string,
    public readonly httpStatus?: number,
    /** Quanto a Meta diz faltar para liberar as chamadas, quando ela diz. Ver `limite-da-meta.ts`. */
    public readonly segundosAteLiberar: number | null = null,
  ) {
    super(message);
    this.name = "MetaApiError";
  }

  get isTokenExpired(): boolean {
    return this.code === 190;
  }

  get isRateLimited(): boolean {
    const code = this.code ?? -1;
    return this.httpStatus === 429 || [4, 17, 32, 613].includes(code) || (code >= 80000 && code <= 80014);
  }
}

/**
 * O erro da Meta em português, dizendo o que fazer.
 *
 * É o que aparece para o cliente na tela de integração. A mensagem crua da
 * Meta ("API access blocked") vai junto, entre parênteses, porque é por ela
 * que o suporte da Meta e as buscas encontram o problema.
 */
export function explicaErroDaMeta(erro: MetaApiError, adAccountId?: string): string {
  const crua = erro.message;
  const conta = adAccountId ?? "a conta de anúncios";
  const texto = (() => {
    if (erro.code === 190) {
      return "O token não vale mais: expirou, foi revogado ou foi copiado pela metade. Gere um novo no usuário do sistema e conecte de novo.";
    }
    if (/api access blocked/i.test(crua)) {
      return (
        "A Meta bloqueou o acesso do app à API. Isso é do lado da Meta: abra o app em developers.facebook.com e veja se há aviso de " +
        "restrição, se o produto API de Marketing está adicionado e se o portfólio empresarial está verificado. Depois gere um token novo."
      );
    }
    if (erro.isRateLimited) {
      return (
        "A Meta bloqueou as chamadas desta conta por alguns minutos, por excesso de pedidos. O sistema espera o bloqueio " +
        "acabar e tenta de novo sozinho. Se acontecer sempre, o app ainda está no acesso limitado da API de Marketing: " +
        "peça o acesso completo em developers.facebook.com, no recurso Marketing API Access Tier."
      );
    }
    if (erro.code === 2635 || /deprecated version/i.test(crua)) {
      return "A Meta desativou a versão da API que o sistema usa. Avise a equipe Timeless.";
    }
    if (erro.code === 100 && (erro.subcode === 33 || /does not exist|cannot be loaded/i.test(crua))) {
      return `A Meta não encontrou ${conta}, ou o token não a enxerga. Confira o número, com act_ na frente, e se a conta foi atribuída ao usuário do sistema.`;
    }
    if (erro.code === 10 || (erro.code !== undefined && erro.code >= 200 && erro.code < 300)) {
      return `O token não tem permissão para ler ${conta}. Confira se ele tem ads_read e se a conta foi atribuída ao usuário do sistema.`;
    }
    return null;
  })();
  return texto ? `${texto} (Meta: ${crua})` : crua;
}
