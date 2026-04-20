import { NextResponse } from "next/server";
import { requireSession, isSuperAdminRole } from "@/lib/auth-helpers";

const REPO = "fiioonnn/kerncms";
const CACHE_TTL = 60 * 60 * 1000;

let cache: { version: string | null; checkedAt: number } | null = null;

function isNewer(latest: string, current: string): boolean {
  const l = latest.split(".").map(Number);
  const c = current.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((l[i] ?? 0) > (c[i] ?? 0)) return true;
    if ((l[i] ?? 0) < (c[i] ?? 0)) return false;
  }
  return false;
}

async function fetchLatestVersion(): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/releases/latest`,
      { headers: { Accept: "application/vnd.github.v3+json" } }
    );
    if (res.ok) {
      const data = await res.json();
      return data.tag_name?.replace(/^v/, "") ?? null;
    }
    const tagsRes = await fetch(
      `https://api.github.com/repos/${REPO}/tags?per_page=1`,
      { headers: { Accept: "application/vnd.github.v3+json" } }
    );
    if (tagsRes.ok) {
      const tags = await tagsRes.json();
      return tags[0]?.name?.replace(/^v/, "") ?? null;
    }
  } catch {}
  return null;
}

export async function GET() {
  const session = await requireSession();
  if (!isSuperAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const currentVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";

  if (cache && Date.now() - cache.checkedAt < CACHE_TTL) {
    return NextResponse.json({
      currentVersion,
      latestVersion: cache.version,
      updateAvailable: cache.version ? isNewer(cache.version, currentVersion) : false,
    });
  }

  const latestVersion = await fetchLatestVersion();
  cache = { version: latestVersion, checkedAt: Date.now() };

  return NextResponse.json({
    currentVersion,
    latestVersion,
    updateAvailable: latestVersion ? isNewer(latestVersion, currentVersion) : false,
  });
}
