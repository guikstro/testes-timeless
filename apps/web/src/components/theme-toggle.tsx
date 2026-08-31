"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "timeless-theme";

function resolve(theme: Theme): "light" | "dark" {
  if (theme !== "system") return theme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function apply(theme: Theme) {
  document.documentElement.classList.toggle("dark", resolve(theme) === "dark");
}

/**
 * Alternador de tema com três estados, não dois.
 *
 * "Sistema" é o padrão de propósito: quem já configurou o aparelho para
 * escurecer à noite não deveria precisar configurar de novo aqui. Só quando a
 * pessoa escolhe explicitamente é que gravamos e passamos a ignorar o sistema.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (stored === "light" || stored === "dark") setTheme(stored);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    apply(theme);
    if (theme === "system") window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme, mounted]);

  useEffect(() => {
    if (theme !== "system") return;
    // Seguir o sistema significa seguir também quando ele muda no meio da sessão.
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [theme]);

  const options: { value: Theme; label: string; icon: React.ReactNode }[] = [
    { value: "light", label: "Claro", icon: <SunIcon /> },
    { value: "system", label: "Sistema", icon: <SystemIcon /> },
    { value: "dark", label: "Escuro", icon: <MoonIcon /> },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Tema da interface"
      className={`inline-flex items-center gap-0.5 rounded-full border border-line/70 bg-panel/60 p-0.5 backdrop-blur ${className}`}
    >
      {options.map((option) => {
        // Antes de montar, `mounted` falso evita marcar um botão que pode não
        // corresponder ao tema real — o servidor não sabe o que está gravado.
        const active = mounted && theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.label}
            title={option.label}
            onClick={() => setTheme(option.value)}
            className={`focus-ring flex h-7 w-7 items-center justify-center rounded-full transition-all duration-200 ease-soft active:scale-90 ${
              active ? "bg-ink text-canvas shadow-subtle" : "text-ink-mute hover:bg-ink/5 hover:text-ink"
            }`}
          >
            {option.icon}
          </button>
        );
      })}
    </div>
  );
}

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "h-[15px] w-[15px]",
  "aria-hidden": true,
};

const SunIcon = () => (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);

const MoonIcon = () => (
  <svg {...iconProps}>
    <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />
  </svg>
);

const SystemIcon = () => (
  <svg {...iconProps}>
    <rect x="2.5" y="4" width="19" height="13" rx="2" />
    <path d="M8 20h8" />
  </svg>
);
