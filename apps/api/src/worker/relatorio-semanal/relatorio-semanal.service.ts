import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AnalyticsService, Janela } from "../../analytics/analytics.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { PushService } from "../../notifications/push.service";
import { EmailService } from "../../common/email/email.service";
import { enderecoDaAplicacao } from "../../common/configuracao/ambiente";
import { NumerosDaSemana, resumoDaSemana } from "./resumo-da-semana";

/**
 * Manda o resumo da semana a quem ligou o relatório.
 *
 * É o que segura o cliente: o dono vê o resultado na segunda de manhã sem
 * abrir o sistema. Vai para o sino, para o celular de quem ativou os avisos e
 * por e-mail para os donos da conta. O e-mail só sai de verdade com o SMTP
 * configurado; sem ele, fica no log, como os outros.
 */
@Injectable()
export class RelatorioSemanalService {
  private readonly logger = new Logger(RelatorioSemanalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
    private readonly notificacoes: NotificationsService,
    private readonly push: PushService,
    private readonly email: EmailService,
  ) {}

  async enviarParaTodas(agora = new Date()): Promise<void> {
    const organizacoes = await this.prisma.organization.findMany({
      where: { relatorioSemanal: true, deletedAt: null },
      select: { id: true, name: true },
    });
    const { semana, anterior } = semanas(agora);

    // Uma de cada vez: são poucas, e uma conta com problema não pode levar as
    // outras junto.
    for (const organizacao of organizacoes) {
      try {
        await this.enviar(organizacao, semana, anterior);
      } catch (erro) {
        this.logger.error(
          JSON.stringify({ event: "relatorio_semanal_falhou", organizationId: organizacao.id, error: String(erro) }),
        );
      }
    }
  }

  async enviar(organizacao: { id: string; name: string }, semana: Janela, anterior: Janela): Promise<void> {
    const dados = await this.analytics.desempenhoPorCampanha(organizacao.id, semana, anterior);

    const melhor = [...dados.campanhas]
      .filter((linha) => linha.atual)
      .sort((a, b) => b.atual!.clientes - a.atual!.clientes || b.atual!.leads - a.atual!.leads)[0];
    const numeros: NumerosDaSemana = {
      contatos: dados.totais.leads + dados.semCampanha.atual,
      clientes: dados.totais.clientes,
      gastoCentavos: dados.campanhas.length ? dados.totais.gastoCentavos : null,
      anterior: {
        contatos: dados.campanhas.reduce((s, l) => s + (l.anterior?.leads ?? 0), 0) + dados.semCampanha.anterior,
        clientes: dados.campanhas.reduce((s, l) => s + (l.anterior?.clientes ?? 0), 0),
      },
      melhorCampanha: melhor?.atual
        ? { nome: melhor.nome, clientes: melhor.atual.clientes, contatos: melhor.atual.leads }
        : null,
    };

    const endereco = `${enderecoDaAplicacao()}/dashboard?days=7`;
    const resumo = resumoDaSemana(numeros, organizacao.name, endereco);

    await this.notificacoes.notificar({
      type: "relatorio.semanal",
      organizationId: organizacao.id,
      title: resumo.titulo,
      body: resumo.corpo,
    });
    await this.push.enviarParaOrganizacao(organizacao.id, {
      title: resumo.titulo,
      body: resumo.corpo,
      url: "/dashboard?days=7",
      tag: "relatorio-semanal",
    });

    const donos = await this.prisma.membership.findMany({
      where: { organizationId: organizacao.id, role: "OWNER", user: { deletedAt: null } },
      select: { user: { select: { email: true } } },
    });
    for (const dono of donos) {
      await this.email.enfileirar({
        para: dono.user.email,
        assunto: `${resumo.titulo}, ${organizacao.name}`,
        texto: resumo.texto,
      });
    }

    this.logger.log(
      JSON.stringify({ event: "relatorio_semanal_enviado", organizationId: organizacao.id, donos: donos.length }),
    );
  }
}

/** Os sete dias completos até ontem, em Brasília, e os sete antes deles. */
export function semanas(agora: Date): { semana: Janela; anterior: Janela } {
  const hoje = agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const dia = (deslocamento: number) => {
    const data = new Date(`${hoje}T12:00:00Z`);
    data.setUTCDate(data.getUTCDate() + deslocamento);
    return data.toISOString().slice(0, 10);
  };
  return { semana: { de: dia(-7), ate: dia(-1) }, anterior: { de: dia(-14), ate: dia(-8) } };
}
