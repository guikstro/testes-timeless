"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useState } from "react";
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

export function AppNav({ organizationName, showAdmin }: { organizationName: string; showAdmin: boolean }) {
  const [pinned, setPinned] = useState(false);
  const pathname = usePathname();

  // Repetido em cada rótulo: some quando recolhida, sem tirar do fluxo, para
  // o texto não reposicionar durante a transição.
  const label =
    "min-w-0 truncate opacity-0 transition-opacity duration-150 group-hover:opacity-100 " +
    "group-focus-within:opacity-100 group-data-[pinned=true]:opacity-100";

  function renderItem(item: NavItem, extraClasses = "") {
    const active = isActive(pathname, item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        title={item.label}
        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
          active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        } ${extraClasses}`}
      >
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
        className="group fixed bottom-0 left-0 top-0 z-30 flex w-16 flex-col overflow-hidden border-r border-slate-200 bg-white px-3 py-5 transition-[width] duration-200 ease-out hover:w-60 focus-within:w-60 data-[pinned=true]:w-60 motion-reduce:transition-none"
      >
        <div className="mb-6 flex items-center gap-3 px-1">
          {/* Inicial da organização: a âncora visual que sobra quando recolhida. */}
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-sm font-semibold text-white">
            {organizationName.trim().charAt(0).toUpperCase() || "?"}
          </span>
          <span className={`text-sm font-semibold text-slate-900 ${label}`}>{organizationName}</span>
        </div>

        <nav className="flex flex-1 flex-col gap-1">{NAV_ITEMS.map((item) => renderItem(item))}</nav>

        <div className="flex flex-col gap-1 pt-2">
          {showAdmin ? renderItem(ADMIN_ITEM) : null}

          <button
            type="button"
            onClick={() => setPinned((current) => !current)}
            aria-pressed={pinned}
            title={pinned ? "Soltar o menu" : "Manter o menu aberto"}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
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

          <div className="px-1 pt-1">
            <LogoutButton collapsedLabelClassName={label} />
          </div>
        </div>
      </aside>
    </div>
  );
}
