import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-helpers";
import { resolveAdapter } from "@/lib/resolve-adapter";

// GET — list files: ?folder=...&projectId=...&bucketId=...
export async function GET(request: Request) {
  await requireSession();
  const { searchParams } = new URL(request.url);
  const folder = searchParams.get("folder") ?? "";
  const projectId = searchParams.get("projectId") ?? "";
  const bucketId = searchParams.get("bucketId") ?? null;

  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

  const adapter = resolveAdapter(bucketId, projectId);
  if (!adapter) return NextResponse.json({ error: "Bucket not found" }, { status: 404 });

  try {
    const files = await adapter.list(folder);
    return NextResponse.json({ files, folder, rootExists: true });
  } catch (e) {
    console.error("Media list error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ files: [], folder, rootExists: false });
  }
}

// POST — upload files: FormData with projectId, bucketId, folder, files
export async function POST(request: Request) {
  await requireSession();
  const formData = await request.formData();
  const projectId = formData.get("projectId") as string;
  const bucketId = (formData.get("bucketId") as string) || null;
  const folder = (formData.get("folder") as string) ?? "";
  const files = formData.getAll("files") as File[];

  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  if (files.length === 0) return NextResponse.json({ error: "No files" }, { status: 400 });

  const adapter = resolveAdapter(bucketId, projectId);
  if (!adapter) return NextResponse.json({ error: "Bucket not found" }, { status: 404 });

  console.log(`[media-upload] files=${files.length}, names=[${files.map(f => `${f.name}(${f.size}b)`).join(", ")}], folder=${folder}`);

  try {
    await adapter.upload(folder, files);
    return NextResponse.json({ success: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Upload failed";
    console.error("Media upload error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT — replace file in-place: FormData with projectId, bucketId, path (existing), file
export async function PUT(request: Request) {
  await requireSession();
  const formData = await request.formData();
  const projectId = formData.get("projectId") as string;
  const bucketId = (formData.get("bucketId") as string) || null;
  const existingPath = formData.get("path") as string;
  const file = formData.get("file") as File | null;

  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  if (!existingPath) return NextResponse.json({ error: "Missing path" }, { status: 400 });
  if (!file) return NextResponse.json({ error: "Missing file" }, { status: 400 });

  const adapter = resolveAdapter(bucketId, projectId);
  if (!adapter) return NextResponse.json({ error: "Bucket not found" }, { status: 404 });

  try {
    const result = await adapter.replace(existingPath, file);
    return NextResponse.json({ success: true, file: result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Replace failed";
    console.error("Media replace error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PATCH — rename or move: body with projectId, bucketId, and rename or move payload
export async function PATCH(request: Request) {
  await requireSession();
  const body = await request.json();
  const { projectId, bucketId = null } = body;

  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

  const adapter = resolveAdapter(bucketId, projectId);
  if (!adapter) return NextResponse.json({ error: "Bucket not found" }, { status: 404 });

  if (body.rename) {
    const { item, newName } = body.rename;
    await adapter.rename(item, newName);
    return NextResponse.json({ success: true });
  }

  // Move
  const { items, destination } = body;
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "No items" }, { status: 400 });
  }
  await adapter.move(items, destination ?? "");
  return NextResponse.json({ success: true });
}

// DELETE — delete files: body with { paths, projectId, bucketId }
export async function DELETE(request: Request) {
  await requireSession();
  const { paths, projectId, bucketId = null } = await request.json();

  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  if (!Array.isArray(paths) || paths.length === 0) {
    return NextResponse.json({ error: "No paths" }, { status: 400 });
  }

  const adapter = resolveAdapter(bucketId, projectId);
  if (!adapter) return NextResponse.json({ error: "Bucket not found" }, { status: 404 });

  await adapter.delete(paths);
  return NextResponse.json({ success: true });
}
