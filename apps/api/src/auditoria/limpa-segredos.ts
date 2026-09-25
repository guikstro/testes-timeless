/**
 * Tira de um estado anterior ou posterior tudo o que é segredo, antes de ele
 * ir para a auditoria.
 *
 * A auditoria é lida por gente da conta do cliente, e um registro que carrega
 * o token da Meta ou o hash de uma senha transforma a tela de auditoria no
 * lugar mais fácil de roubar uma credencial. Por isso a limpeza é por nome de
 * campo, na gravação, e não por cuidado de quem chama: basta um chamador
 * esquecer para o segredo ficar gravado para sempre.
 *
 * Erra para o lado de apagar: um campo inofensivo que por acaso se chama
 * "chave" sai do registro, e isso é um custo pequeno perto do contrário.
 */

const NOMES_DE_SEGREDO =
  /(senha|password|passwd|token|secret|segredo|hash|api[_-]?key|apikey|chave|credential|credencial|authorization|cookie|codigo|recovery|otpauth|totp)/i;

export const OMITIDO = "[omitido]";

/** Até onde descer num objeto. Mais fundo que isso não é estado, é carga. */
const PROFUNDIDADE_MAXIMA = 6;

export function limpaSegredos(valor: unknown, profundidade = 0): unknown {
  if (valor === null || valor === undefined) return valor;
  if (profundidade > PROFUNDIDADE_MAXIMA) return OMITIDO;

  if (Array.isArray(valor)) return valor.map((item) => limpaSegredos(item, profundidade + 1));

  if (valor instanceof Date) return valor.toISOString();

  if (typeof valor === "object") {
    const limpo: Record<string, unknown> = {};
    for (const [campo, conteudo] of Object.entries(valor as Record<string, unknown>)) {
      limpo[campo] = NOMES_DE_SEGREDO.test(campo) ? OMITIDO : limpaSegredos(conteudo, profundidade + 1);
    }
    return limpo;
  }

  return valor;
}
