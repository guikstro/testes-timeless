import { coresDominantes } from "./cores-do-logo";

/** Uma imagem de mentira: `n` pixels de cada cor, em RGBA. */
function imagem(cores: [number, number, number, number, number][]): Uint8ClampedArray {
  const dados: number[] = [];
  for (const [r, g, b, a, n] of cores) for (let i = 0; i < n; i++) dados.push(r, g, b, a);
  return new Uint8ClampedArray(dados);
}

describe("cores do logo", () => {
  it("devolve a cor que mais aparece primeiro e ignora fundo branco, preto, cinza e transparente", () => {
    const pixels = imagem([
      [255, 255, 255, 255, 500],
      [10, 10, 10, 255, 300],
      [128, 128, 128, 255, 200],
      [0, 0, 0, 0, 400],
      [214, 40, 57, 255, 120],
      [240, 160, 30, 255, 60],
    ]);
    expect(coresDominantes(pixels)).toEqual(["#D62839", "#F0A01E"]);
  });

  it("junta tons quase iguais numa cor só", () => {
    const pixels = imagem([
      [0, 125, 94, 255, 50],
      [4, 128, 97, 255, 50],
    ]);
    expect(coresDominantes(pixels)).toHaveLength(1);
  });
});
