"use client";

import { useRouter } from "next/navigation";

/**
 * `collapsedLabelClassName` vem da barra de navegação: é a mesma regra que
 * esconde os outros rótulos quando ela está recolhida. Passar por parâmetro
 * mantém uma definição só — duas cópias divergiriam na primeira vez que uma
 * delas fosse ajustada.
 */
export function LogoutButton({ collapsedLabelClassName = "" }: { collapsedLabelClassName?: string }) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      title="Sair"
      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5 shrink-0"
        aria-hidden
      >
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
      </svg>
      <span className={collapsedLabelClassName}>Sair</span>
    </button>
  );
}
