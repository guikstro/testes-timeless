import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { EMAIL_QUEUE } from "../../common/queue/queue.constants";
import { EmailJob } from "../../common/queue/email.job";
import { ProvedorDeEmail } from "../../common/email/provedor-de-email";

@Processor(EMAIL_QUEUE)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(private readonly provedor: ProvedorDeEmail) {
    super();
  }

  async process(job: Job<EmailJob>): Promise<void> {
    try {
      await this.provedor.enviar(job.data);
    } catch (erro) {
      // Sem o destinatário nem o corpo no log de erro: o motivo da falha é o
      // que interessa, e o resto seria dado de gente dentro de um log.
      this.logger.error(
        JSON.stringify({ event: "email_falhou", jobId: job.id, error: (erro as Error).message }),
      );
      throw erro;
    }
  }
}
