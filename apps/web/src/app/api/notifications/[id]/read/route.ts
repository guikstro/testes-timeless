import { NextRequest } from "next/server";
import { repassaParaApi } from "@/lib/api-proxy";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return repassaParaApi(request, `/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH" });
}
