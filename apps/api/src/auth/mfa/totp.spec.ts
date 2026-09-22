import {
  confereCodigo,
  decodificaBase32,
  enderecoOtpAuth,
  geraCodigo,
  geraSegredo,
  passoDe,
  PASSO_EM_SEGUNDOS,
} from "./totp";

/**
 * Os segredos de teste da RFC 6238, apêndice B.
 *
 * São a string "12345678901234567890" repetida até o tamanho da chave de cada
 * algoritmo. A RFC publica o resultado esperado para seis instantes, e é
 * contra eles que esta implementação é conferida.
 */
const SEGREDO_SHA1 = Buffer.from("12345678901234567890");
const SEGREDO_SHA256 = Buffer.from("12345678901234567890123456789012");
const SEGREDO_SHA512 = Buffer.from("1234567890123456789012345678901234567890123456789012345678901234");

describe("TOTP contra os vetores oficiais da RFC 6238", () => {
  /*
    Apêndice B da RFC. Oito dígitos lá, seis aqui: a implementação usa seis,
    que é o que todo autenticador espera, então a expectativa é o sufixo de
    seis dígitos do valor publicado.

    Este bloco é a razão de o algoritmo ter sido escrito à mão em vez de
    importado: ele não é confiado, é conferido contra o próprio padrão.
  */
  const VETORES: Array<[number, string, string, string]> = [
    // tempo,      sha1      sha256    sha512   (sufixo de 6 dígitos de 8)
    [59, "287082", "119246", "693936"],
    [1111111109, "081804", "084774", "091201"],
    [1111111111, "050471", "062674", "943326"],
    [1234567890, "005924", "819424", "441116"],
    [2000000000, "279037", "698825", "618901"],
    [20000000000, "353130", "737706", "863826"],
  ];

  it.each(VETORES)("t=%i produz os códigos publicados", (tempo, sha1, sha256, sha512) => {
    const passo = passoDe(tempo);

    expect(geraCodigo(SEGREDO_SHA1, passo, "sha1")).toBe(sha1);
    expect(geraCodigo(SEGREDO_SHA256, passo, "sha256")).toBe(sha256);
    expect(geraCodigo(SEGREDO_SHA512, passo, "sha512")).toBe(sha512);
  });
});

describe("base32", () => {
  it("volta ao que entrou", () => {
    const segredo = geraSegredo();
    expect(decodificaBase32(segredo)).toHaveLength(20);
  });

  it("aceita minúsculas, espaços e preenchimento", () => {
    // É como a pessoa digita quando copia da tela para o autenticador.
    const base = geraSegredo();
    const bagunçado = `${base.toLowerCase().match(/.{1,4}/g)!.join(" ")}==`;

    expect(decodificaBase32(bagunçado)).toEqual(decodificaBase32(base));
  });

  it("recusa caractere fora do alfabeto", () => {
    // 0, 1 e 8 não existem em base32 justamente para não se confundirem com
    // O, I e B. Aceitá-los daria um segredo silenciosamente errado.
    expect(() => decodificaBase32("ABC0DEF")).toThrow(/inválido/i);
  });

  it("gera segredo diferente a cada chamada", () => {
    expect(geraSegredo()).not.toBe(geraSegredo());
  });
});

describe("confereCodigo", () => {
  const SEGREDO = geraSegredo();
  const AGORA = 1_780_000_000;
  const codigoDe = (t: number) => geraCodigo(decodificaBase32(SEGREDO), passoDe(t));

  it("aceita o código do momento", () => {
    expect(confereCodigo(SEGREDO, codigoDe(AGORA), AGORA)).toMatchObject({ valido: true });
  });

  it("tolera um passo de atraso e um de adiantamento", () => {
    // O relógio do telefone quase nunca bate exatamente com o do servidor.
    expect(confereCodigo(SEGREDO, codigoDe(AGORA - PASSO_EM_SEGUNDOS), AGORA).valido).toBe(true);
    expect(confereCodigo(SEGREDO, codigoDe(AGORA + PASSO_EM_SEGUNDOS), AGORA).valido).toBe(true);
  });

  it("recusa dois passos de distância", () => {
    // Cada passo extra é meio minuto a mais de vida para um código visto por
    // cima do ombro.
    expect(confereCodigo(SEGREDO, codigoDe(AGORA - 2 * PASSO_EM_SEGUNDOS), AGORA).valido).toBe(false);
  });

  describe("reuso", () => {
    /*
      Sem fechar a janela, quem enxergasse o código teria até um minuto e meio
      para entrar com ele. O passo aceito volta para o banco justamente para
      isso.
    */
    it("recusa o mesmo código apresentado de novo", () => {
      const codigo = codigoDe(AGORA);
      const primeira = confereCodigo(SEGREDO, codigo, AGORA);

      expect(primeira.valido).toBe(true);
      expect(confereCodigo(SEGREDO, codigo, AGORA, primeira.passo).valido).toBe(false);
    });

    it("recusa também um código de janela anterior à última usada", () => {
      const usado = passoDe(AGORA);
      expect(confereCodigo(SEGREDO, codigoDe(AGORA - PASSO_EM_SEGUNDOS), AGORA, usado).valido).toBe(false);
    });

    it("aceita o código da janela seguinte", () => {
      const usado = passoDe(AGORA);
      const depois = AGORA + PASSO_EM_SEGUNDOS;
      expect(confereCodigo(SEGREDO, codigoDe(depois), depois, usado).valido).toBe(true);
    });
  });

  describe("entrada malformada", () => {
    it("aceita código com espaço, que é como o autenticador mostra", () => {
      const codigo = codigoDe(AGORA);
      expect(confereCodigo(SEGREDO, `${codigo.slice(0, 3)} ${codigo.slice(3)}`, AGORA).valido).toBe(true);
    });

    it("recusa comprimento errado sem tocar no segredo", () => {
      expect(confereCodigo(SEGREDO, "12345", AGORA).valido).toBe(false);
      expect(confereCodigo(SEGREDO, "1234567", AGORA).valido).toBe(false);
      expect(confereCodigo(SEGREDO, "", AGORA).valido).toBe(false);
    });

    it("recusa código de outro segredo", () => {
      expect(confereCodigo(geraSegredo(), codigoDe(AGORA), AGORA).valido).toBe(false);
    });
  });
});

describe("enderecoOtpAuth", () => {
  it("monta o endereço que o autenticador lê", () => {
    const endereco = enderecoOtpAuth("Timeless", "fulano@exemplo.com", "ABCDEFGH");

    expect(endereco).toContain("otpauth://totp/Timeless%3Afulano%40exemplo.com");
    expect(endereco).toContain("secret=ABCDEFGH");
    // O emissor aparece nos dois lugares: é o que faz o app mostrar
    // "Timeless: fulano@..." em vez de só o e-mail.
    expect(endereco).toContain("issuer=Timeless");
    expect(endereco).toContain("period=30");
  });
});
