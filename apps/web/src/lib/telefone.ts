/**
 * Telefone como uma pessoa escreve: "(85) 99999-9999".
 *
 * O banco guarda "+5585999999999", que é bom para comparar e ruim para ler.
 * Número de fora do Brasil, ou que não tem o tamanho de um celular ou fixo
 * brasileiro, aparece como veio: inventar uma máscara errada seria pior.
 */
export function formataTelefone(numero: string | null | undefined): string {
  if (!numero) return "";
  const digitos = numero.replace(/\D/g, "");
  const local = digitos.startsWith("55") && (digitos.length === 12 || digitos.length === 13) ? digitos.slice(2) : null;
  if (!local) return numero;
  const ddd = local.slice(0, 2);
  const resto = local.slice(2);
  const meio = resto.length === 9 ? 5 : 4;
  return `(${ddd}) ${resto.slice(0, meio)}-${resto.slice(meio)}`;
}
