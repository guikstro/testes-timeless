/**
 * Data em linguagem de gente ("há 2 dias").
 *
 * Numa lista que se lê de cima para baixo, "há 2 dias" responde a pergunta
 * direto, enquanto "29/08/2026 14:32" obriga cada linha a uma subtração mental.
 * A data exata continua acessível no `title` do elemento, para quem precisa
 * dela em vez do intervalo.
 */
export function tempoRelativo(iso: string): string {
  const entao = new Date(iso).getTime();
  const segundos = Math.round((Date.now() - entao) / 1000);

  if (segundos < 60) return "agora";
  if (segundos < 3600) {
    const min = Math.floor(segundos / 60);
    return `há ${min} min`;
  }
  if (segundos < 86400) {
    const horas = Math.floor(segundos / 3600);
    return `há ${horas}h`;
  }

  const dias = Math.floor(segundos / 86400);
  if (dias === 1) return "ontem";
  if (dias < 30) return `há ${dias} dias`;
  if (dias < 365) {
    const meses = Math.round(dias / 30);
    return meses === 1 ? "há 1 mês" : `há ${meses} meses`;
  }
  const anos = Math.round(dias / 365);
  return anos === 1 ? "há 1 ano" : `há ${anos} anos`;
}

export function dataCompleta(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR");
}
