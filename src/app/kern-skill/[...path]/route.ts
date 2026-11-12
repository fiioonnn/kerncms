import { readSkillFile, SKILL_NAME, skillZip } from "@/server/skill";

/** Public: the skill is documentation, so AI tools and curl can fetch it without a login. */
export async function GET(_request: Request, ctx: RouteContext<"/kern-skill/[...path]">) {
  const name = (await ctx.params).path.join("/");
  if (name === `${SKILL_NAME}.zip`) {
    return new Response(new Uint8Array(await skillZip()), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${SKILL_NAME}.zip"`,
        "Cache-Control": "no-cache",
      },
    });
  }
  const file = await readSkillFile(name);
  if (!file) return new Response("Nicht gefunden", { status: 404 });
  return new Response(new Uint8Array(file), {
    headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "no-cache" },
  });
}
