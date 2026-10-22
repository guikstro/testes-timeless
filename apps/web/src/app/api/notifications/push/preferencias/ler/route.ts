import { NextRequest } from "next/server";
import { repassaParaApi } from "@/lib/api-proxy";

export async function POST(request: NextRequest) {
  return repassaParaApi(request, "/notifications/push/preferencias/ler", { method: "POST", body: await request.text() });
}
