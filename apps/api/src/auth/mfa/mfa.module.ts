import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth.module";
import { MfaController } from "./mfa.controller";
import { MfaService } from "./mfa.service";

/**
 * `forwardRef` porque a dependência é mútua de verdade: o login precisa do
 * MFA para desviar, e o desligamento do MFA precisa do login para conferir a
 * senha. Quebrar isso exigiria um terceiro módulo só para a senha, que é
 * cerimônia sem ganho.
 */
@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [MfaController],
  providers: [MfaService],
  exports: [MfaService],
})
export class MfaModule {}
