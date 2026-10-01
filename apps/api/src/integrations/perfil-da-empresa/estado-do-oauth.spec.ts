import { confereEstado, criaEstado, voltaValida } from "./estado-do-oauth";

describe("o estado do OAuth do Google", () => {
  const anterior = process.env.JWT_SECRET;
  beforeAll(() => {
    process.env.JWT_SECRET = "segredo-de-teste-com-mais-de-trinta-e-dois-caracteres";
  });
  afterAll(() => {
    process.env.JWT_SECRET = anterior;
  });

  const cliente = "/clientes/6f1d2c3b-0000-4000-8000-000000000001";

  it("volta para onde começou, quando quem conclui é quem começou", () => {
    const estado = criaEstado("operador-1", cliente);
    expect(confereEstado(estado, "operador-1")).toEqual({ volta: cliente });
  });

  it("recusa o estado de outra pessoa, adulterado ou vencido", () => {
    const agora = Date.now();
    const estado = criaEstado("operador-1", cliente, agora);
    expect(confereEstado(estado, "operador-2", agora)).toBeNull();

    const [dados, assinatura] = estado.split(".");
    const outro = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(dados, "base64url").toString()), u: "operador-2" })).toString("base64url");
    expect(confereEstado(`${outro}.${assinatura}`, "operador-2", agora)).toBeNull();
    expect(confereEstado(`${dados}.${assinatura}x`, "operador-1", agora)).toBeNull();
    expect(confereEstado("lixo", "operador-1", agora)).toBeNull();

    expect(confereEstado(estado, "operador-1", agora + 16 * 60_000)).toBeNull();
  });

  it("não vira redirecionamento aberto", () => {
    expect(voltaValida("https://outro-site.com")).toBe("/clientes");
    expect(voltaValida("//outro-site.com")).toBe("/clientes");
    expect(voltaValida("/clientes/../dashboard")).toBe("/clientes");
    expect(voltaValida(undefined)).toBe("/clientes");
    expect(voltaValida(cliente)).toBe(cliente);
  });
});
