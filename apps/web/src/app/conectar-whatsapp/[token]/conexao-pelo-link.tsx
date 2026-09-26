"use client";

/* eslint-disable @next/next/no-img-element -- o QR vem como data URI, não é um asset que o next/image otimize. */
import { useEffect, useState } from "react";
import { MolduraDeAutenticacao } from "@/components/moldura-de-autenticacao";

/** O WhatsApp troca o QR a cada ~20 s; consultar a cada 5 s mantém um código válido na tela. */
const CONSULTA_A_CADA_MS = 5000;

type Situacao =
  | { fase: "carregando" }
  | { fase: "qr"; organizacao: string; qrCodeBase64: string | null }
  | { fase: "conectado"; organizacao: string }
  | { fase: "invalido"; mensagem: string }
  | { fase: "erro" };

async function consulta(token: string): Promise<Situacao> {
  try {
    const resposta = await fetch(`/api/publico/whatsapp/${encodeURIComponent(token)}`, { cache: "no-store" });
    const corpo = await resposta.json().catch(() => null);
    if (resposta.status === 404) return { fase: "invalido", mensagem: corpo?.message ?? "Este link é inválido ou já venceu." };
    if (!resposta.ok || !corpo) return { fase: "erro" };
    if (corpo.status === "CONNECTED") return { fase: "conectado", organizacao: corpo.organizacao };
    return { fase: "qr", organizacao: corpo.organizacao, qrCodeBase64: corpo.qrCodeBase64 };
  } catch {
    return { fase: "erro" };
  }
}

export function ConexaoPeloLink({ token }: { token: string }) {
  const [situacao, setSituacao] = useState<Situacao>({ fase: "carregando" });
  const terminou = situacao.fase === "conectado" || situacao.fase === "invalido";

  useEffect(() => {
    if (terminou) return;
    let ativo = true;
    const atualiza = () => consulta(token).then((nova) => ativo && setSituacao(nova));
    void atualiza();
    const timer = setInterval(atualiza, CONSULTA_A_CADA_MS);
    return () => {
      ativo = false;
      clearInterval(timer);
    };
  }, [token, terminou]);

  if (situacao.fase === "conectado") {
    return (
      <MolduraDeAutenticacao titulo="WhatsApp conectado ✓" descricao={`O WhatsApp de ${situacao.organizacao} já está ligado à plataforma. Pode fechar esta página.`}>
        <span />
      </MolduraDeAutenticacao>
    );
  }

  if (situacao.fase === "invalido") {
    return (
      <MolduraDeAutenticacao titulo="Link indisponível" descricao={situacao.mensagem}>
        <span />
      </MolduraDeAutenticacao>
    );
  }

  const organizacao = situacao.fase === "qr" ? situacao.organizacao : null;
  return (
    <MolduraDeAutenticacao
      titulo="Conectar WhatsApp"
      descricao={organizacao ? `Leia o QR Code com o WhatsApp de ${organizacao}.` : "Preparando o QR Code..."}
    >
      <div className="mt-8 flex flex-col items-center gap-4">
        {situacao.fase === "qr" && situacao.qrCodeBase64 ? (
          <img src={situacao.qrCodeBase64} alt="QR Code para conectar o WhatsApp" className="h-64 w-64 rounded-lg bg-white p-2" />
        ) : (
          <div className="flex h-64 w-64 items-center justify-center rounded-lg border border-line text-corpo text-ink-mute" aria-live="polite">
            {situacao.fase === "erro" ? "Sem conexão. Tentando de novo..." : "Gerando o QR Code..."}
          </div>
        )}
        <ol className="list-decimal space-y-1 pl-5 text-corpo text-ink-soft">
          <li>No celular, abra o WhatsApp.</li>
          <li>Toque em Configurações → Dispositivos conectados → Conectar dispositivo.</li>
          <li>Aponte a câmera para este QR Code.</li>
        </ol>
      </div>
    </MolduraDeAutenticacao>
  );
}
