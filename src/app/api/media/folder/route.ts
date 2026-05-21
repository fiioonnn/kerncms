import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-helpers";
import { resolveAdapter } from "@/lib/resolve-adapter";

export async function POST(request: Request) {
  await requireSession();
  const { name, parent, projectId, bucketId = null } = await request.json();

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "Missing folder name" }, { status: 400 });
  }
  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

  const sanitized = name.replace(/[^a-zA-Z0-9-_ ]/g, "").trim();
  if (!sanitized) return NextResponse.json({ error: "Invalid folder name" }, { status: 400 });

  const adapter = resolveAdapter(bucketId, projectId);
  if (!adapter) return NextResponse.json({ error: "Bucket not found" }, { status: 404 });

  await adapter.mkdir(parent ?? "", sanitized);
  return NextResponse.json({ success: true, name: sanitized });
}
