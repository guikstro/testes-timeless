import { NextRequest } from "next/server";
import { repassaParaApi } from "@/lib/api-proxy";

export async function POST(request: NextRequest) {
  return repassaParaApi(request, "/notifications/read-all", { method: "POST" });
}
