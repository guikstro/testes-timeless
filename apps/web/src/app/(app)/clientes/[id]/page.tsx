import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { WhatsAppDoCliente, WhatsAppDoClienteDados } from "./whatsapp-do-cliente";
import { CorDoCliente } from "../cor-do-cliente";
import { PessoaDoCliente, PessoasDoCliente } from "./pessoas-do-cliente";
import { ExcluirCliente } from "./excluir-cliente";

export default async function ClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [dados, pessoas] = await Promise.all([
    apiFetch<WhatsAppDoClienteDados>(`/admin/organizations/${id}/whatsapp`),
    apiFetch<PessoaDoCliente[]>(`/admin/organizations/${id}/pessoas`),
  ]);

  return (
    <div className="max-w-2xl">
      <Link href="/clientes" className="text-corpo text-ink-mute hover:text-ink">
        ← Clientes
      </Link>
      <h1 className="mt-2 flex items-center gap-3 font-display text-2xl font-semibold tracking-tight text-ink">
        <CorDoCliente cor={dados.organizacao.brandColor} />
        {dados.organizacao.name}
      </h1>
      <WhatsAppDoCliente dados={dados} />
      <PessoasDoCliente organizationId={id} pessoas={pessoas} />
      <ExcluirCliente organizationId={id} nome={dados.organizacao.name} />
    </div>
  );
}
