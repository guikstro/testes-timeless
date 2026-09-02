import Link from "next/link";

export interface ConexaoDoWhatsApp {
  provider: "CLOUD_API" | "EVOLUTION";
  status: "PENDING_QR" | "CONNECTED" | "DISCONNECTED";
}

/**
 * O estado da conexão, sempre à vista.
 *
 * É o sinal mais importante da operação e ficava escondido dentro de
 * Integrações: com o número caído, nenhum lead entra, e a primeira pessoa a
 * perceber percebe pelo silêncio no dashboard, horas depois. Aqui ele ocupa o
 * espaço que a faixa do topo já gastava sem dizer nada.
 *
 * Conectado é o estado calado de propósito: um aviso permanente para o caso
 * normal treina quem lê a ignorar a faixa, e aí o aviso que importa passa
 * despercebido junto.
 */
export function ConnectionStatus({ conexao }: { conexao: ConexaoDoWhatsApp | null }) {
  const estado = descreve(conexao);

  const conteudo = (
    <>
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        {estado.pulsa ? (
          <span className={`absolute inline-flex h-full w-full rounded-full ${estado.cor} opacity-60 motion-safe:animate-ping`} />
        ) : null}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${estado.cor}`} />
      </span>
      {/* No telefone sobra só o ponto: o rótulo escrito espremeria o sino. */}
      <span className="hidden sm:inline">{estado.rotulo}</span>
      <span className="sr-only sm:hidden">{estado.rotulo}</span>
    </>
  );

  const classe =
    "focus-ring inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-rotulo font-medium text-ink-soft transition-colors";

  return estado.href ? (
    <Link href={estado.href} className={`${classe} hover:bg-ink/[0.06] hover:text-ink`}>
      {conteudo}
    </Link>
  ) : (
    <span className={classe}>{conteudo}</span>
  );
}

function descreve(conexao: ConexaoDoWhatsApp | null): {
  rotulo: string;
  cor: string;
  pulsa: boolean;
  href: string | null;
} {
  if (!conexao) {
    return {
      rotulo: "Sem WhatsApp conectado",
      cor: "bg-ink-mute",
      pulsa: false,
      href: "/integrations/whatsapp",
    };
  }
  if (conexao.status === "CONNECTED") {
    return { rotulo: "WhatsApp conectado", cor: "bg-emerald-500", pulsa: false, href: null };
  }
  if (conexao.status === "PENDING_QR") {
    return {
      rotulo: "Leia o QR Code para conectar",
      cor: "bg-amber-500",
      pulsa: true,
      href: "/integrations/whatsapp",
    };
  }
  return {
    // O texto diz o que está em risco, não só o estado: "desconectado" é um
    // fato, "nenhum lead está entrando" é o motivo de largar tudo e resolver.
    rotulo: "WhatsApp caiu, nenhum lead está entrando",
    cor: "bg-red-500",
    pulsa: true,
    href: "/integrations/whatsapp",
  };
}
