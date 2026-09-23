import { HttpStatus, Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { AppException } from "../../common/exceptions/app-exception";
import { PrismaService } from "../../common/prisma/prisma.service";
import { JwtPayload, AuthenticatedUser } from "../jwt-payload.interface";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
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

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
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

    /*
      A sessão ainda está aberta?

      É o que faz "encerrar sessão" valer agora, e não quando o token de
      acesso vencer. Sem esta conferência, quem roubou uma sessão continuaria
      dentro por até quinze minutos depois de a vítima apertar o botão, que é
      justamente o momento em que ela aperta.

      Custa uma leitura por chave primária por requisição, de uma coluna só.
      Barato perto do que compra, e a alternativa — tokens de acesso de um
      minuto — multiplicaria as renovações por quinze.

      Token sem `sid` é de antes das sessões existirem e passa: ele vence
      sozinho em no máximo quinze minutos, e a renovação dele já nasce com
      sessão.
    */
    if (payload.sid) {
      const sessao = await this.prisma.sessao.findUnique({
        where: { id: payload.sid },
        select: { encerradaEm: true },
      });
      if (!sessao || sessao.encerradaEm) {
        throw new AppException("SESSAO_ENCERRADA", "Sessão encerrada. Entre novamente.", HttpStatus.UNAUTHORIZED);
      }
    }

    return {
      userId: payload.sub,
      organizationId: payload.organizationId,
      role: payload.role,
      impersonating: payload.impersonating === true,
      sessaoId: payload.sid,
    };
  }
}
