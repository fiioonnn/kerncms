import { NextResponse } from "next/server";
import { db } from "@/db";
import { user } from "@/db/schema";
import { requireSession } from "@/lib/auth-helpers";

export async function GET() {
  await requireSession();

  const users = db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      role: user.role,
      createdAt: user.createdAt,
    })
    .from(user)
    .all();

  return NextResponse.json(users);
}
