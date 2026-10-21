import { NextRequest } from "next/server";
import { repassaParaApi } from "@/lib/api-proxy";

export async function POST(request: NextRequest) {
  return repassaParaApi(request, "/notifications/push/inscrever", { method: "POST", body: await request.text() });
}

export async function DELETE(request: NextRequest) {
  return repassaParaApi(request, "/notifications/push/inscrever", { method: "DELETE", body: await request.text() });
}
