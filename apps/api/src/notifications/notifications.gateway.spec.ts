import { EventEmitter } from "events";

const subscribe = jest.fn().mockResolvedValue(1);
const unsubscribe = jest.fn().mockResolvedValue(0);
const quit = jest.fn().mockResolvedValue("OK");

/** Dublê do assinante: um emissor comum, para o teste empurrar mensagens. */
class RedisFalso extends EventEmitter {
  subscribe = subscribe;
  unsubscribe = unsubscribe;
  quit = quit;
}

let ultimoRedis: RedisFalso;

jest.mock("ioredis", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => {
    ultimoRedis = new RedisFalso();
    return ultimoRedis;
  }),
}));

import { NotificationsGateway } from "./notifications.gateway";
import { NotificationEvent } from "./notification-event";

function evento(organizationId: string): NotificationEvent {
  return {
    type: "lead.created",
    organizationId,
    title: "Novo lead: Ana",
    timestamp: "2026-09-01T12:00:00.000Z",
  };
}

describe("NotificationsGateway", () => {
  beforeEach(() => {
    subscribe.mockClear();
    unsubscribe.mockClear();
  });

  it("só assina o canal quando alguém daquela organização conecta", () => {
    const gateway = new NotificationsGateway();

    expect(subscribe).not.toHaveBeenCalled();

    const conexao = gateway.fluxo("org-1").subscribe();
    expect(subscribe).toHaveBeenCalledWith("notifications:org-1");

    conexao.unsubscribe();
    expect(unsubscribe).toHaveBeenCalledWith("notifications:org-1");
  });

  it("assina uma vez só para várias telas da mesma organização", () => {
    const gateway = new NotificationsGateway();

    const primeira = gateway.fluxo("org-1").subscribe();
    const segunda = gateway.fluxo("org-1").subscribe();

    expect(subscribe).toHaveBeenCalledTimes(1);

    // Só solta o canal quando a última tela fecha: soltar na primeira
    // deixaria a segunda com um cano vivo e mudo.
    primeira.unsubscribe();
    expect(unsubscribe).not.toHaveBeenCalled();

    segunda.unsubscribe();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("entrega o mesmo evento a todos os operadores da organização", () => {
    const gateway = new NotificationsGateway();
    const recebidosA: NotificationEvent[] = [];
    const recebidosB: NotificationEvent[] = [];

    gateway.fluxo("org-1").subscribe((e) => recebidosA.push(e));
    gateway.fluxo("org-1").subscribe((e) => recebidosB.push(e));

    ultimoRedis.emit("message", "notifications:org-1", JSON.stringify(evento("org-1")));

    expect(recebidosA).toHaveLength(1);
    expect(recebidosB).toHaveLength(1);
  });

  it("não entrega a uma organização o evento de outra", () => {
    const gateway = new NotificationsGateway();
    const recebidos: NotificationEvent[] = [];

    gateway.fluxo("org-1").subscribe((e) => recebidos.push(e));

    ultimoRedis.emit("message", "notifications:org-2", JSON.stringify(evento("org-2")));

    expect(recebidos).toHaveLength(0);
  });

  it("descarta conteúdo ilegível sem derrubar o fluxo de quem está conectado", () => {
    const gateway = new NotificationsGateway();
    const recebidos: NotificationEvent[] = [];

    gateway.fluxo("org-1").subscribe((e) => recebidos.push(e));

    ultimoRedis.emit("message", "notifications:org-1", "isto não é json");
    // O cano continua vivo: uma mensagem quebrada não pode calar todo mundo.
    ultimoRedis.emit("message", "notifications:org-1", JSON.stringify(evento("org-1")));

    expect(recebidos).toHaveLength(1);
  });

  it("volta a assinar quando alguém daquela organização conecta de novo", () => {
    const gateway = new NotificationsGateway();

    gateway.fluxo("org-1").subscribe().unsubscribe();
    gateway.fluxo("org-1").subscribe();

    expect(subscribe).toHaveBeenCalledTimes(2);
  });
});
