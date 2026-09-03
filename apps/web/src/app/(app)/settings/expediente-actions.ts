"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiRequestError } from "@/lib/api-client";

export interface EstadoDoExpediente {
  erro?: string;
  salvoEm?: number;
}

/** "09:30" vira 570. Devolve null quando o campo veio vazio ou torto. */
function paraMinutos(valor: string): number | null {
  const [horas, minutos] = valor.split(":").map(Number);
  if (!Number.isInteger(horas) || !Number.isInteger(minutos)) return null;
  return horas * 60 + minutos;
}

export async function salvarExpediente(
  _anterior: EstadoDoExpediente,
  formData: FormData,
): Promise<EstadoDoExpediente> {
  const ativo = formData.get("expedienteAtivo") === "on";
  const inicio = paraMinutos(String(formData.get("inicio") ?? ""));
  const fim = paraMinutos(String(formData.get("fim") ?? ""));
  const dias = formData.getAll("dias").map(Number).filter(Number.isInteger);

  if (inicio === null || fim === null) {
    return { erro: "Informe o horário de abertura e de fechamento." };
  }
  if (fim <= inicio) {
    return { erro: "O fechamento precisa ser depois da abertura." };
  }
  /*
    Ligado sem nenhum dia marcado zeraria toda espera sem erro visível: o
    número ficaria bom demais e ninguém desconfiaria do motivo.
  */
  if (ativo && dias.length === 0) {
    return { erro: "Marque ao menos um dia de atendimento." };
  }

  try {
    await apiFetch("/organizations/current", {
      method: "PATCH",
      body: JSON.stringify({
        expedienteAtivo: ativo,
        expedienteDias: dias,
        expedienteInicio: inicio,
        expedienteFim: fim,
      }),
    });
  } catch (error) {
    if (error instanceof ApiRequestError) return { erro: error.body.message };
    return { erro: "Não foi possível salvar o horário." };
  }

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { salvoEm: Date.now() };
}
