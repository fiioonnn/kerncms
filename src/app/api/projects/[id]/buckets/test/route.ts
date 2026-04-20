import { NextResponse } from "next/server";
import { requireSession, requireRole } from "@/lib/auth-helpers";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession();
  const { id } = await params;
  await requireRole(id, session.user.id, ["admin", "editor", "viewer"]);

  const { provider, config } = await request.json() as {
    provider: string;
    config: {
      region?: string;
      accessKeyId?: string;
      secretAccessKey?: string;
      endpoint?: string;
      publicUrl?: string;
      bucket?: string;
    };
  };

  if (provider === "github") {
    return NextResponse.json({ ok: true });
  }

  const errors: string[] = [];

  try {
    const client = new S3Client({
      region: config.region ?? "auto",
      credentials: {
        accessKeyId: config.accessKeyId ?? "",
        secretAccessKey: config.secretAccessKey ?? "",
      },
      ...(config.endpoint ? { endpoint: config.endpoint, forcePathStyle: true } : {}),
    });

    await client.send(
      new ListObjectsV2Command({ Bucket: config.bucket ?? "", MaxKeys: 1 }),
    );
  } catch (err) {
    errors.push(`S3 API: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (config.publicUrl) {
    try {
      const testUrl = config.publicUrl.replace(/\/$/, "");
      const res = await fetch(testUrl, { method: "HEAD", signal: AbortSignal.timeout(5000) });
      if (!res.ok && res.status !== 404) {
        errors.push(`Public URL: HTTP ${res.status}`);
      }
    } catch (err) {
      errors.push(`Public URL: ${err instanceof Error ? err.message : "unreachable"}`);
    }
  }

  if (config.endpoint) {
    try {
      const res = await fetch(config.endpoint, { method: "HEAD", signal: AbortSignal.timeout(5000) });
      if (res.status >= 500) {
        errors.push(`Endpoint: HTTP ${res.status}`);
      }
    } catch (err) {
      errors.push(`Endpoint: ${err instanceof Error ? err.message : "unreachable"}`);
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ ok: false, error: errors.join("; ") });
  }

  return NextResponse.json({ ok: true });
}
