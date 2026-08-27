import { PrismaClient } from "@prisma/client";

/**
 * Concede (ou revoga) o acesso de operador da plataforma a um usuário já
 * existente.
 *
 * Deliberadamente um script de linha de comando, e não um endpoint: virar
 * operador dá acesso a TODOS os clientes, então não deve ser alcançável por
 * nenhuma rota HTTP — nem sequer por uma protegida. Quem consegue rodar isto
 * já tem acesso ao banco de produção de qualquer forma.
 *
 * Uso:
 *   pnpm --filter api grant:admin <email>
 *   pnpm --filter api grant:admin <email> --revoke
 */
async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();
  const revoke = process.argv.includes("--revoke");

  if (!email) {
    console.error("Uso: pnpm --filter api grant:admin <email> [--revoke]");
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

    const updated = await prisma.user.update({
      where: { email },
      data: { isPlatformAdmin: !revoke },
      select: { name: true, email: true, isPlatformAdmin: true },
    });

    console.log(
      updated.isPlatformAdmin
        ? `✔ ${updated.name} <${updated.email}> agora é operador da plataforma.`
        : `✔ ${updated.name} <${updated.email}> não é mais operador da plataforma.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();
