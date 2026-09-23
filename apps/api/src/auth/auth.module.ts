import { Module, forwardRef } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { MfaModule } from "./mfa/mfa.module";
import { AdminModule } from "../admin/admin.module";
import { JwtStrategy } from "./strategies/jwt.strategy";

@Module({
  imports: [
    forwardRef(() => MfaModule),
    forwardRef(() => AdminModule),
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
