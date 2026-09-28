"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { excluiCliente } from "../actions";
import { Input } from "@/components/ui/input";

/**
 * Excluir pede a frase com o nome do cliente e o código de duas etapas. A
 * conferência de verdade é na API; aqui o botão só libera quando a frase bate,
 * para o engano aparecer antes de gastar o código.
 */
export function ExcluirCliente({ organizationId, nome }: { organizationId: string; nome: string }) {
  const frase = `Quero excluir o ${nome}`;
  const [aberto, setAberto] = useState(false);
  const [confirmacao, setConfirmacao] = useState("");
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const fraseCerta = confirmacao.trim().replace(/\s+/g, " ") === frase;

  const excluir = (evento: React.FormEvent) => {
    evento.preventDefault();
    startTransition(async () => {
      setErro(null);
      const resultado = await excluiCliente(organizationId, confirmacao, codigo);
      if (resultado?.error) setErro(resultado.error);
    });
  };

  return (
    <section className="mt-6 rounded-xl border border-danger-line/70 bg-panel p-5">
      <h2 className="text-corpo font-medium uppercase tracking-wide text-danger">Zona de perigo</h2>

      {!aberto ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-corpo text-ink-soft">Excluir o cliente desliga o WhatsApp dele e tira o acesso de todos.</p>
          <Button type="button" variant="danger" onClick={() => setAberto(true)}>
            Excluir cliente
          </Button>
        </div>
      ) : (
        <form onSubmit={excluir} className="mt-3 space-y-4">
          <div>
            <label htmlFor="confirmacao" className="mb-1 block text-corpo text-ink-soft">
              Para confirmar, digite <strong className="text-ink">{frase}</strong>
            </label>
            <Input
              id="confirmacao"
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder={frase}
            />
          </div>
          <div>
            <label htmlFor="codigo" className="mb-1 block text-corpo text-ink-soft">
              Código do app autenticador
            </label>
            <Input
              id="codigo"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              className="w-40 tracking-widest"
            />
          </div>
          {erro ? <p className="text-corpo text-danger">{erro}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="danger" loading={pending} disabled={!fraseCerta || codigo.replace(/\s/g, "").length < 6}>
              {pending ? "Excluindo..." : `Excluir ${nome}`}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setAberto(false)} disabled={pending}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
