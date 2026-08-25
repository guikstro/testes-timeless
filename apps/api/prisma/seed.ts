import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("password123", 12);

  const organization = await prisma.organization.upsert({
    where: { slug: "direito-trabalhista-demo" },
    update: {},
    create: {
      name: "Direito Trabalhista Demo",
      slug: "direito-trabalhista-demo",
      timezone: "America/Fortaleza",
      currency: "BRL",
    },
  });

  const user = await prisma.user.upsert({
    where: { email: "demo@tintim-clone.local" },
    update: {},
    create: {
      name: "Usuário Demo",
      email: "demo@tintim-clone.local",
      passwordHash,
    },
  });

  await prisma.membership.upsert({
    where: { organizationId_userId: { organizationId: organization.id, userId: user.id } },
    update: {},
    create: {
      organizationId: organization.id,
      userId: user.id,
      role: "OWNER",
    },
  });

  console.log("Seed concluído:");
  console.log(`  Organização: ${organization.name} (${organization.slug})`);
  console.log(`  Usuário: ${user.email} / senha: password123`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
