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
 *
 * Os prazos daqui são folgados de propósito. Este teste espera uma ida e
 * volta de verdade pela rede, e a suíte inteira roda em paralelo: com a
 * máquina carregada, um orçamento apertado falha por lentidão e não por
 * defeito. Um vermelho intermitente é pior que teste nenhum, porque ensina a
 * ignorar vermelho.
 */
/** Quanto esperamos pela volta do Redis antes de desistir. */
const ESPERA_MS = 15_000;
/** O prazo do Jest precisa ser maior que o nosso, senão ele corta antes e a
 *  mensagem de falha fala de tempo esgotado em vez do que de fato aconteceu. */
const PRAZO_DO_TESTE_MS = ESPERA_MS + 5_000;
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
    const recebido = firstValueFrom(gateway.fluxo(organizationId).pipe(timeout(ESPERA_MS)));

    // O `subscribe` do Redis é assíncrono: publicar antes de ele completar
    // perderia a mensagem, e o teste falharia por corrida, não por defeito.
    await new Promise((resolve) => setTimeout(resolve, 500));

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
  }, PRAZO_DO_TESTE_MS);

  it("não entrega a uma organização o que foi publicado para outra", async () => {
    const minha = `org-a-${Date.now()}`;
    const alheia = `org-b-${Date.now()}`;
    const recebidos: unknown[] = [];

    const assinatura = gateway.fluxo(minha).subscribe((evento) => recebidos.push(evento));
    await new Promise((resolve) => setTimeout(resolve, 500));

    await service.notificar({ type: "lead.won", organizationId: alheia, title: "Venda registrada: Bruno" });
    // Espera generosa antes de concluir que nada chegou: com pouco tempo, uma
    // entrega lenta passaria por isolamento funcionando, que é o oposto do
    // que este teste deveria provar.
    await new Promise((resolve) => setTimeout(resolve, 1500));

    expect(recebidos).toHaveLength(0);
    assinatura.unsubscribe();
  }, PRAZO_DO_TESTE_MS);
});
