"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useState } from "react";
import { OrgLogo } from "@/components/ui/logo";
import { LeaveClientButton } from "./impersonation-banner";
import { LogoutButton } from "./logout-button";

/**
 * Barra de navegação recolhida, que se abre ao passar o mouse.
 *
 * Três decisões que não são óbvias:
 *
 * 1. **Ela flutua sobre o conteúdo, não empurra.** O trilho reserva a largura
 *    dele para sempre no layout; só o painel aberto passa por cima. Se
 *    empurrasse, cada passada de mouse recalcularia a página inteira e os
 *    gráficos do dashboard pulariam do lugar.
 *
 * 2. **Passar o mouse não pode ser o único jeito de abrir.** Em telefone e
 *    tablet não existe hover, e quem navega por teclado nunca passa o mouse em
 *    nada. Por isso ela também abre no foco do teclado e tem um botão de
 *    fixar, que é o caminho de quem usa toque.
 *
 *    A abertura por teclado usa `:has(:focus-visible)`, e não `:focus-within`.
 *    A diferença não é cosmética: `:focus-within` também casa depois de um
 *    clique de mouse, porque clicar dá foco ao elemento — a barra ficava presa
 *    aberta ao tirar o mouse, até se clicar em outro lugar. `:focus-visible` é
 *    justamente o estado que o navegador reserva para foco por teclado.
 *
 * 3. **Recolhida, só sobram ícones** — então sem marcar a página atual a
 *    pessoa se perde. O destaque do item ativo deixa de ser enfeite e vira
 *    parte do que faz a barra funcionar.
 */

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
}

const ICON_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "h-5 w-5 shrink-0",
  "aria-hidden": true,
};

const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M3 13h4v8H3zM10 3h4v18h-4zM17 9h4v12h-4z" />
      </svg>
    ),
  },
  {
    href: "/leads",
    label: "Leads",
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      </svg>
    ),
  },
  {
    href: "/campanhas",
    label: "Campanhas",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 20V10" />
        <path d="M10 20V4" />
        <path d="M16 20v-7" />
        <path d="M22 20H2" />
      </svg>
    ),
  },
  {
    href: "/links",
    label: "Links",
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    ),
  },
  {
    href: "/integrations",
    label: "Integrações",
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M9 3v4M15 3v4M4 7h16v5a8 8 0 0 1-16 0z" />
        <path d="M12 20v2" />
      </svg>
    ),
  },
  {
    href: "/relatorio",
    label: "Relatório",
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M14 3v5h5M15 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" />
        <path d="M9 13h6M9 17h4" />
      </svg>
    ),
  },
  {
    href: "/settings",
    label: "Configurações",
    icon: (
      <svg {...ICON_PROPS}>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

const ADMIN_ITEM: NavItem = {
  href: "/admin",
  label: "Administração",
  icon: (
    <svg {...ICON_PROPS}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
};

function isActive(pathname: string, href: string): boolean {
  // Prefixo, não igualdade: /leads/<id> continua marcando "Leads".
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNav({
  organizationName,
  logoUrl,
  showAdmin,
  impersonating = false,
}: {
  organizationName: string;
  logoUrl?: string | null;
  showAdmin: boolean;
  impersonating?: boolean;
}) {
  const [pinned, setPinned] = useState(false);
  const pathname = usePathname();

  // Repetido em cada rótulo: some quando recolhida, sem tirar do fluxo, para
  // o texto não reposicionar durante a transição.
  const label =
    "min-w-0 truncate opacity-0 transition-opacity duration-150 group-hover:opacity-100 " +
    "group-has-[:focus-visible]:opacity-100 group-data-[pinned=true]:opacity-100";

  function renderItem(item: NavItem, extraClasses = "") {
    const active = isActive(pathname, item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        title={item.label}
        className={`focus-ring group/item relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200 ease-soft active:scale-[0.98] ${
          active
            ? "bg-brand-soft font-medium text-brand-ink"
            : "text-ink-soft hover:bg-panel-soft/80 hover:text-ink"
        } ${extraClasses}`}
      >
        {/* Barra na borda esquerda marca a página atual mesmo recolhida, onde
            o rótulo não existe e só a cor do ícone não basta. */}
        {active ? (
          <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand" />
        ) : null}
        {item.icon}
        <span className={label}>{item.label}</span>
      </Link>
    );
  }

  return (
    // O trilho reserva a largura no layout; o <aside> flutua sobre o conteúdo.
    <div className="w-16 shrink-0">
      <aside
        data-pinned={pinned}
        className="group fixed bottom-0 left-0 top-0 z-30 flex w-16 flex-col overflow-hidden border-r border-line/70 bg-panel/80 px-3 py-5 backdrop-blur-xl transition-[width,box-shadow] duration-300 ease-soft hover:w-60 hover:shadow-lifted has-[:focus-visible]:w-60 data-[pinned=true]:w-60 data-[pinned=true]:shadow-none motion-reduce:transition-none"
      >
        {/*
          Segundo sinal: a identidade no topo do menu passa a ser a do cliente,
          com anel âmbar. É para cá que o olho vai quando a pergunta é "onde eu
          estou", então é aqui que a resposta precisa estar.
        */}
        <div className="mb-6 flex items-center gap-3 px-0.5">
          <span className={impersonating ? "rounded-[14px] ring-2 ring-amber-500 ring-offset-2 ring-offset-panel" : undefined}>
            <OrgLogo name={organizationName} logoUrl={logoUrl} />
          </span>
          <span className={`min-w-0 ${label}`}>
            {impersonating ? (
              <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-400">
                Dentro do cliente
              </span>
            ) : null}
            <span className="block truncate font-display text-sm font-semibold tracking-tight text-ink">
              {organizationName}
            </span>
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-1">{NAV_ITEMS.map((item) => renderItem(item))}</nav>

        <div className="flex flex-col gap-1 pt-2">
          {showAdmin ? renderItem(ADMIN_ITEM) : null}

          <button
            type="button"
            onClick={() => setPinned((current) => !current)}
            aria-pressed={pinned}
            title={pinned ? "Soltar o menu" : "Manter o menu aberto"}
            className="focus-ring flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink-mute transition-all duration-200 ease-soft hover:bg-panel-soft/80 hover:text-ink active:scale-[0.98]"
          >
            <svg {...ICON_PROPS}>
              {pinned ? (
                <path d="M15 4v7l3 3v2H6v-2l3-3V4M12 16v5M9 4h6" />
              ) : (
                <path d="M4 12h16M9 6l-5 6 5 6" />
              )}
            </svg>
            <span className={label}>{pinned ? "Soltar menu" : "Fixar menu"}</span>
          </button>

          {/* Terceiro sinal: a saída vive junto dos controles de sessão. */}
          {impersonating ? <LeaveClientButton collapsedLabelClassName={label} /> : null}

          <div className="px-1 pt-1">
            <LogoutButton collapsedLabelClassName={label} />
          </div>
        </div>
      </aside>
    </div>
  );
}
