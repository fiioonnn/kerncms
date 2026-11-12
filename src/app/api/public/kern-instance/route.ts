import { NextResponse } from "next/server";
import { instanceId } from "@/server/custom-domains";

/** Lets the domain check confirm that a customer domain really reaches this kerncms instance. */
export function GET() {
  return NextResponse.json({ instance: instanceId() }, { headers: { "Cache-Control": "no-store" } });
}
