/** Minúsculas, sem acento e sem pontuação solta: "Fechado!" e "fechado" são o mesmo trecho. */
const normaliza = (texto: string) =>
  texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}$%]+/gu, " ")
    .trim();

/**
 * Confere que cada trecho que a IA citou existe de verdade na conversa. É a
 * defesa contra uma evidência inventada: o modelo pode errar, mas não pode
 * citar o que ninguém escreveu. Reticências ("fechado ... pix") valem como
 * dois trechos, que precisam existir cada um.
 */
export function validaCitacoes(citacoes: string[], transcricao: string): { validas: string[]; invalidas: string[] } {
  const base = normaliza(transcricao);
  const validas: string[] = [];
  const invalidas: string[] = [];

  for (const citacao of citacoes) {
    const pedacos = citacao
      .split(/\.{3}|…/)
      .map(normaliza)
      .filter((p) => p.length > 0);
    const ok = pedacos.length > 0 && pedacos.every((p) => p.length >= 3 && base.includes(p));
    (ok ? validas : invalidas).push(citacao);
  }
  return { validas, invalidas };
}
