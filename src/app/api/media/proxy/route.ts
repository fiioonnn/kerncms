import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  try {
    const absoluteUrl = url.startsWith("/")
      ? `http://localhost:3000${url}`
      : url;
    const res = await fetch(absoluteUrl);
    if (!res.ok) {
      return NextResponse.json({ error: "Failed to fetch image" }, { status: res.status });
    }

    const contentType = res.headers.get("content-type") || "image/png";
    const buffer = await res.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=60",
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to proxy image" }, { status: 500 });
  }
}
