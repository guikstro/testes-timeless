import { ExecutionContext, HttpStatus, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";
import { AREAS_KEY, Area } from "../decorators/areas.decorator";
import { AppException } from "../exceptions/app-exception";
import { AuthenticatedUser } from "../../auth/jwt-payload.interface";

/**
 * Autentica e confere a área da rota (`@Areas`).
 *
 * A área é conferida aqui, e não num guard separado, porque a ordem entre
 * guards de classe e de método não é garantida, e a área depende do usuário
 * que este guard carrega.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!(await super.canActivate(context))) return false;

    const exigidas = this.reflector.getAllAndOverride<Area[] | undefined>(AREAS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!exigidas?.length) return true;

    const { areas } = context.switchToHttp().getRequest<{ user: AuthenticatedUser }>().user;
    if (!areas || exigidas.some((area) => areas.includes(area))) return true;

    throw new AppException("SEM_ACESSO_A_AREA", "Você não tem acesso a esta parte do sistema.", HttpStatus.FORBIDDEN);
  }
}
