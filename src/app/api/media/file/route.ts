import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-helpers";
import { resolveAdapter } from "@/lib/resolve-adapter";

export async function GET(request: Request) {
  await requireSession();
  const { searchParams } = new URL(request.url);
  const filePath = searchParams.get("path");
  const projectId = searchParams.get("projectId") ?? "";
  const bucketId = searchParams.get("bucketId") ?? null;

  if (!filePath) return NextResponse.json({ error: "Missing path" }, { status: 400 });
  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

  const adapter = resolveAdapter(bucketId, projectId);
  if (!adapter) return NextResponse.json({ error: "Bucket not found" }, { status: 404 });

  if (!adapter.serveFile) {
    // S3/R2 adapters use public URLs directly — no server-side serving needed
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const response = await adapter.serveFile(filePath);
  if (!response) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return response;
}
