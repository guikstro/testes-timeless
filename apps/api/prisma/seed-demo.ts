import { PrismaClient } from "@prisma/client";
import { preencheDemonstracao } from "../src/admin/demonstracao/preenche-demonstracao";
import * as bcrypt from "bcrypt";

/**
 * Gera um histórico de demonstração com forma de negócio real.
 *
 * Existe porque dado de teste sem forma deforma a interface: 24 leads criados
 * todos no mesmo dia produzem um gráfico plano com um pico no fim, que parece
 * defeito mesmo estando certo, e impedem avaliar qualquer decisão de desenho.
 *
 * Três travas, porque um gerador de dados solto é perigoso:
 *
 * 1. Só roda por comando explícito (`pnpm --filter api seed:demo`).
 * 2. Escreve numa organização própria, identificada pelo slug abaixo, e nunca
 *    toca em nenhuma outra. Rodar de novo limpa apenas essa.
 * 3. Recusa rodar quando NODE_ENV é production.
 */

const SLUG = "demonstracao";
const DIAS = 90;

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("seed:demo não roda em produção.");
  }

  const senha = await bcrypt.hash("demo123456", 10);

  // Recria só a organização de demonstração. O cascade do schema leva junto
  // leads, conversas, eventos e vendas dela, e nada de mais ninguém.
  //
  // O usuário sai à parte: ele não pertence à organização, então o cascade não
  // o alcança e a segunda execução colidiria no e-mail único.
  await prisma.organization.deleteMany({ where: { slug: SLUG } });
  await prisma.user.deleteMany({ where: { email: "demo@demonstracao.local" } });

  const org = await prisma.organization.create({
    data: {
      name: "Demonstração",
      slug: SLUG,
      brandColor: "#007D5E",
      memberships: {
        create: {
          role: "OWNER",
          user: {
            create: {
              name: "Visitante Demo",
              email: "demo@demonstracao.local",
              passwordHash: senha,
            },
          },
        },
      },
      whatsappConnection: {
        create: {
          provider: "EVOLUTION",
          status: "CONNECTED",
          instanceName: `demo-${SLUG}`,
          displayPhoneNumber: "+55 85 90000-0000",
          connectedAt: new Date(),
        },
      },
    },
    include: { whatsappConnection: true },
  });

  const { leads, vendas } = await preencheDemonstracao(prisma, org.id, org.whatsappConnection!.id, { dias: DIAS });

  console.log(`\nOrganização "Demonstração" recriada com ${DIAS} dias de histórico.`);
  console.log(`  ${leads} leads`);
  console.log(`  ${vendas} vendas`);
  console.log(`\nEntre com demo@demonstracao.local / demo123456\n`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
