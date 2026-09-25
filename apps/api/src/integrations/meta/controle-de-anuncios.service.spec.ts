import { AuditoriaService } from "../../auditoria/auditoria.service";
import { MembershipRole } from "@prisma/client";
import { ControleDeAnunciosService } from "./controle-de-anuncios.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { EncryptionService } from "../../common/encryption/encryption.service";
import { MetaGraphClient } from "./meta-graph-client";
import { BudgetsService } from "../../budgets/budgets.service";
import { MetaApiError } from "./meta-api-error";
import { AppException } from "../../common/exceptions/app-exception";
import { AuthenticatedUser } from "../../auth/jwt-payload.interface";

/** `AppException` guarda o código dentro da resposta HTTP, não como propriedade. */
async function codigoDoErro(promessa: Promise<unknown>): Promise<string> {
  try {
    await promessa;
  } catch (erro) {
    return ((erro as AppException).getResponse() as { code: string }).code;
  }
  throw new Error("esperava um erro, e nada foi lançado");
}

function usuario(role: MembershipRole = "OWNER"): AuthenticatedUser {
  return { userId: "u1", organizationId: "org-1", role, impersonating: false };
}

function monta() {
  const prisma = {
    ad: { findFirst: jest.fn().mockResolvedValue({ id: "ad-int", name: "Vídeo 01", status: "ACTIVE" }), update: jest.fn() },
    adSet: { findFirst: jest.fn().mockResolvedValue({ id: "set-int", name: "Fortaleza", status: "ACTIVE" }), update: jest.fn() },
    campaign: { findFirst: jest.fn().mockResolvedValue({ id: "c-int", name: "Trabalhista", status: "ACTIVE" }), update: jest.fn() },
    metaConnection: { findUnique: jest.fn().mockResolvedValue({ status: "CONNECTED", accessTokenEncrypted: "cifrado" }) },
    mudancaNoAnuncio: {
      create: jest.fn().mockResolvedValue({ id: "reg-1" }),
      update: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const encryption = { decrypt: jest.fn().mockReturnValue("token-real"), encrypt: jest.fn() };
  const meta = { atualizarStatus: jest.fn(), atualizarOrcamentoDiario: jest.fn() };
  const verbas = { resumo: jest.fn().mockResolvedValue(null) };
  const fila = { add: jest.fn() };

  const auditoria = { registra: jest.fn().mockResolvedValue(undefined) };
  const service = new ControleDeAnunciosService(
    prisma as unknown as PrismaService,
    encryption as unknown as EncryptionService,
    meta as unknown as MetaGraphClient,
    verbas as unknown as BudgetsService,
    fila as never,
    auditoria as unknown as AuditoriaService,
  );
  return { service, prisma, meta, verbas, fila, encryption, auditoria };
}

describe("ControleDeAnunciosService", () => {
  describe("quem pode escrever", () => {
    it("recusa MEMBER antes de falar com a Meta", async () => {
      const { service, meta, prisma } = monta();

      await expect(service.mudarStatus(usuario("MEMBER"), "ANUNCIO", "ad1", "PAUSED")).rejects.toThrow(AppException);
      // Nem chamada, nem linha no histórico: a recusa é anterior a tudo.
      expect(meta.atualizarStatus).not.toHaveBeenCalled();
      expect(prisma.mudancaNoAnuncio.create).not.toHaveBeenCalled();
    });

    it("deixa OWNER e ADMIN passarem", async () => {
      for (const papel of ["OWNER", "ADMIN"] as const) {
        const { service, meta } = monta();
        await service.mudarStatus(usuario(papel), "ANUNCIO", "ad1", "PAUSED");
        expect(meta.atualizarStatus).toHaveBeenCalled();
      }
    });
  });

  describe("escopo", () => {
    /*
      `Ad` e `AdSet` não carregam organização: o vínculo existe só na campanha.
      Se o escopo sair da consulta, um id de outra conta passa a ser pausável
      daqui.
    */
    it("desce pela campanha ao buscar o anúncio", async () => {
      const { service, prisma } = monta();

      await service.mudarStatus(usuario(), "ANUNCIO", "ad1", "PAUSED");

      expect(prisma.ad.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { externalId: "ad1", adSet: { campaign: { organizationId: "org-1" } } },
        }),
      );
    });

    it("responde igual para id inexistente e id de outro cliente", async () => {
      // Distinguir os dois revelaria que aquele id existe em outra conta.
      const { service, prisma, meta } = monta();
      prisma.ad.findFirst.mockResolvedValue(null);

      await expect(codigoDoErro(service.mudarStatus(usuario(), "ANUNCIO", "de-outro", "PAUSED"))).resolves.toBe(
        "NAO_ENCONTRADO",
      );
      expect(meta.atualizarStatus).not.toHaveBeenCalled();
    });
  });

  describe("mudança de status", () => {
    it("escreve na Meta e atualiza a cópia local", async () => {
      const { service, meta, prisma } = monta();

      const r = await service.mudarStatus(usuario(), "ANUNCIO", "ad1", "PAUSED");

      expect(meta.atualizarStatus).toHaveBeenCalledWith("ad1", "token-real", "PAUSED");
      // Sem isto a tela volta mostrando o status antigo até a próxima rodada.
      expect(prisma.ad.update).toHaveBeenCalledWith({ where: { id: "ad-int" }, data: { status: "PAUSED" } });
      expect(r).toMatchObject({ alterado: true, status: "PAUSED" });
    });

    it("não escreve quando já está no estado pedido", async () => {
      const { service, meta, prisma } = monta();
      prisma.ad.findFirst.mockResolvedValue({ id: "ad-int", name: "Vídeo 01", status: "PAUSED" });

      const r = await service.mudarStatus(usuario(), "ANUNCIO", "ad1", "PAUSED");

      expect(r.alterado).toBe(false);
      expect(meta.atualizarStatus).not.toHaveBeenCalled();
      expect(prisma.mudancaNoAnuncio.create).not.toHaveBeenCalled();
    });

    it("pede sincronia depois, porque a confirmação é da Meta", async () => {
      const { service, fila } = monta();
      await service.mudarStatus(usuario(), "ANUNCIO", "ad1", "PAUSED");
      expect(fila.add).toHaveBeenCalled();
    });
  });

  describe("o rastro", () => {
    /*
      A linha nasce antes da chamada de propósito. Mudança aplicada na Meta sem
      linha nenhuma aqui é o pior resultado possível numa conversa sobre quem
      pausou o quê.
    */
    it("abre o registro antes de falar com a Meta", async () => {
      const { service, meta, prisma } = monta();
      const ordem: string[] = [];
      prisma.mudancaNoAnuncio.create.mockImplementation(() => {
        ordem.push("registro");
        return Promise.resolve({ id: "reg-1" });
      });
      meta.atualizarStatus.mockImplementation(() => {
        ordem.push("meta");
        return Promise.resolve();
      });

      await service.mudarStatus(usuario(), "ANUNCIO", "ad1", "PAUSED");

      expect(ordem).toEqual(["registro", "meta"]);
    });

    it("guarda quem agiu, o nome do alvo e o estado antes e depois", async () => {
      const { service, prisma } = monta();

      await service.mudarStatus(usuario(), "ANUNCIO", "ad1", "PAUSED");

      expect(prisma.mudancaNoAnuncio.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: "org-1",
          userId: "u1",
          nivel: "ANUNCIO",
          externalId: "ad1",
          // Copiado, não buscado por relação: o anúncio pode ser renomeado.
          nome: "Vídeo 01",
          acao: "PAUSAR",
          de: "ACTIVE",
          para: "PAUSED",
        }),
      });
    });

    it("fecha o registro com o erro quando a Meta recusa", async () => {
      const { service, meta, prisma } = monta();
      meta.atualizarStatus.mockRejectedValue(new MetaApiError(100, undefined, "id inválido", 400));

      await expect(service.mudarStatus(usuario(), "ANUNCIO", "ad1", "PAUSED")).rejects.toThrow(AppException);

      expect(prisma.mudancaNoAnuncio.update).toHaveBeenCalledWith({
        where: { id: "reg-1" },
        data: { erro: expect.stringContaining("id inválido") },
      });
    });

    it("leva para a auditoria a mudança que a Meta aceitou", async () => {
      const { service, prisma, auditoria } = monta();
      prisma.mudancaNoAnuncio.create.mockResolvedValue({
        id: "reg-1",
        nivel: "ANUNCIO",
        externalId: "ad1",
        nome: "Vídeo 01",
        acao: "PAUSAR",
        de: "ACTIVE",
        para: "PAUSED",
      });

      await service.mudarStatus(usuario(), "ANUNCIO", "ad1", "PAUSED");

      expect(auditoria.registra).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: "org-1", userId: "u1" }),
        expect.objectContaining({
          acao: "AD_STATUS_CHANGED",
          entidade: "Anúncio",
          entidadeId: "ad1",
          antes: { nome: "Vídeo 01", valor: "ACTIVE" },
          depois: { nome: "Vídeo 01", valor: "PAUSED" },
        }),
      );
    });

    it("não leva para a auditoria a mudança que a Meta recusou", async () => {
      const { service, meta, auditoria } = monta();
      meta.atualizarStatus.mockRejectedValue(new MetaApiError(100, undefined, "falhou", 400));

      await expect(service.mudarStatus(usuario(), "ANUNCIO", "ad1", "PAUSED")).rejects.toThrow();
      expect(auditoria.registra).not.toHaveBeenCalled();
    });

    it("não grava o status local quando a escrita falhou", async () => {
      // A cópia local mentindo é pior que a cópia local atrasada.
      const { service, meta, prisma } = monta();
      meta.atualizarStatus.mockRejectedValue(new MetaApiError(100, undefined, "falhou", 400));

      await expect(service.mudarStatus(usuario(), "ANUNCIO", "ad1", "PAUSED")).rejects.toThrow();
      expect(prisma.ad.update).not.toHaveBeenCalled();
    });

    it("diz que falta ads_management em vez de só dizer que falhou", async () => {
      const { service, meta } = monta();
      meta.atualizarStatus.mockRejectedValue(
        new MetaApiError(200, undefined, "requires extended permission", 403),
      );

      await expect(codigoDoErro(service.mudarStatus(usuario(), "ANUNCIO", "ad1", "PAUSED"))).resolves.toBe(
        "SEM_ADS_MANAGEMENT",
      );
    });
  });

  describe("orçamento diário", () => {
    it("recusa o que estoura a verba, sem chamar a Meta", async () => {
      const { service, meta, verbas } = monta();
      verbas.resumo.mockResolvedValue({
        amountCents: 500_000, de: "2026-09-01", ate: "2026-09-30",
        gastoCentavos: 470_000, saldoCentavos: 30_000, consumidoPorCento: 94,
        diasCorridos: 21, diasRestantes: 9, ritmoDiarioCentavos: 22_380,
        acabaEm: null, ritmoIdealCentavos: 3_333,
      });

      await expect(codigoDoErro(service.mudarOrcamentoDiario(usuario(), "as1", 50_000, false))).resolves.toBe(
        "ORCAMENTO_ESTOURA_VERBA",
      );
      expect(meta.atualizarOrcamentoDiario).not.toHaveBeenCalled();
    });

    it("aplica quando o estouro é confirmado, e devolve o aviso", async () => {
      const { service, meta, verbas } = monta();
      verbas.resumo.mockResolvedValue({
        amountCents: 500_000, de: "2026-09-01", ate: "2026-09-30",
        gastoCentavos: 470_000, saldoCentavos: 30_000, consumidoPorCento: 94,
        diasCorridos: 21, diasRestantes: 9, ritmoDiarioCentavos: 22_380,
        acabaEm: null, ritmoIdealCentavos: 3_333,
      });

      const r = await service.mudarOrcamentoDiario(usuario(), "as1", 50_000, true);

      expect(meta.atualizarOrcamentoDiario).toHaveBeenCalledWith("as1", "token-real", 50_000);
      expect(r.aviso).toContain("Estouro confirmado");
    });

    it("passa em centavos, e não em reais", async () => {
      // O erro mais caro que este código poderia cometer.
      const { service, meta } = monta();
      await service.mudarOrcamentoDiario(usuario(), "as1", 30_000, false);
      expect(meta.atualizarOrcamentoDiario).toHaveBeenCalledWith("as1", "token-real", 30_000);
    });
  });

  describe("conexão", () => {
    it("recusa quando a Meta não está conectada", async () => {
      const { service, prisma, meta } = monta();
      prisma.metaConnection.findUnique.mockResolvedValue(null);

      await expect(codigoDoErro(service.mudarStatus(usuario(), "ANUNCIO", "ad1", "PAUSED"))).resolves.toBe(
        "NOT_CONNECTED",
      );
      expect(meta.atualizarStatus).not.toHaveBeenCalled();
    });

    it("recusa com token expirado em vez de tentar e falhar na Meta", async () => {
      const { service, prisma } = monta();
      prisma.metaConnection.findUnique.mockResolvedValue({ status: "TOKEN_EXPIRED", accessTokenEncrypted: "x" });

      await expect(codigoDoErro(service.mudarStatus(usuario(), "ANUNCIO", "ad1", "PAUSED"))).resolves.toBe(
        "NOT_CONNECTED",
      );
    });
  });

  it("não desfaz a alteração quando a fila de sincronia falha", async () => {
    // A escrita já aconteceu na Meta. Falhar aqui não pode mascarar isso.
    const { service, fila } = monta();
    fila.add.mockRejectedValue(new Error("redis fora"));

    await expect(service.mudarStatus(usuario(), "ANUNCIO", "ad1", "PAUSED")).resolves.toMatchObject({
      alterado: true,
    });
  });
});
