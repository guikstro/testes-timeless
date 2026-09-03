"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { OrgLogo } from "@/components/ui/logo";

/** Dois megabytes, o mesmo teto do servidor. */
const LIMITE = 2 * 1024 * 1024;
const ACEITOS = ["image/png", "image/jpeg", "image/webp"];

/**
 * Envio da logo por arquivo.
 *
 * Antes só havia um campo de URL, o que obrigava o cliente a hospedar a
 * própria imagem em algum lugar antes de usar o produto. Quem não tem onde
 * hospedar simplesmente ficava sem logo.
 *
 * A conferência de tipo e tamanho acontece aqui e de novo no servidor. Esta
 * daqui existe para dar um erro imediato e específico; a do servidor é a que
 * vale, porque olha os bytes e não confia no que o navegador declarou.
 */
export function LogoUpload({
  organizationName,
  logoUrl,
}: {
  organizationName: string;
  logoUrl: string | null;
}) {
  const router = useRouter();
  const campo = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function escolher(arquivo: File) {
    setErro(null);

    if (!ACEITOS.includes(arquivo.type)) {
      setErro("Use PNG, JPEG ou WebP. SVG não é aceito por segurança.");
      return;
    }
    if (arquivo.size > LIMITE) {
      setErro(`A imagem tem ${(arquivo.size / 1024 / 1024).toFixed(1)} MB. O limite é 2 MB.`);
      return;
    }

    setEnviando(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const leitor = new FileReader();
        leitor.onload = () => resolve(String(leitor.result));
        leitor.onerror = () => reject(new Error("leitura"));
        leitor.readAsDataURL(arquivo);
      });

      const resposta = await fetch("/api/organizations/logo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arquivo: dataUrl }),
      });

      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => null);
        setErro(corpo?.message ?? "Não foi possível enviar a imagem.");
        return;
      }

      // Recarrega para a logo nova aparecer no menu e no cabeçalho, e não só
      // aqui: ela é usada em toda a interface.
      router.refresh();
    } catch {
      setErro("Não foi possível ler o arquivo.");
    } finally {
      setEnviando(false);
      if (campo.current) campo.current.value = "";
    }
  }

  async function remover() {
    setErro(null);
    setEnviando(true);
    try {
      await fetch("/api/organizations/logo", { method: "DELETE" });
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <OrgLogo name={organizationName} logoUrl={logoUrl} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => campo.current?.click()}
            disabled={enviando}
            className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-panel px-3.5 text-corpo font-medium text-ink shadow-subtle transition-all duration-200 ease-soft hover:shadow-card active:scale-95 disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
              <path d="M12 16V4M7 9l5-5 5 5" />
              <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            </svg>
            {enviando ? "Enviando..." : logoUrl ? "Trocar imagem" : "Enviar imagem"}
          </button>

          {logoUrl ? (
            <button
              type="button"
              onClick={() => void remover()}
              disabled={enviando}
              className="focus-ring inline-flex h-9 items-center rounded-full px-3 text-corpo font-medium text-ink-mute transition-colors hover:text-ink disabled:opacity-50"
            >
              Remover
            </button>
          ) : null}
        </div>

        <p className="mt-1.5 text-rotulo leading-relaxed text-ink-mute">
          PNG, JPEG ou WebP, até 2 MB. Quadrada fica melhor no menu.
        </p>
        {erro ? (
          <p className="mt-1 text-apoio text-red-600 dark:text-red-400" role="alert">
            {erro}
          </p>
        ) : null}
      </div>

      <input
        ref={campo}
        type="file"
        accept={ACEITOS.join(",")}
        className="hidden"
        onChange={(evento) => {
          const arquivo = evento.target.files?.[0];
          if (arquivo) void escolher(arquivo);
        }}
      />
    </div>
  );
}
