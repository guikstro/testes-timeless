import { NextRequest } from "next/server";
import { repassaParaApi } from "@/lib/api-proxy";

export async function GET(request: NextRequest) {
  return repassaParaApi(request, "/notifications/push/chave");
}
