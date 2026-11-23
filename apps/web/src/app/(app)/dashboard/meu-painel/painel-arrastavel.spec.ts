import { comparaAB, move } from "./painel-arrastavel";

describe("move", () => {
  it("leva o item para a nova posição sem mexer na lista original", () => {
    const lista = ["a", "b", "c", "d"];
    expect(move(lista, 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(move(lista, 3, 0)).toEqual(["d", "a", "b", "c"]);
    expect(move(lista, 1, 99)).toEqual(["a", "c", "d", "b"]);
    expect(lista).toEqual(["a", "b", "c", "d"]);
  });
});

describe("comparaAB", () => {
  const link = (cliques: number, leads: number) => ({ id: "x", name: "x", code: "x", _count: { clicks: cliques }, leads });
  it("aponta o link com mais lead por clique", () => {
    expect(comparaAB(link(100, 10), link(50, 10)).vencedor).toBe("B");
  });
  it("não declara vencedor sem clique ou empatado", () => {
    expect(comparaAB(link(0, 0), link(10, 1)).vencedor).toBeNull();
    expect(comparaAB(link(10, 1), link(20, 2)).vencedor).toBeNull();
  });
});
