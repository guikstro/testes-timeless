import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { WhatsAppDoCliente, WhatsAppDoClienteDados } from "./whatsapp-do-cliente";
import { CorDoCliente } from "../cor-do-cliente";

export default async function ClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dados = await apiFetch<WhatsAppDoClienteDados>(`/admin/organizations/${id}/whatsapp`);

  return (
    <div className="max-w-2xl">
      <Link href="/clientes" className="text-sm text-ink-mute hover:text-ink">
        ← Clientes
      </Link>
      <h1 className="mt-2 flex items-center gap-3 font-display text-2xl font-semibold tracking-tight text-ink">
        <CorDoCliente cor={dados.organizacao.brandColor} />
        {dados.organizacao.name}
      </h1>
      <WhatsAppDoCliente dados={dados} />
    </div>
  );
}
