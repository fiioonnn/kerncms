import { NextResponse } from "next/server";
import { requireSession, requireRole } from "@/lib/auth-helpers";
import { chQuery } from "@/db/clickhouse";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  await requireRole(id, session.user.id, ["admin"]);

  if (!/^[a-f0-9-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
  }

  try {
    await chQuery(`ALTER TABLE events DELETE WHERE project_id = '${id}'`);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to delete events" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
