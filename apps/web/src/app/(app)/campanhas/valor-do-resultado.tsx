import { custo, inteiro, Resultado } from "@/lib/campanhas/resultado";

/** O resultado com a unidade escrita, a fonte e o custo por unidade quando dá para calcular. */
export function ValorDoResultado({ resultado }: { resultado: Resultado }) {
  const { valor, unidade, detalhe, custoCentavos } = resultado;
  return (
    <>
      <span className="block text-corpo font-semibold text-ink">
        {valor === null ? (
          <span className="font-normal text-ink-mute">Sem medida</span>
        ) : (
          <>
            <span className="font-display tabular-nums">{inteiro(valor)}</span> {valor === 1 ? unidade[0] : unidade[1]}
          </>
        )}
      </span>
      <span className="block text-apoio leading-snug text-ink-mute">
        {detalhe}
        {custoCentavos !== null ? `. ${custo(custoCentavos)} por ${unidade[0]}` : ""}
      </span>
    </>
  );
}
