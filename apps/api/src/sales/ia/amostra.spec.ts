import { escolheAmostra } from "./amostra";

const c = (i: number, venda: boolean) => ({ id: i, humano: venda ? ("VENDA" as const) : null, sistema: venda ? ("VENDA" as const) : ("SEM_VENDA" as const) });
const candidatas = [...Array.from({ length: 50 }, (_, i) => c(i, true)), ...Array.from({ length: 450 }, (_, i) => c(1000 + i, false))];

describe("escolheAmostra", () => {
  it("reserva parte da amostra para conversas com venda", () => {
    const amostra = escolheAmostra(candidatas, 100);
    expect(amostra).toHaveLength(100);
    expect(amostra.filter((a) => a.sistema === "VENDA")).toHaveLength(50);
  });

  it("é repetível com a mesma semente e muda com outra", () => {
    const ids = (s: number) => escolheAmostra(candidatas, 40, s).map((a) => a.id);
    expect(ids(7)).toEqual(ids(7));
    expect(ids(7)).not.toEqual(ids(8));
  });

  it("completa com vendas quando faltam conversas sem venda", () => {
    const pouco = [...Array.from({ length: 30 }, (_, i) => c(i, true)), ...Array.from({ length: 5 }, (_, i) => c(100 + i, false))];
    expect(escolheAmostra(pouco, 30)).toHaveLength(30);
  });

  it("não repete conversa nem passa do que existe", () => {
    const amostra = escolheAmostra(candidatas, 1000);
    expect(new Set(amostra.map((a) => a.id)).size).toBe(amostra.length);
    expect(amostra).toHaveLength(500);
  });
});
