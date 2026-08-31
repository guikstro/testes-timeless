import { apiFetch } from "@/lib/api-client";
import { AddOperatorForm, RevokeOperatorButton } from "./operator-forms";

interface Operator {
  id: string;
  name: string;
  email: string;
  platformRole: "SUPPORT" | "ADMIN";
}

const ROLE_LABELS: Record<Operator["platformRole"], string> = {
  SUPPORT: "Suporte",
  ADMIN: "Administrador",
};

const ROLE_DESCRIPTIONS: Record<Operator["platformRole"], string> = {
  SUPPORT: "Vê os clientes e entra nas contas",
  ADMIN: "Também gerencia operadores",
};

export default async function OperatorsPage() {
  const operators = await apiFetch<Operator[]>("/admin/operators");
  const adminCount = operators.filter((operator) => operator.platformRole === "ADMIN").length;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Operadores</h1>
      <p className="mb-6 mt-1 text-sm text-slate-500">
        Quem da sua equipe pode acessar a administração da plataforma e entrar nas contas dos clientes.
      </p>

      <div className="mb-6">
        <AddOperatorForm />
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Pessoa</th>
              <th className="px-4 py-3 font-medium">Nível</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {operators.map((operator) => (
              <tr key={operator.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{operator.name}</p>
                  <p className="text-xs text-slate-500">{operator.email}</p>
                </td>
                <td className="px-4 py-3">
                  <p className="text-slate-700">{ROLE_LABELS[operator.platformRole]}</p>
                  <p className="text-xs text-slate-400">{ROLE_DESCRIPTIONS[operator.platformRole]}</p>
                </td>
                <td className="px-4 py-3">
                  <RevokeOperatorButton userId={operator.id} name={operator.name} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {adminCount === 1 ? (
        <p className="mt-3 text-xs text-slate-500">
          Há apenas um administrador. Ele não pode ser removido nem rebaixado até que outro seja promovido, do
          contrário, ninguém conseguiria mais gerenciar operadores.
        </p>
      ) : null}
    </div>
  );
}
