/**
 * O endereço do WhatsApp montado a partir do número.
 *
 * O campo pedia uma URL, e quase todo link aqui leva ao WhatsApp: a pessoa
 * precisava saber que existe o formato wa.me, que o número vai com 55 na
 * frente e sem traço nem parêntese. Agora ela digita o número como escreve
 * no cartão, e o endereço sai daqui.
 */

/** Só os dígitos, com o 55 do Brasil quando o número vier sem ele. */
export function numeroInternacional(telefone: string): string | null {
  const digitos = telefone.replace(/\D/g, "");
  // Com "+" na frente, a pessoa já disse o país: se não é o 55, não é um
  // número daqui, e completar com 55 mandaria o clique para outra pessoa.
  if (telefone.trim().startsWith("+") && !digitos.startsWith("55")) return null;
  // DDD + número tem 10 ou 11 dígitos; com o 55 na frente, 12 ou 13.
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith("55")) return digitos;
  return null;
}

/**
 * A mensagem vai pronta porque é ela que o sistema usa para reconhecer o
 * clique: a marca do rastreio é acrescentada ao final dela no redirecionamento.
 * Sem mensagem, a pessoa chega com a tela em branco e com um "Olá!" genérico.
 */
export function destinoDoWhatsApp(telefone: string, mensagem: string): string | null {
  const numero = numeroInternacional(telefone);
  if (!numero) return null;
  const texto = mensagem.trim();
  return texto ? `https://wa.me/${numero}?text=${encodeURIComponent(texto)}` : `https://wa.me/${numero}`;
}
