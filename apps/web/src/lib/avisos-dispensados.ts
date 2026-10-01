/**
 * Os avisos que a pessoa fechou, guardados num cookie do navegador.
 *
 * Cookie, e não armazenamento do navegador: o servidor lê o cookie e nem
 * desenha o aviso fechado. Com o armazenamento do navegador, o aviso
 * aparecia a cada tela e sumia meio segundo depois, que é pior do que não
 * deixar fechar.
 *
 * A chave junta a organização e a situação ("sem-whatsapp", "whatsapp-fora"):
 * fechar o aviso de uma conta não fecha o de outra, e uma situação nova
 * (o WhatsApp que estava conectado e caiu) volta a avisar.
 */

export const COOKIE_DOS_AVISOS = "avisos_dispensados";

/** Quantas chaves cabem: as mais antigas saem, e o cookie não cresce sem fim. */
const MAXIMO = 30;

export function chaveDoAviso(organizacaoId: string, situacao: string): string {
  return `${organizacaoId}:${situacao}`;
}

/** As chaves do cookie. Texto que não é chave (de outra versão, mexido à mão) fica de fora. */
export function leDispensados(valor: string | null | undefined): string[] {
  if (!valor) return [];
  let texto = valor;
  try {
    texto = decodeURIComponent(valor);
  } catch {
    return [];
  }
  return texto.split(",").filter((chave) => /^[\w-]+:[\w-]+$/.test(chave));
}

/** O valor novo do cookie, com a chave no fim e sem repetir. */
export function comDispensado(valor: string | null | undefined, chave: string): string {
  const chaves = leDispensados(valor).filter((existente) => existente !== chave);
  chaves.push(chave);
  return encodeURIComponent(chaves.slice(-MAXIMO).join(","));
}
