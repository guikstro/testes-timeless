import { CanActivate, ExecutionContext, HttpStatus, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AppException } from "../exceptions/app-exception";
import { AuthenticatedUser } from "../../auth/jwt-payload.interface";

/**
 * Restringe uma rota aos operadores da plataforma (Fase 9).
 *
 * A flag é lida do banco a cada requisição, de propósito, e não de uma claim
 * no JWT: revogar o acesso de um operador precisa ter efeito imediato, não
 * só quando o token dele expirar. É uma consulta por requisição em rotas de
 * administração — um custo irrelevante perto de deixar um acesso revogado
 * continuar valendo por até 15 minutos.
 *
 * Também recusa uma sessão que já está impersonando: de dentro de um cliente
 * não se enxerga nem se entra em outro, o que impede encadear impersonações
 * e faz o operador voltar à própria conta antes de trocar de cliente.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user) {
      throw new AppException("UNAUTHORIZED", "Não autenticado.", HttpStatus.UNAUTHORIZED);
    }

    if (user.impersonating) {
      throw new AppException(
        "ALREADY_IMPERSONATING",
        "Saia do cliente atual antes de acessar a administração.",
        HttpStatus.FORBIDDEN,
      );
    }

    const record = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: { isPlatformAdmin: true, deletedAt: true },
    });

    if (!record?.isPlatformAdmin || record.deletedAt) {
      // Mesma mensagem para "não é admin" e "não existe": não confirmar a
      // existência da rota para quem não deveria alcançá-la.
      throw new AppException("FORBIDDEN", "Acesso restrito.", HttpStatus.FORBIDDEN);
    }

    return true;
  }
}
