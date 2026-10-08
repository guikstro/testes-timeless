import { NextRequest, NextResponse } from "next/server";
import { repassaParaApi } from "@/lib/api-proxy";

type Context = { params: Promise<{ path: string[] }> };
function allowed(path: string[]) {
  return (
    (path.length === 1 &&
      /^(list|analytics|units|sources|[a-f0-9-]{36})$/.test(path[0])) ||
    (path.length === 2 &&
      /^[a-f0-9-]{36}$/.test(path[0]) &&
      path[1] === "review") ||
    (path.length === 3 &&
      path[0] === "sources" &&
      /^[a-f0-9-]{36}$/.test(path[1]) &&
      ["rotate", "revoke"].includes(path[2]))
  );
}
async function proxy(request: NextRequest, context: Context, write: boolean) {
  const { path } = await context.params;
  if (!allowed(path))
    return NextResponse.json(
      { message: "Rota não encontrada." },
      { status: 404 },
    );
  const suffix =
    path[0] === "list" ? "" : `/${path.map(encodeURIComponent).join("/")}`;
  const response = await repassaParaApi(
    request,
    `/sales${suffix}${request.nextUrl.search}`,
    write ? { method: "POST", body: await request.text() } : {},
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}
export const GET = (request: NextRequest, context: Context) =>
  proxy(request, context, false);
export const POST = (request: NextRequest, context: Context) =>
  proxy(request, context, true);
