import { CanActivate, ExecutionContext, HttpStatus, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PlatformRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AppException } from "../exceptions/app-exception";
import { AuthenticatedUser } from "../../auth/jwt-payload.interface";
import { PLATFORM_ROLE_KEY } from "../decorators/platform-role.decorator";

/**
 * Poder relativo dos níveis. Um número, e não uma lista de permissões, porque
 * os níveis são de fato hierárquicos: tudo que o SUPPORT faz, o ADMIN também
 * faz. Se algum dia surgir um nível que possa X mas não Y, isto vira um mapa
 * de capacidades — mas inventar isso antes da necessidade seria complexidade
 * sem contrapartida.
 */
const ROLE_RANK: Record<PlatformRole, number> = { SUPPORT: 1, ADMIN: 2 };

/**
 * Restringe uma rota aos operadores da plataforma (Fase 9), respeitando o
 * nível mínimo declarado por `@RequiresPlatformRole` (Fase 9.2).
 *
 * O nível é lido do banco a cada requisição, de propósito, e não de uma claim
 * no JWT: revogar ou rebaixar um operador precisa ter efeito imediato, não
 * só quando o token dele expirar. É uma consulta por requisição em rotas de
 * administração — irrelevante perto de deixar um acesso revogado valer por
 * até 15 minutos.
 *
 * Também recusa uma sessão que já está impersonando: de dentro de um cliente
 * não se enxerga nem se entra em outro, o que impede encadear impersonações
 * e obriga o operador a voltar à própria conta antes de trocar de cliente.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

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
      select: { platformRole: true, deletedAt: true },
    });

    if (!record?.platformRole || record.deletedAt) {
      // Mesma mensagem para "não é operador" e "não existe": não confirmar a
      // existência da rota para quem não deveria alcançá-la.
      throw new AppException("FORBIDDEN", "Acesso restrito.", HttpStatus.FORBIDDEN);
    }

    // Sem decorator, basta ser operador (o nível menos privilegiado).
    const required =
      this.reflector.getAllAndOverride<PlatformRole | undefined>(PLATFORM_ROLE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? "SUPPORT";

    if (ROLE_RANK[record.platformRole] < ROLE_RANK[required]) {
      throw new AppException(
        "INSUFFICIENT_PLATFORM_ROLE",
        "Esta ação exige um nível de operador maior.",
        HttpStatus.FORBIDDEN,
      );
    }

    // Disponível para os controllers sem uma segunda consulta ao banco.
    user.platformRole = record.platformRole;
    return true;
  }
}
