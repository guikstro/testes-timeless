import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import { EventEmitter } from "events";
import type { ConnectionState, WASocket } from "baileys";
import * as QRCode from "qrcode";
import { PrismaService } from "../../common/prisma/prisma.service";
import { EncryptionService } from "../../common/encryption/encryption.service";
import { apagaSessaoDoBanco, carregaSessaoDoBanco, instanciasComSessao } from "./sessao-no-banco";
import { EstadoDaConexao, EventoDoMotor, eventoDeConexao, eventoDeMensagem } from "./evento-do-motor";

/** Códigos de `DisconnectReason` do Baileys usados aqui. */
const DESCONECTADO_PELO_CELULAR = 401;
const REINICIO_APOS_PAREAR = 515;

/** O Baileys escreve muito no log; o que importa aqui já vira evento ou erro. */
const LOG_SILENCIOSO = {
  level: "silent",
  child: () => LOG_SILENCIOSO,
  trace: () => undefined,
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

interface Instancia {
  socket: WASocket;
  estado: EstadoDaConexao;
  qr: string | null;
}

export interface QrCodeDoWhatsApp {
  /** Data URI (`data:image/png;base64,...`) pronto para um `<img src>`. */
  base64: string | null;
  code: string | null;
}

/**
 * O WhatsApp por QR Code rodando dentro da API, no lugar da Evolution.
 *
 * Uma conexão (socket do Baileys) por instância, mantida em memória. Por isso
 * precisa existir uma única cópia deste serviço por processo: duas cópias
 * abririam duas conexões para o mesmo número e uma derrubaria a outra.
 */
@Injectable()
export class MotorWhatsApp implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(MotorWhatsApp.name);
  private readonly instancias = new Map<string, Instancia>();
  private readonly eventos = new EventEmitter();

  constructor(
    private readonly prisma: PrismaService,
    private readonly cifra: EncryptionService,
  ) {}

  /**
   * Reabre as sessões salvas. No bootstrap, e não no init, para os ouvintes
   * (`aoEvento`) já estarem registrados quando o primeiro evento sair.
   */
  async onApplicationBootstrap(): Promise<void> {
    try {
      for (const instanceName of await instanciasComSessao(this.prisma)) {
        await this.conecta(instanceName);
      }
    } catch (erro) {
      this.logger.error(JSON.stringify({ event: "whatsapp_reconexao_falhou", message: (erro as Error).message }));
    }
  }

  /** Fecha as conexões sem deslogar: a sessão fica salva para a próxima subida. */
  onApplicationShutdown(): void {
    for (const { socket } of this.instancias.values()) socket.end(undefined);
    this.instancias.clear();
  }

  aoEvento(ouvinte: (evento: EventoDoMotor) => Promise<unknown>): void {
    this.eventos.on("evento", (evento: EventoDoMotor) => {
      ouvinte(evento).catch((erro) =>
        this.logger.error(JSON.stringify({ event: "whatsapp_evento_falhou", tipo: evento.event, message: erro.message })),
      );
    });
  }

  /** Abre a conexão da instância. Se já estiver aberta ou abrindo, não faz nada. */
  async conecta(instanceName: string): Promise<void> {
    if (this.instancias.has(instanceName)) return;

    // Carregado sob demanda: o pacote é ESM e só o Node 22+ consegue carregá-lo daqui.
    const baileys = await import("baileys");
    const { state, salvaCredenciais } = await carregaSessaoDoBanco(instanceName, this.prisma, this.cifra, baileys);

    const socket = baileys.makeWASocket({
      auth: { creds: state.creds, keys: baileys.makeCacheableSignalKeyStore(state.keys, LOG_SILENCIOSO) },
      logger: LOG_SILENCIOSO,
      // Sem isto o celular para de tocar notificação enquanto a API estiver conectada.
      markOnlineOnConnect: false,
    });
    const instancia: Instancia = { socket, estado: "connecting", qr: null };
    this.instancias.set(instanceName, instancia);

    socket.ev.on("creds.update", salvaCredenciais);
    socket.ev.on("connection.update", (atualizacao) =>
      this.aoMudarConexao(instanceName, instancia, atualizacao, Boolean(state.creds.me)),
    );
    socket.ev.on("messages.upsert", ({ messages, type }) => {
      // "append" é histórico sincronizado ao conectar, não mensagem nova.
      if (type !== "notify") return;
      for (const mensagem of messages) this.emite(eventoDeMensagem(instanceName, mensagem));
    });
  }

  estado(instanceName: string): EstadoDaConexao {
    return this.instancias.get(instanceName)?.estado ?? "close";
  }

  /** O QR atual. Vem vazio nos primeiros segundos; a tela consulta de novo sozinha. */
  async qrCode(instanceName: string): Promise<QrCodeDoWhatsApp> {
    await this.conecta(instanceName);
    const qr = this.instancias.get(instanceName)?.qr ?? null;
    return { code: qr, base64: qr ? await QRCode.toDataURL(qr) : null };
  }

  /** Dígitos do número pareado (`5511999999999`), ou null antes de parear. */
  numeroConectado(instanceName: string): string | null {
    const id = this.instancias.get(instanceName)?.socket.user?.id;
    return id?.split(/[:@]/)[0] || null;
  }

  async enviaTexto(instanceName: string, telefoneEmDigitos: string, texto: string): Promise<{ externalId: string }> {
    const instancia = this.instancias.get(instanceName);
    if (instancia?.estado !== "open") {
      throw new Error("O WhatsApp não está conectado. Reconecte para enviar mensagens.");
    }

    const enviada = await instancia.socket.sendMessage(`${telefoneEmDigitos}@s.whatsapp.net`, { text: texto });
    if (!enviada?.key.id) throw new Error("O WhatsApp não confirmou o envio da mensagem.");
    return { externalId: enviada.key.id };
  }

  /** Desliga o aparelho e apaga a sessão. Conectar de novo pede outro QR. */
  async desconecta(instanceName: string): Promise<void> {
    const instancia = this.instancias.get(instanceName);
    this.instancias.delete(instanceName);

    if (instancia) {
      // Sem ouvinte, o "close" do logout não vira evento: quem desconectou foi
      // a pessoa, e o status certo é o que o serviço grava, não uma queda.
      instancia.socket.ev.removeAllListeners("connection.update");
      await instancia.socket.logout().catch(() => undefined);
    }
    await apagaSessaoDoBanco(instanceName, this.prisma);
  }

  private aoMudarConexao(
    instanceName: string,
    instancia: Instancia,
    { connection, lastDisconnect, qr }: Partial<ConnectionState>,
    jaPareado: boolean,
  ): void {
    if (qr) instancia.qr = qr;
    if (!connection) return;

    instancia.estado = connection;
    if (connection === "open") instancia.qr = null;
    if (connection === "close") this.aoFechar(instanceName, instancia, lastDisconnect?.error, jaPareado);

    this.emite(eventoDeConexao(instanceName, connection));
  }

  /**
   * Quedas de rede reconectam sozinhas. Não reconecta quando o celular
   * desconectou, nem quando ninguém leu o QR a tempo: aí seria gerar QR para
   * sempre, sem ninguém olhando.
   */
  private aoFechar(instanceName: string, instancia: Instancia, erro: Error | undefined, jaPareado: boolean): void {
    if (this.instancias.get(instanceName) === instancia) this.instancias.delete(instanceName);

    const codigo = (erro as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
    if (codigo === DESCONECTADO_PELO_CELULAR) {
      void apagaSessaoDoBanco(instanceName, this.prisma);
      return;
    }
    if (jaPareado || codigo === REINICIO_APOS_PAREAR) {
      this.conecta(instanceName).catch((falha) =>
        this.logger.error(JSON.stringify({ event: "whatsapp_reconexao_falhou", instanceName, message: falha.message })),
      );
    }
  }

  private emite(evento: EventoDoMotor): void {
    this.eventos.emit("evento", evento);
  }
}
