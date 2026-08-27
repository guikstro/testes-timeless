import { SetMetadata } from "@nestjs/common";
import { PlatformRole } from "@prisma/client";

export const PLATFORM_ROLE_KEY = "requiredPlatformRole";

/**
 * Exige um nível **mínimo** de operador na rota. Sem o decorator, o
 * `PlatformAdminGuard` aceita qualquer operador — o padrão é o menos
 * privilegiado, então esquecer o decorator nunca abre uma rota por acidente:
 * no máximo deixa passar um SUPPORT onde só ADMIN deveria entrar, e por isso
 * as rotas de gestão de operadores o declaram explicitamente.
 */
export const RequiresPlatformRole = (role: PlatformRole) => SetMetadata(PLATFORM_ROLE_KEY, role);
