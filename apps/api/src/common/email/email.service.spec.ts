import { Queue } from "bullmq";
import { EmailService } from "./email.service";
import { emailAlterado, recuperacaoDeSenha, senhaAlterada } from "./mensagens";
import { EmailDeRegistro } from "./email-de-registro";

describe("EmailService", () => {
  function montar() {
    const fila = { add: jest.fn().mockResolvedValue(undefined) };
    return { servico: new EmailService(fila as unknown as Queue), fila };
  }

  it("enfileira com retentativa e some do Redis depois de entregue", async () => {
    const { servico, fila } = montar();

    await servico.enfileirar({ para: "ana@x.com", assunto: "Oi", texto: "corpo" });

    const [, dados, opcoes] = fila.add.mock.calls[0];
    expect(dados).toMatchObject({ para: "ana@x.com", assunto: "Oi" });
    // O corpo pode carregar um link de recuperação: não há motivo para ele
    // sobreviver no Redis depois da entrega.
    expect(opcoes).toMatchObject({ attempts: 5, removeOnComplete: true });
  });

  it("nunca lança quando a fila está fora", async () => {
    const { servico, fila } = montar();
    fila.add.mockRejectedValue(new Error("redis fora"));

    /*
      Quem chama isto está no meio de trocar uma senha ou responder um pedido
      de recuperação. Derrubar a operação inteira porque o aviso sobre ela não
      pôde ser enfileirado seria trocar um problema pequeno por um grande.
    */
    await expect(
      servico.enfileirar({ para: "ana@x.com", assunto: "Oi", texto: "corpo" }),
    ).resolves.toBeUndefined();
  });
});

describe("mensagens", () => {
  it("o link de recuperação vai inteiro no corpo, e diz o prazo", () => {
    const m = recuperacaoDeSenha("ana@x.com", "Ana", "https://app.x.com/redefinir-senha?token=abc");

    expect(m.texto).toContain("https://app.x.com/redefinir-senha?token=abc");
    expect(m.texto).toContain("uma hora");
    // Quem não pediu precisa saber que pode ignorar sem risco.
    expect(m.texto).toContain("ignore este e-mail");
  });

  it("o aviso de troca de e-mail vai para o endereço antigo e nomeia o novo", () => {
    const m = emailAlterado("antigo@x.com", "Ana", "novo@x.com");

    // O endereço antigo é o único canal que ainda alcança o dono legítimo
    // depois de uma tomada de conta.
    expect(m.para).toBe("antigo@x.com");
    expect(m.texto).toContain("novo@x.com");
  });

  it("nenhum deles depende de HTML para ser lido", () => {
    const todos = [
      recuperacaoDeSenha("a@x.com", "Ana", "https://x.com/r"),
      senhaAlterada("a@x.com", "Ana"),
      emailAlterado("a@x.com", "Ana", "b@x.com"),
    ];

    // Um e-mail de segurança precisa chegar e ser lido. Texto puro atravessa
    // qualquer leitor e qualquer filtro sem virar uma caixa vazia.
    for (const m of todos) {
      expect(m.html).toBeUndefined();
      expect(m.texto.length).toBeGreaterThan(40);
      expect(m.assunto).not.toBe("");
    }
  });
});

describe("EmailDeRegistro", () => {
  it("não tenta entregar nada, só registra", async () => {
    const provedor = new EmailDeRegistro();
    const registrar = jest.spyOn(provedor["logger"], "log").mockImplementation(() => undefined);

    await provedor.enviar({ para: "ana@x.com", assunto: "Oi", texto: "corpo" });

    expect(provedor.nome).toBe("registro");
    expect(registrar).toHaveBeenCalledWith(expect.stringContaining("email_nao_enviado_apenas_registrado"));
  });
});
