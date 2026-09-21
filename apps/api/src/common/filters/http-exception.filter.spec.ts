import { ArgumentsHost, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { HttpExceptionFilter } from "./http-exception.filter";

function contexto(url = "/whatsapp-webhook/evolution/segredo") {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: "POST", url, idDaRequisicao: "req-1" }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

/** O erro que o body-parser levanta quando o corpo passa do limite. */
function corpoGrandeDemais() {
  return Object.assign(new Error("request entity too large"), {
    type: "entity.too.large",
    length: 14_680_064,
    limit: 10_485_760,
  });
}

describe("HttpExceptionFilter", () => {
  let erro: jest.SpyInstance;
  let aviso: jest.SpyInstance;

  beforeEach(() => {
    erro = jest.spyOn(Logger.prototype, "error").mockImplementation();
    aviso = jest.spyOn(Logger.prototype, "warn").mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  /*
    Durante semanas isto chegava como 500 com pilha de dez quadros, e o log
    dizia "erro não tratado" para o limite funcionando. A mensagem inteira do
    WhatsApp se perdia e a linha parecia qualquer outro defeito interno.
  */
  describe("corpo maior que o limite", () => {
    it("responde 413, e não 500", () => {
      const { host, status, json } = contexto();

      new HttpExceptionFilter().catch(corpoGrandeDemais(), host);

      expect(status).toHaveBeenCalledWith(HttpStatus.PAYLOAD_TOO_LARGE);
      expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: "PAYLOAD_TOO_LARGE" }));
    });

    it("registra o tamanho e o limite, sem pilha", () => {
      const { host } = contexto();

      new HttpExceptionFilter().catch(corpoGrandeDemais(), host);

      // Aviso, não erro: quem lê precisa contar quantas foram recusadas, não
      // ler dez quadros de pilha do body-parser.
      expect(erro).not.toHaveBeenCalled();
      const registrado = JSON.parse(aviso.mock.calls[0][0] as string);
      expect(registrado).toMatchObject({
        event: "corpo_grande_demais",
        path: "/whatsapp-webhook/evolution/segredo",
        bytesRecebidos: 14_680_064,
        limite: 10_485_760,
      });
      expect(registrado).not.toHaveProperty("stack");
    });

    it("não confunde um 413 vindo do próprio produto com um corpo grande demais", () => {
      // Só o erro do body-parser tem `type: "entity.too.large"`. Reagir a
      // qualquer 413 roubaria a mensagem de quem a escreveu de propósito.
      const { host, json } = contexto();
      const nosso = new HttpException({ code: "ARQUIVO_GRANDE", message: "A logo passa de 2 MB." }, 413);

      new HttpExceptionFilter().catch(nosso, host);

      expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: "ARQUIVO_GRANDE" }));
    });
  });

  it("continua registrando erro de verdade com a pilha", () => {
    const { host, status } = contexto("/api/leads");

    new HttpExceptionFilter().catch(new Error("estourou"), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(JSON.parse(erro.mock.calls[0][0] as string)).toMatchObject({ event: "erro_nao_tratado" });
  });

  it("não registra erro do cliente", () => {
    const { host } = contexto("/api/leads");

    new HttpExceptionFilter().catch(new HttpException("faltou o telefone", 400), host);

    expect(erro).not.toHaveBeenCalled();
  });
});
