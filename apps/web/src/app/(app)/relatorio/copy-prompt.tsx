"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Copiar e baixar o prompt.
 *
 * Os dois caminhos existem porque o prompt é longo: colar direto no ChatGPT é o
 * fluxo normal, mas em conversa que já tem histórico às vezes é melhor anexar o
 * arquivo. `execCommand` fica como reserva porque a área de transferência
 * moderna exige contexto seguro, e em `http://localhost` alguns navegadores a
 * recusam, que é exatamente onde este produto roda em desenvolvimento.
 */
export function CopyPrompt({ prompt, nomeArquivo }: { prompt: string; nomeArquivo: string }) {
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function copiar() {
    setErro(null);
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      const area = document.createElement("textarea");
      area.value = prompt;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const deuCerto = document.execCommand("copy");
      document.body.removeChild(area);
      if (!deuCerto) {
        setErro("Não consegui copiar. Selecione o texto abaixo e copie manualmente.");
        return;
      }
    }
    setCopiado(true);
    window.setTimeout(() => setCopiado(false), 2200);
  }

  function baixar() {
    const blob = new Blob([prompt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = nomeArquivo;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={copiar} variant={copiado ? "secondary" : "primary"}>
        {copiado ? (
          <>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
              <path d="M20 6L9 17l-5-5" />
            </svg>
            Copiado
          </>
        ) : (
          <>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
              <rect x="9" y="9" width="12" height="12" rx="2" />
              <path d="M5 15V5a2 2 0 012-2h10" />
            </svg>
            Copiar prompt
          </>
        )}
      </Button>

      <Button onClick={baixar} variant="secondary">
        Baixar .txt
      </Button>

      <span className="text-apoio text-ink-mute">
        {prompt.length.toLocaleString("pt-BR")} caracteres
      </span>

      {erro ? <span className="text-apoio text-red-600 dark:text-red-400">{erro}</span> : null}
    </div>
  );
}
