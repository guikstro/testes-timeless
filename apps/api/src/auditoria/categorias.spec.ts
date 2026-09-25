import { AuditAction } from "@prisma/client";
import { CATEGORIAS } from "./categorias";

describe("CATEGORIAS", () => {
  it("põe cada tipo de ação em exatamente um grupo, para nenhum sumir do filtro", () => {
    const todas = Object.values(AuditAction);
    const agrupadas = Object.values(CATEGORIAS).flatMap((c) => c.acoes as AuditAction[]);
    expect([...agrupadas].sort()).toEqual([...todas].sort());
  });
});
