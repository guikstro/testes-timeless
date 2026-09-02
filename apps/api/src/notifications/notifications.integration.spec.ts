import { firstValueFrom, timeout } from "rxjs";
import { NotificationsGateway } from "./notifications.gateway";
import { NotificationsService } from "./notifications.service";
import { PrismaService } from "../common/prisma/prisma.service";

/**
 * O único teste daqui que usa um Redis de verdade.
 *
 * Os testes com dublê provam que cada peça faz a sua parte; nenhum deles
 * prova que o worker e a API conversam. Elas rodam em processos separados, e
 * o Pub/Sub entre as duas é justamente a peça que um dublê esconde: um erro
 * no nome do canal, ou uma conexão em modo de assinatura recusando comandos,
 * passaria despercebido em tudo o que veio antes.
 *
 * Depende do Redis que o Docker Compose já sobe para o BullMQ.
 */
describe("notificações de ponta a ponta pelo Redis", () => {
  let gateway: NotificationsGateway;
  let service: NotificationsService;

  const prismaSemMembros = {
    membership: { findMany: jest.fn().mockResolvedValue([]) },
    notification: { createMany: jest.fn() },
  } as unknown as PrismaService;

  beforeAll(() => {
    gateway = new NotificationsGateway();
    service = new NotificationsService(prismaSemMembros);
  });

  afterAll(async () => {
    await gateway.onModuleDestroy();
    await service.onModuleDestroy();
  });

  it("entrega ao assinante o evento publicado do outro lado", async () => {
    const organizationId = `org-teste-${Date.now()}`;
    const recebido = firstValueFrom(gateway.fluxo(organizationId).pipe(timeout(5000)));

    // O `subscribe` do Redis é assíncrono: publicar antes de ele completar
    // perderia a mensagem, e o teste falharia por corrida, não por defeito.
    await new Promise((resolve) => setTimeout(resolve, 150));

    await service.notificar({
      type: "lead.created",
      organizationId,
      leadId: "lead-1",
      leadName: "Ana",
      title: "Novo lead: Ana",
    });

    await expect(recebido).resolves.toMatchObject({
      type: "lead.created",
      organizationId,
      leadName: "Ana",
    });
  });

  it("não entrega a uma organização o que foi publicado para outra", async () => {
    const minha = `org-a-${Date.now()}`;
    const alheia = `org-b-${Date.now()}`;
    const recebidos: unknown[] = [];

    const assinatura = gateway.fluxo(minha).subscribe((evento) => recebidos.push(evento));
    await new Promise((resolve) => setTimeout(resolve, 150));

    await service.notificar({ type: "lead.won", organizationId: alheia, title: "Venda registrada: Bruno" });
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(recebidos).toHaveLength(0);
    assinatura.unsubscribe();
  });
});
