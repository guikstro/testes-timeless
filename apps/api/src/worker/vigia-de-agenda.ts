import { Logger } from "@nestjs/common";
import { Queue } from "bullmq";

/** De quanto em quanto tempo a vigia confere se a agenda continua no Redis. */
export const INTERVALO_DA_VIGIA_MS = 5 * 60_000;

export interface OpcoesDaAgenda {
  fila: Pick<Queue, "getJobScheduler">;
  /** O id da agenda no Redis, o mesmo que o registro usa. */
  id: string;
  /** Registra a agenda. Não deve lançar: quem registra põe a própria falha no log. */
  registra: () => Promise<void>;
  logger: Logger;
  intervaloMs?: number;
}

export interface Vigia {
  /** Uma conferência. No dia a dia quem chama é o relógio; fica exposta para teste. */
  confere(): Promise<void>;
  para(): void;
}

/**
 * Registra a agenda na subida e mantém uma vigia sobre ela enquanto a API
 * estiver no ar.
 *
 * A vigia só liga depois que o registro da subida termina, para os dois
 * nunca registrarem ao mesmo tempo. Com o Redis fora do ar, o registro espera
 * a conexão voltar, e a vigia espera junto: antes disso ela só deixaria
 * consultas penduradas. Um registro que falhou também liga a vigia, porque é
 * ela quem tenta de novo.
 */
export function mantemAgenda(opcoes: OpcoesDaAgenda): { para(): void } {
  let parada = false;
  let vigia: Vigia | undefined;

  const liga = () => {
    // O registro pode terminar com a API já desligando, quando o Redis volta
    // tarde. Ligar a vigia aí deixaria um relógio sem dono.
    if (!parada) vigia = vigiaAgenda(opcoes);
  };
  void opcoes.registra().then(liga, liga);

  return {
    para: () => {
      parada = true;
      vigia?.para();
    },
  };
}

/**
 * Registra de novo uma agenda que sumiu do Redis.
 *
 * O registro só acontecia na subida da API, e o Redis de produção (o Key
 * Value gratuito do Render) não guarda nada em disco: a Render pode
 * reiniciá-lo a qualquer momento, e ele volta vazio. A agenda sumia junto,
 * sem erro nenhum, e só voltava no deploy seguinte. Enquanto isso nada
 * sincronizava, e o gasto velho seguia na tela com cara de novo.
 *
 * Só registra o que sumiu, e nunca por cima de uma agenda viva: registrar de
 * novo mexe no job que está esperando a vez, e não há por que fazer isso a
 * cada volta do relógio. Agenda recém-criada roda na hora, então a volta já
 * cobre o que ficou para trás.
 */
export function vigiaAgenda(opcoes: OpcoesDaAgenda): Vigia {
  const { fila, id, registra, logger } = opcoes;
  let conferindo = false;

  async function confere(): Promise<void> {
    // Com o Redis fora do ar, a consulta espera a conexão voltar em vez de
    // falhar. Sem a trava, cada volta do relógio deixaria mais uma pendurada.
    if (conferindo) return;
    conferindo = true;

    try {
      if (await fila.getJobScheduler(id)) return;
      logger.warn(JSON.stringify({ event: "agenda_sumiu_do_redis", id }));
      await registra();
    } catch (erro) {
      logger.error(JSON.stringify({ event: "vigia_de_agenda_falhou", id, error: String(erro) }));
    } finally {
      conferindo = false;
    }
  }

  const relogio = setInterval(() => void confere(), opcoes.intervaloMs ?? INTERVALO_DA_VIGIA_MS);
  // Não segura o processo: desligar a API não espera a próxima conferência.
  relogio.unref();

  return { confere, para: () => clearInterval(relogio) };
}
