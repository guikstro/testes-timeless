import type { Config } from "tailwindcss";

/**
 * Os tokens vivem aqui e em globals.css, nunca soltos nas telas.
 *
 * As cores de superfície e o acento saem de variáveis CSS porque o acento
 * muda por organização (ver BrandProvider): trocar a marca precisa ser uma
 * troca de variável, não uma varredura por classes espalhadas.
 */
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  // Classe, não media query: o usuário escolhe o tema e a escolha precisa
  // vencer a preferência do sistema — com `media` não haveria como.
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "rgb(var(--brand) / <alpha-value>)",
          soft: "rgb(var(--brand-soft) / <alpha-value>)",
          ink: "rgb(var(--brand-ink) / <alpha-value>)",
        },
        /**
         * Paleta Timeless, extraída das artes da marca em Basic Branding:
         * marfim quente #FFF9ED e quase-preto #030403, com o creme #F0EADF
         * que o logotipo usa sobre fundo escuro.
         *
         * Os papéis (ink, canvas, panel…) trocam de valor entre os temas; as
         * telas usam o papel e nunca o tom, então nada precisa saber em que
         * tema está.
         */
        ink: "rgb(var(--ink) / <alpha-value>)",
        "ink-soft": "rgb(var(--ink-soft) / <alpha-value>)",
        "ink-mute": "rgb(var(--ink-mute) / <alpha-value>)",
        canvas: "rgb(var(--canvas) / <alpha-value>)",
        panel: "rgb(var(--panel) / <alpha-value>)",
        "panel-soft": "rgb(var(--panel-soft) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          contrast: "rgb(var(--accent-contrast) / <alpha-value>)",
        },
      },
      /**
       * Quatro degraus, com nome.
       *
       * Antes eram catorze tamanhos escritos à mão, e seis deles cabiam numa
       * faixa de três pixels: 10,5 · 11 · 11,5 · 12 · 12,5 · 13. Ninguém
       * enxerga meio pixel de diferença, mas o olho registra que nada está
       * alinhado, e é isso que faz uma tela parecer quase certa sem que se
       * consiga apontar o motivo.
       *
       * Os nomes dizem o papel, não o tamanho, para o próximo trecho de
       * código não inventar um 12,7.
       */
      fontSize: {
        /** Rótulo de seção, carimbo de hora, legenda. */
        rotulo: ["0.6875rem", { lineHeight: "1.45" }],
        /** Texto de apoio: descrições, prévias, notas de rodapé. */
        apoio: ["0.78125rem", { lineHeight: "1.5" }],
        /** Corpo do produto: o que se lê de verdade. */
        corpo: ["0.84375rem", { lineHeight: "1.55" }],
        /** Número ou frase que precisa saltar dentro de um painel. */
        destaque: ["0.9375rem", { lineHeight: "1.4" }],
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "ui-sans-serif", "sans-serif"],
      },
      height: { 13: "3.25rem" },
      borderRadius: {
        // Raios generosos e contínuos: cantos apertados endurecem a interface.
        lg: "0.625rem",
        xl: "0.875rem",
        "2xl": "1.125rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        // Sombras em camadas e muito suaves — profundidade sem peso.
        subtle: "0 1px 2px rgb(15 23 42 / 0.04), 0 1px 1px rgb(15 23 42 / 0.03)",
        card: "0 1px 2px rgb(15 23 42 / 0.04), 0 8px 24px -12px rgb(15 23 42 / 0.10)",
        lifted: "0 2px 4px rgb(15 23 42 / 0.05), 0 16px 40px -16px rgb(15 23 42 / 0.18)",
        pop: "0 8px 32px -8px rgb(15 23 42 / 0.22)",
      },
      transitionTimingFunction: {
        // Desaceleração longa: o movimento "assenta" em vez de parar seco.
        soft: "cubic-bezier(0.16, 1, 0.3, 1)",
        snap: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      keyframes: {
        "rise-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "none" },
        },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "pop-in": {
          from: { opacity: "0", transform: "scale(0.97)" },
          to: { opacity: "1", transform: "none" },
        },
        shimmer: { from: { backgroundPosition: "200% 0" }, to: { backgroundPosition: "-200% 0" } },
        /* Corrente percorrendo o caminho da atribuição: o produto em movimento. */
        flow: { from: { strokeDashoffset: "220" }, to: { strokeDashoffset: "0" } },
        "pulse-node": {
          "0%, 100%": { opacity: "0.35", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.15)" },
        },
        drift: {
          "0%, 100%": { transform: "translate3d(0,0,0) scale(1)" },
          "50%": { transform: "translate3d(2%, -3%, 0) scale(1.06)" },
        },
      },
      animation: {
        "rise-in": "rise-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) both",
        "fade-in": "fade-in 0.4s ease-out both",
        "pop-in": "pop-in 0.28s cubic-bezier(0.22, 1, 0.36, 1) both",
        shimmer: "shimmer 1.6s linear infinite",
        flow: "flow 3.2s linear infinite",
        "pulse-node": "pulse-node 3.2s ease-in-out infinite",
        drift: "drift 18s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
