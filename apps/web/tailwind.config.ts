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
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "rgb(var(--brand) / <alpha-value>)",
          soft: "rgb(var(--brand-soft) / <alpha-value>)",
          ink: "rgb(var(--brand-ink) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "ui-sans-serif", "sans-serif"],
      },
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
      },
      animation: {
        "rise-in": "rise-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) both",
        "fade-in": "fade-in 0.4s ease-out both",
        "pop-in": "pop-in 0.28s cubic-bezier(0.22, 1, 0.36, 1) both",
        shimmer: "shimmer 1.6s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
