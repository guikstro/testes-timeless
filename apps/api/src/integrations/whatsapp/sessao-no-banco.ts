import type { AuthenticationState, SignalDataTypeMap } from "baileys";
import { PrismaService } from "../../common/prisma/prisma.service";
import { EncryptionService } from "../../common/encryption/encryption.service";

/** O pedaço do Baileys que a sessão usa. Recebido de fora porque o pacote é carregado sob demanda. */
export type BaileysDaSessao = Pick<typeof import("baileys"), "BufferJSON" | "initAuthCreds" | "proto">;

export interface SessaoCarregada {
  state: AuthenticationState;
  salvaCredenciais: () => Promise<void>;
}

/**
 * A sessão do WhatsApp guardada no Postgres, no mesmo formato do
 * `useMultiFileAuthState` do Baileys, com uma linha por arquivo.
 *
 * Tudo passa cifrado pela mesma chave dos tokens de terceiros: estas linhas
 * valem o controle do número.
 */
export async function carregaSessaoDoBanco(
  instanceName: string,
  prisma: PrismaService,
  cifra: EncryptionService,
  { BufferJSON, initAuthCreds, proto }: BaileysDaSessao,
): Promise<SessaoCarregada> {
  const onde = (chave: string) => ({ instanceName_chave: { instanceName, chave } });

  const le = async (chave: string) => {
    const linha = await prisma.sessaoWhatsApp.findUnique({ where: onde(chave) });
    return linha ? JSON.parse(cifra.decrypt(linha.valor), BufferJSON.reviver) : null;
  };

  const grava = async (chave: string, valor: unknown) => {
    const cifrado = cifra.encrypt(JSON.stringify(valor, BufferJSON.replacer));
    await prisma.sessaoWhatsApp.upsert({
      where: onde(chave),
      create: { instanceName, chave, valor: cifrado },
      update: { valor: cifrado },
    });
  };

  const apaga = async (chave: string) => {
    await prisma.sessaoWhatsApp.deleteMany({ where: { instanceName, chave } });
  };

  const creds = (await le("creds")) ?? initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(tipo: T, ids: string[]) => {
          const dados: { [id: string]: SignalDataTypeMap[T] } = {};
          await Promise.all(
            ids.map(async (id) => {
              let valor = await le(`${tipo}-${id}`);
              if (tipo === "app-state-sync-key" && valor) {
                valor = proto.Message.AppStateSyncKeyData.fromObject(valor);
              }
              dados[id] = valor;
            }),
          );
          return dados;
        },
        set: async (dados) => {
          const porTipo = dados as Record<string, Record<string, unknown>>;
          const tarefas: Promise<void>[] = [];
          for (const tipo of Object.keys(porTipo)) {
            for (const [id, valor] of Object.entries(porTipo[tipo])) {
              const chave = `${tipo}-${id}`;
              tarefas.push(valor ? grava(chave, valor) : apaga(chave));
            }
          }
          await Promise.all(tarefas);
        },
      },
    },
    salvaCredenciais: () => grava("creds", creds),
  };
}

export async function apagaSessaoDoBanco(instanceName: string, prisma: PrismaService): Promise<void> {
  await prisma.sessaoWhatsApp.deleteMany({ where: { instanceName } });
}

/** Instâncias com sessão salva: são as que a API reabre ao subir. */
export async function instanciasComSessao(prisma: PrismaService): Promise<string[]> {
  const linhas = await prisma.sessaoWhatsApp.findMany({ where: { chave: "creds" }, select: { instanceName: true } });
  return linhas.map((linha) => linha.instanceName);
}
