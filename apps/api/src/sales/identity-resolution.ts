import { Prisma } from "@prisma/client";
import { normalizePhone } from "../common/utils/normalize-phone";

export class IdentityResolutionService {
  async resolve(
    tx: Prisma.TransactionClient,
    organizationId: string,
    input: {
      sourceId?: string;
      customerExternalId?: string;
      phone?: string;
      email?: string;
      leadId?: string;
    },
  ) {
    const ids = new Set<string>();
    if (input.leadId) {
      const lead = await tx.lead.findFirst({
        where: { id: input.leadId, organizationId },
      });
      if (lead) ids.add(lead.id);
    }
    if (input.sourceId && input.customerExternalId) {
      const mapping = await tx.externalIdentity.findFirst({
        where: {
          organizationId,
          sourceId: input.sourceId,
          externalId: input.customerExternalId,
        },
      });
      if (mapping) {
        const lead = await tx.lead.findFirst({
          where: { id: mapping.leadId, organizationId },
        });
        if (lead) ids.add(lead.id);
      }
    }
    if (input.phone || input.email) {
      const leads = await tx.lead.findMany({
        where: {
          organizationId,
          OR: [
            ...(input.phone
              ? [{ normalizedPhone: normalizePhone(input.phone) }]
              : []),
            ...(input.email
              ? [
                  {
                    email: {
                      equals: input.email.trim(),
                      mode: "insensitive" as const,
                    },
                  },
                ]
              : []),
          ],
        },
        select: { id: true },
        take: 3,
      });
      leads.forEach((l) => ids.add(l.id));
    }
    return {
      leadId: ids.size === 1 ? [...ids][0] : null,
      ambiguous: ids.size > 1,
      candidates: [...ids],
    };
  }
}
