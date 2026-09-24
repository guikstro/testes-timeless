import { destinoDoWhatsApp, numeroInternacional } from "./destino";

describe("numeroInternacional", () => {
  it("aceita o número como se escreve no cartão", () => {
    expect(numeroInternacional("(85) 99999-9999")).toBe("5585999999999");
    expect(numeroInternacional("85 3333-4444")).toBe("558533334444");
  });

  it("não duplica o 55 de quem já digitou", () => {
    expect(numeroInternacional("+55 85 99999-9999")).toBe("5585999999999");
  });

  it("recusa o que não tem cara de número brasileiro", () => {
    expect(numeroInternacional("9999-9999")).toBeNull();
    expect(numeroInternacional("")).toBeNull();
    expect(numeroInternacional("+1 212 555 0100")).toBeNull();
  });
});

describe("destinoDoWhatsApp", () => {
  it("monta o wa.me com a mensagem pronta", () => {
    expect(destinoDoWhatsApp("(85) 99999-9999", "Olá, vim pelo Google")).toBe(
      "https://wa.me/5585999999999?text=Ol%C3%A1%2C%20vim%20pelo%20Google",
    );
  });

  it("deixa sem texto quando não há mensagem", () => {
    expect(destinoDoWhatsApp("85999999999", "  ")).toBe("https://wa.me/5585999999999");
  });

  it("não monta endereço com número inválido", () => {
    expect(destinoDoWhatsApp("123", "Olá")).toBeNull();
  });
});
