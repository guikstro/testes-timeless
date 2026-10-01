import { Module } from "@nestjs/common";
import { PrismaModule } from "../../common/prisma/prisma.module";
import { EncryptionModule } from "../../common/encryption/encryption.module";
import { AcessoAoGoogle } from "./acesso-ao-google";
import { PerfilDaEmpresaClient } from "./perfil-da-empresa-client";

/**
 * O acesso ao Google e o cliente das APIs, num módulo só: a API e o worker
 * usam a mesma instância, e o token de acesso em memória vale para os dois.
 */
@Module({
  imports: [PrismaModule, EncryptionModule],
  providers: [AcessoAoGoogle, PerfilDaEmpresaClient],
  exports: [AcessoAoGoogle, PerfilDaEmpresaClient],
})
export class GoogleDoPerfilModule {}
