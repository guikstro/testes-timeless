/** Estados possíveis do botão "Avisos neste aparelho". */
export type EstadoDosAvisos =
  | "carregando"
  /** O navegador não sabe fazer isto (ou, no iPhone, o sistema não foi instalado). */
  | "indisponivel"
  | "bloqueado"
  | "desativado"
  | "ativo";

export function navegadorSabe(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** A chave pública vem em base64 de URL; o navegador quer bytes. */
export function chaveEmBytes(base64: string): Uint8Array {
  const preenchida = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const bruto = atob(preenchida.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bruto, (c) => c.charCodeAt(0));
}

export async function estadoAtual(): Promise<EstadoDosAvisos> {
  if (!navegadorSabe()) return "indisponivel";
  if (Notification.permission === "denied") return "bloqueado";
  try {
    const registro = await navigator.serviceWorker.getRegistration("/sw.js");
    const inscricao = await registro?.pushManager.getSubscription();
    return inscricao && Notification.permission === "granted" ? "ativo" : "desativado";
  } catch {
    return "desativado";
  }
}

export async function ativarAvisos(): Promise<EstadoDosAvisos> {
  if (!navegadorSabe()) return "indisponivel";
  const permissao = await Notification.requestPermission();
  if (permissao !== "granted") return permissao === "denied" ? "bloqueado" : "desativado";

  const resposta = await fetch("/api/notifications/push/chave", { cache: "no-store" });
  if (!resposta.ok) throw new Error("Não foi possível obter a chave dos avisos.");
  const { chave } = (await resposta.json()) as { chave: string };

  const registro = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const existente = await registro.pushManager.getSubscription();
  const inscricao =
    existente ??
    (await registro.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: chaveEmBytes(chave) as BufferSource,
    }));

  const salvo = await fetch("/api/notifications/push/inscrever", {
    method: "POST",
    body: JSON.stringify(inscricao.toJSON()),
  });
  if (!salvo.ok) throw new Error("Não foi possível ativar os avisos.");
  return "ativo";
}

export async function desativarAvisos(): Promise<EstadoDosAvisos> {
  const registro = await navigator.serviceWorker.getRegistration("/sw.js");
  const inscricao = await registro?.pushManager.getSubscription();
  if (inscricao) {
    await fetch("/api/notifications/push/inscrever", {
      method: "DELETE",
      body: JSON.stringify({ endpoint: inscricao.endpoint }),
    }).catch(() => undefined);
    await inscricao.unsubscribe();
  }
  return "desativado";
}

export interface PreferenciasDoAviso {
  leadNovo: boolean;
  mensagem: boolean;
}

async function enderecoDesteAparelho(): Promise<string | null> {
  if (!navegadorSabe()) return null;
  const registro = await navigator.serviceWorker.getRegistration("/sw.js");
  return (await registro?.pushManager.getSubscription())?.endpoint ?? null;
}

/** Null quando este aparelho não está inscrito. */
export async function lerPreferencias(): Promise<PreferenciasDoAviso | null> {
  const endpoint = await enderecoDesteAparelho();
  if (!endpoint) return null;
  const resposta = await fetch("/api/notifications/push/preferencias/ler", {
    method: "POST",
    body: JSON.stringify({ endpoint }),
  });
  if (!resposta.ok) return null;
  return ((await resposta.json()) as { preferencias: PreferenciasDoAviso | null }).preferencias;
}

export async function salvarPreferencias(preferencias: PreferenciasDoAviso): Promise<void> {
  const endpoint = await enderecoDesteAparelho();
  if (!endpoint) throw new Error("Os avisos não estão ativos neste aparelho.");
  const resposta = await fetch("/api/notifications/push/preferencias", {
    method: "POST",
    body: JSON.stringify({ endpoint, ...preferencias }),
  });
  if (!resposta.ok) throw new Error("Não foi possível salvar a escolha.");
}
