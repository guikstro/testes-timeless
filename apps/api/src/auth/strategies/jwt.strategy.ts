import { HttpStatus, Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { AppException } from "../../common/exceptions/app-exception";
import { JwtPayload, AuthenticatedUser } from "../jwt-payload.interface";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error("JWT_SECRET must be set");
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  validate(payload: JwtPayload): AuthenticatedUser {
    // O prazo da impersonação é checado aqui, e não só no refresh, para
    // valer em TODA requisição autenticada: um access token já emitido
    // continuaria sendo aceito até seu próprio vencimento, o que deixaria a
    // sessão viva dentro do cliente depois do prazo.
    if (payload.impersonating) {
      const expiresAt = payload.impersonationExpiresAt ?? 0;
      if (expiresAt <= Math.floor(Date.now() / 1000)) {
        throw new AppException(
          "IMPERSONATION_EXPIRED",
          "A sessão dentro do cliente expirou. Entre novamente pela administração.",
          HttpStatus.UNAUTHORIZED,
        );
      }
    }

    return {
      userId: payload.sub,
      organizationId: payload.organizationId,
      role: payload.role,
      impersonating: payload.impersonating === true,
    };
  }
}
