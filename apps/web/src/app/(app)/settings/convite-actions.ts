"use server";

import { apiFetch, ApiRequestError } from "@/lib/api-client";

export interface ConviteState {
  error?: string;
  convite?: { url: string; expiraEm: string; email: string };
}

export async function convida(_anterior: ConviteState, formData: FormData): Promise<ConviteState> {
  const email = String(formData.get("email") ?? "").trim();
  const acesso = String(formData.get("acesso") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "") || undefined;
  const areas = formData.getAll("areas").map(String);

  if (!email) return { error: "Informe o e-mail da pessoa." };
  if (acesso === "cliente" && !organizationId) return { error: "Escolha o cliente." };
  if (acesso === "cliente" && areas.length === 0) return { error: "Marque ao menos uma área." };

  try {
    const convite = await apiFetch<{ url: string; expiraEm: string }>("/admin/convites", {
      method: "POST",
      body: JSON.stringify(acesso === "cliente" ? { email, acesso, organizationId, areas } : { email, acesso }),
    });
    return { convite: { ...convite, email } };
  } catch (error) {
    return { error: error instanceof ApiRequestError ? error.body.message : "Não foi possível gerar o convite." };
  }
}
