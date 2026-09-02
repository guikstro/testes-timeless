/**
 * As marcas de cada integração.
 *
 * Desenhadas como SVG em vez de imagens baixadas: nada de rede, nada para
 * quebrar quando um arquivo some, e a cor da marca fica no código junto do
 * desenho. Reconhecer a plataforma pela cor e pela forma é mais rápido do que
 * ler três nomes.
 */

/** Cor oficial de cada uma, para o quadradinho de fundo e o traço. */
export const COR_DA_MARCA = {
  whatsapp: "#25D366",
  meta: "#0866FF",
  google: "#4285F4",
} as const;

export function LogoWhatsApp() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
      <path d="M12 2a9.9 9.9 0 0 0-8.5 15.1L2 22.5l5.6-1.5A9.9 9.9 0 1 0 12 2Zm0 18a8 8 0 0 1-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1 1 12 20Z" />
      <path d="M16.6 14.3c-.2-.1-1.5-.8-1.8-.9-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.5 6.5 0 0 1-3.3-2.9c-.1-.2 0-.4.1-.5l.6-.7c.1-.2.1-.3 0-.5l-.8-1.9c-.2-.4-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 2.9 2.9 0 0 0-.9 2.2 5 5 0 0 0 1 2.7 11.4 11.4 0 0 0 4.5 4 5 5 0 0 0 2.9.6 2.5 2.5 0 0 0 1.6-1.2 2 2 0 0 0 .1-1.1c0-.1-.2-.2-.3-.2Z" />
    </svg>
  );
}

export function LogoMeta() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" className="h-5 w-5" aria-hidden>
      {/* O laço da Meta: duas voltas que se cruzam no meio. */}
      <path d="M3 12c0-2.8 1.6-5 3.6-5C9.4 7 11 12 12 12s2.6-5 5.4-5c2 0 3.6 2.2 3.6 5s-1.6 5-3.6 5C14.6 17 13 12 12 12s-2.6 5-5.4 5C4.6 17 3 14.8 3 12Z" />
    </svg>
  );
}

export function LogoGoogleAds() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      {/*
        Traços em vez de retângulos rotacionados: em vinte pixels, um
        retângulo girado vira uma mancha, e o traço com ponta redonda mantém a
        forma das duas barras e do ponto verde do ícone do Google Ads.
      */}
      <path d="M8.6 18.4 12.6 5.8" stroke="#FBBC04" strokeWidth="5" strokeLinecap="round" fill="none" />
      <path d="M12.6 5.8 16.2 17.6" stroke="#4285F4" strokeWidth="5" strokeLinecap="round" fill="none" />
      <circle cx="7.4" cy="17.6" r="3.1" fill="#34A853" />
    </svg>
  );
}
