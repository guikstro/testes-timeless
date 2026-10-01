import { chaveDoAviso, comDispensado, leDispensados } from "./avisos-dispensados";

describe("avisos dispensados", () => {
  const org = "94769394-5492-42eb-acf6-1d3dc7290d99";

  it("guarda a chave da organização e da situação, sem repetir", () => {
    const chave = chaveDoAviso(org, "sem-whatsapp");
    const valor = comDispensado(comDispensado(null, chave), chave);
    expect(leDispensados(valor)).toEqual([chave]);
  });

  /*
    Fechar o aviso de "sem WhatsApp" não pode calar o de "o WhatsApp caiu":
    é outra situação, e ela precisa ser dita.
  */
  it("situações diferentes são chaves diferentes", () => {
    const valor = comDispensado(null, chaveDoAviso(org, "sem-whatsapp"));
    expect(leDispensados(valor)).not.toContain(chaveDoAviso(org, "whatsapp-fora"));
  });

  it("não cresce sem fim: as mais antigas saem", () => {
    let valor: string | null = null;
    for (let n = 0; n < 40; n += 1) valor = comDispensado(valor, chaveDoAviso(`org-${n}`, "sem-whatsapp"));
    const chaves = leDispensados(valor);
    expect(chaves).toHaveLength(30);
    expect(chaves[0]).toBe("org-10:sem-whatsapp");
  });

  it("ignora o que não é chave", () => {
    expect(leDispensados("%E0%A4%A")).toEqual([]);
    expect(leDispensados(encodeURIComponent("org-1:sem-whatsapp,<script>,x"))).toEqual(["org-1:sem-whatsapp"]);
  });
});
