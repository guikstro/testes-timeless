import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import type Redis from "ioredis";
import { randomBytes } from "node:crypto";
import { criaConexaoRedis } from "../../common/queue/redis-connection";

export interface SessaoEntregue {
  accessToken: string;
  refreshToken: string;
}

/**
 * Entrega de sessão entre dois endereços diferentes.
 *
 * Existe porque a administração passou a morar num site próprio, e cookie não
 * atravessa origem. O jeito antigo de entrar num cliente estacionava os
 * cookies do operador e os trocava pelos do cliente, o que só funciona quando
 * os dois vivem no mesmo lugar.
 *
 * Agora a administração pede um código, manda o navegador para o site do
 * cliente com ele, e é o site do cliente que o troca pela sessão. A sessão do
 * operador nunca sai do site da administração: ela não é copiada, não é
 * estacionada e não corre o risco de ficar para trás.
 *
 * Três propriedades sustentam isso, e as três importam:
 *
 * 1. **Uso único, de verdade.** `GETDEL` lê e apaga numa operação só, então
 *    duas requisições simultâneas com o mesmo código não podem as duas
 *    vencer. Conferir e depois apagar teria essa janela.
 * 2. **Vida curta.** Um minuto, que é o tempo de um redirecionamento. O
 *    código viaja na URL, e URL vaza: fica no histórico do navegador, no
 *    cabeçalho de origem da próxima requisição, no log do servidor.
 * 3. **Nada legível dentro.** É um identificador aleatório, não um token
 *    assinado. Quem o intercepta depois de usado tem uma string sem valor.
 */
@Injectable()
export class EntregaDeSessaoService implements OnModuleDestroy {
  private readonly redis: Redis;
  private readonly logger = new Logger(EntregaDeSessaoService.name);

  /** Um minuto: o tempo de um redirecionamento, não o de uma sessão. */
  private readonly VALIDADE_EM_SEGUNDOS = 60;

  constructor() {
    this.redis = criaConexaoRedis(EntregaDeSessaoService.name);
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }

  async cria(sessao: SessaoEntregue): Promise<string> {
    const codigo = randomBytes(32).toString("base64url");
    await this.redis.set(this.chave(codigo), JSON.stringify(sessao), "EX", this.VALIDADE_EM_SEGUNDOS);
    return codigo;
  }

  /**
   * Troca o código pela sessão. Devolve `null` quando já foi usado, expirou ou
   * nunca existiu, sem distinguir os três: quem tenta um código inválido não
   * precisa saber qual dos casos é o dele.
   */
  async resgata(codigo: string): Promise<SessaoEntregue | null> {
    if (!codigo || codigo.length > 128) return null;

    let bruto: string | null;
    try {
      // `getdel` numa chamada só. Ler e depois apagar deixaria uma janela em
      // que duas requisições simultâneas resgatariam o mesmo código.
      bruto = await this.redis.getdel(this.chave(codigo));
    } catch (erro) {
      this.logger.warn(`Falha ao resgatar entrega: ${(erro as Error).message}`);
      return null;
    }

    if (!bruto) return null;

    try {
      return JSON.parse(bruto) as SessaoEntregue;
    } catch {
      return null;
    }
  }

  private chave(codigo: string): string {
    return `entrega:${codigo}`;
  }
}
