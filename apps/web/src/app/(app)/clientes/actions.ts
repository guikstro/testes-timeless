"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { apiFetch, ApiRequestError, rota } from "@/lib/api-client";

export interface NovoClienteState {
  error?: string;
}

export interface LinkGerado {
  url: string;
  expiraEm: string;
}

function mensagemDe(error: unknown, padrao: string): string {
  return error instanceof ApiRequestError ? error.body.message : padrao;
}

export async function criaCliente(_anterior: NovoClienteState, formData: FormData): Promise<NovoClienteState> {
  const nome = String(formData.get("nome") ?? "").trim();
  const cor = String(formData.get("cor") ?? "").trim();
  if (nome.length < 2) return { error: "Informe o nome do cliente." };

  let cliente: { id: string };
  try {
    cliente = await apiFetch<{ id: string }>("/admin/organizations", { method: "POST", body: JSON.stringify({ nome, cor }) });
  } catch (error) {
    return { error: mensagemDe(error, "Não foi possível criar o cliente.") };
  }

  redirect(`/clientes/${cliente.id}`);
}

export async function geraLink(organizationId: string): Promise<LinkGerado | { error: string }> {
  try {
    const link = await apiFetch<LinkGerado>(`/admin/organizations/${organizationId}/whatsapp/link`, { method: "POST" });
    revalidatePath(`/clientes/${organizationId}`);
    return link;
  } catch (error) {
    return { error: mensagemDe(error, "Não foi possível gerar o link.") };
  }
}

/**
 * Pede o código de entrada no cliente. Devolve o destino em vez de
 * redirecionar: um redirect de server action faz o Next visitar a rota duas
 * vezes, e a primeira gastava o código de uso único. Quem navega é o botão.
 * Troca a sessão deste navegador: para voltar à Timeless, é "Sair do cliente".
 */
export async function entra(organizationId: string): Promise<{ destino: string } | { error: string }> {
  let codigo: string;
  try {
    const resposta = await apiFetch<{ entrega: string }>(`/admin/organizations/${organizationId}/entrada`, { method: "POST" });
    codigo = resposta.entrega;
  } catch (error) {
    return { error: mensagemDe(error, "Não foi possível entrar neste cliente.") };
  }
  return { destino: `/entrar-como?codigo=${encodeURIComponent(codigo)}` };
}

export async function desconecta(organizationId: string): Promise<{ error?: string }> {
  try {
    await apiFetch(`/admin/organizations/${organizationId}/whatsapp/desconectar`, { method: "POST" });
    revalidatePath(`/clientes/${organizationId}`);
    return {};
  } catch (error) {
    return { error: mensagemDe(error, "Não foi possível desconectar.") };
  }
}

export async function removePessoa(organizationId: string, userId: string): Promise<{ error?: string }> {
  try {
    await apiFetch(`/admin/organizations/${organizationId}/pessoas/${userId}`, { method: "DELETE" });
    revalidatePath(`/clientes/${organizationId}`);
    return {};
  } catch (error) {
    return { error: mensagemDe(error, "Não foi possível remover.") };
  }
}

export async function excluiCliente(organizationId: string, confirmacao: string, codigo: string): Promise<{ error: string } | void> {
  try {
    await apiFetch(`/admin/organizations/${organizationId}/excluir`, {
      method: "POST",
      body: JSON.stringify({ confirmacao, codigo }),
    });
  } catch (error) {
    return { error: mensagemDe(error, "Não foi possível excluir o cliente.") };
  }
  revalidatePath("/clientes");
  redirect("/clientes");
}

/** Leads, presença local ou os dois: o que o cliente vê no painel dele. */
export async function mudaFoco(organizationId: string, foco: string): Promise<{ erro?: string }> {
  try {
    await apiFetch(rota`/admin/organizations/${organizationId}/foco`, { method: "PUT", body: JSON.stringify({ foco }) });
  } catch (error) {
    return { erro: mensagemDe(error, "Não foi possível mudar o foco.") };
  }
  revalidatePath(`/clientes/${organizationId}`);
  return {};
}

// --- Perfil da Empresa no Google ------------------------------------------

export interface SituacaoDoPerfil {
  configurado: boolean;
  enderecoDeRetorno: string;
  conta: { email: string | null; conectadaEm: string; erro: string | null } | null;
}

export interface PerfilDoCliente {
  locais: {
    localId: string;
    nome: string;
    endereco: string | null;
    numerosAte: string | null;
    sincronizadoEm: string | null;
    erro: string | null;
  }[];
}

export interface LocalDoGoogle {
  localId: string;
  nome: string;
  endereco: string | null;
  cliente: { id: string; nome: string } | null;
}

/** O endereço do consentimento do Google. Quem navega é o botão, com a página inteira. */
export async function iniciaPerfil(volta: string): Promise<{ url: string } | { error: string }> {
  try {
    return await apiFetch<{ url: string }>("/admin/perfil-da-empresa/inicio", { method: "POST", body: JSON.stringify({ volta }) });
  } catch (error) {
    return { error: mensagemDe(error, "Não foi possível começar a conexão com o Google.") };
  }
}

export async function desconectaPerfil(organizationId: string): Promise<{ error?: string }> {
  try {
    await apiFetch("/admin/perfil-da-empresa", { method: "DELETE" });
    revalidatePath(`/clientes/${organizationId}`);
    return {};
  } catch (error) {
    return { error: mensagemDe(error, "Não foi possível desconectar a conta Google.") };
  }
}

export async function locaisDoGoogle(): Promise<{ locais: LocalDoGoogle[]; contasRecusadas: number } | { error: string }> {
  try {
    return await apiFetch<{ locais: LocalDoGoogle[]; contasRecusadas: number }>("/admin/perfil-da-empresa/locais");
  } catch (error) {
    return { error: mensagemDe(error, "Não foi possível listar os perfis do Google.") };
  }
}

export async function definePerfis(organizationId: string, locais: string[]): Promise<{ error?: string }> {
  try {
    await apiFetch(`/admin/organizations/${organizationId}/perfil-da-empresa`, { method: "PUT", body: JSON.stringify({ locais }) });
    revalidatePath(`/clientes/${organizationId}`);
    return {};
  } catch (error) {
    return { error: mensagemDe(error, "Não foi possível salvar os perfis.") };
  }
}

export async function lePerfilAgora(organizationId: string): Promise<{ error?: string }> {
  try {
    await apiFetch(`/admin/organizations/${organizationId}/perfil-da-empresa/ler`, { method: "POST" });
    return {};
  } catch (error) {
    return { error: mensagemDe(error, "Não foi possível pedir a leitura.") };
  }
}
