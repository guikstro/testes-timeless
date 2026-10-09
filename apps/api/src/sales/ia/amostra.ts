import type { Gabarito } from "./gabarito";

/** Sorteio com semente: o mesmo teste, rodado de novo, escolhe as mesmas conversas. */
export function aleatorioComSemente(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function embaralha<T>(itens: T[], sorteio: () => number): T[] {
  const copia = [...itens];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(sorteio() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

/**
 * Escolhe até `max` conversas, com uma parte reservada às que têm venda (de
 * pessoas ou da regra). Sem isso, uma amostra ao acaso teria quase só
 * conversas sem venda, e o teste não diria nada sobre achar vendas.
 */
export function escolheAmostra<T extends Gabarito>(candidatas: T[], max: number, semente = 42, parteComVenda = 0.6): T[] {
  const sorteio = aleatorioComSemente(semente);
  const comVenda = embaralha(
    candidatas.filter((c) => c.humano === "VENDA" || c.sistema === "VENDA"),
    sorteio,
  );
  const semVenda = embaralha(
    candidatas.filter((c) => !(c.humano === "VENDA" || c.sistema === "VENDA")),
    sorteio,
  );

  const cota = Math.ceil(max * parteComVenda);
  const escolhidas = [...comVenda.slice(0, cota), ...semVenda.slice(0, Math.max(0, max - Math.min(cota, comVenda.length)))];
  // Faltou conversa sem venda para completar: o resto sai das com venda.
  if (escolhidas.length < max) escolhidas.push(...comVenda.slice(cota, cota + (max - escolhidas.length)));
  return escolhidas.slice(0, max);
}
