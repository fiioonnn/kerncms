import { NextResponse } from "next/server";
import { db } from "@/db";
import { user } from "@/db/schema";
import { requireSession, withApi } from "@/lib/auth-helpers";

export const GET = withApi(async () => {
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
})
