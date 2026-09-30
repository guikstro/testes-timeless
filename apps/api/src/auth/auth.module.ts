import { Module, forwardRef } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { MfaModule } from "./mfa/mfa.module";
import { AdminModule } from "../admin/admin.module";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { SessoesController } from "./sessoes/sessoes.controller";
import { SessoesService } from "./sessoes/sessoes.service";
import { ConvitesService } from "./convites/convites.service";
import { ConvitesController } from "./convites/convites.controller";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [
    forwardRef(() => MfaModule),
    forwardRef(() => AdminModule),
    NotificationsModule,
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
    }),
  ],
  controllers: [AuthController, SessoesController, ConvitesController],
  providers: [AuthService, JwtStrategy, SessoesService, ConvitesService],
  exports: [AuthService, ConvitesService],
})
export class AuthModule {}
