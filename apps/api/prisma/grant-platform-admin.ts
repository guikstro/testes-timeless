import { PlatformRole, PrismaClient } from "@prisma/client";

/**
 * Concede, muda ou revoga o nível de operador da plataforma de um usuário já
 * existente.
 *
 * Continua existindo como script mesmo depois de a Fase 9.2 ter criado as
 * rotas de gestão de operadores, porque é o **bootstrap**: o primeiro ADMIN
 * não tem quem o promova pela interface. Depois dele, o caminho normal é a
 * tela `/admin/operadores`.
 *
 * Uso:
 *   pnpm --filter api grant:admin <email>            # ADMIN (padrão)
 *   pnpm --filter api grant:admin <email> --support  # SUPPORT
 *   pnpm --filter api grant:admin <email> --revoke   # remove o acesso
 */
async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();
  const revoke = process.argv.includes("--revoke");
  const role: PlatformRole = process.argv.includes("--support") ? "SUPPORT" : "ADMIN";

  if (!email) {
    console.error("Uso: pnpm --filter api grant:admin <email> [--support | --revoke]");
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.error(`Nenhum usuário com o e-mail "${email}". Crie a conta pela tela de cadastro primeiro.`);
      process.exitCode = 1;
      return;
    }

    // Mesma proteção da API: ficar sem nenhum ADMIN trancaria todo mundo
    // para fora da gestão de operadores.
    if (user.platformRole === "ADMIN" && (revoke || role !== "ADMIN")) {
      const otherAdmins = await prisma.user.count({
        where: { platformRole: "ADMIN", deletedAt: null, id: { not: user.id } },
      });
      if (otherAdmins === 0) {
        console.error("Este é o último administrador da plataforma. Promova outro antes de remover este.");
        process.exitCode = 1;
        return;
      }
    }

    const updated = await prisma.user.update({
      where: { email },
      data: { platformRole: revoke ? null : role },
      select: { name: true, email: true, platformRole: true },
    });

    console.log(
      updated.platformRole
        ? `✔ ${updated.name} <${updated.email}> agora é operador da plataforma (${updated.platformRole}).`
        : `✔ ${updated.name} <${updated.email}> não é mais operador da plataforma.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();
