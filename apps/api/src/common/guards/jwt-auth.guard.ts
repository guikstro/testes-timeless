import { ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";
import { AuthenticatedUser } from "../../auth/jwt-payload.interface";
import { CAPACIDADE_KEY } from "../permissoes/requer.decorator";
import { Capacidade, exige } from "../permissoes/capacidades";

/**
 * Autentica e confere a capacidade que a rota exige (`@Requer`).
 *
 * A capacidade é conferida aqui, e não num guard separado, porque a ordem
 * entre guards de classe e de método não é garantida, e ela depende do
 * usuário que este guard carrega.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!(await super.canActivate(context))) return false;

    const exigida = this.reflector.getAllAndOverride<Capacidade | null | undefined>(CAPACIDADE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!exigida) return true;

    exige(context.switchToHttp().getRequest<{ user: AuthenticatedUser }>().user, exigida);
    return true;
  }
}
