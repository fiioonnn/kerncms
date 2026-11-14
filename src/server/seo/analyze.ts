import "server-only";
import { parseDocument } from "htmlparser2";
import type { SeoFacts, SeoHeading, SeoImage } from "@/lib/seo";
import { getPreview } from "../preview";

type ChildNode = ReturnType<typeof parseDocument>["children"][number];
type Element = Extract<ChildNode, { attribs: Record<string, string> }>;

/* Reads the SEO facts of a page from the HTML the site's preview server renders (the draft). */

const SKIP = new Set(["script", "style", "noscript", "template", "svg", "iframe", "head"]);
const BLOCK_TAGS = new Set(["p", "div", "section", "article", "li", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6", "br", "tr", "td", "th", "header", "footer", "nav", "main", "aside", "figure", "figcaption", "blockquote", "dd", "dt"]);
const MAX_TEXT = 60_000;

const isElement = (node: ChildNode): node is Element => node.type === "tag" || node.type === "script" || node.type === "style";

function textOf(node: ChildNode): string {
  if (node.type === "text") return node.data;
  if (!isElement(node) || SKIP.has(node.name)) return "";
  const inner = node.children.map(textOf).join("");
  return BLOCK_TAGS.has(node.name) ? `\n${inner}\n` : inner;
}

const clean = (value: string) => value.replace(/\s+/g, " ").trim();

function find(node: ChildNode, test: (el: Element) => boolean): Element | null {
  if (!isElement(node)) return null;
  if (test(node)) return node;
  for (const child of node.children) {
    const hit = find(child, test);
    if (hit) return hit;
  }
  return null;
}

function walk(node: ChildNode, visit: (el: Element, blockId: string | null) => boolean | void, blockId: string | null = null) {
  if (!isElement(node)) return;
  const id = node.attribs["data-kern-block"] || blockId;
  if (visit(node, id) === false) return;
  for (const child of node.children) walk(child, visit, id);
}

/** Facts from an HTML document. `origin` tells internal from external links. */
export function factsFromHtml(html: string, path: string, status: number, origin: string): SeoFacts {
  const doc = parseDocument(html);
  const root = { type: "tag", name: "#root", attribs: {}, children: doc.children } as unknown as Element;
  const html_ = find(root, (el) => el.name === "html");
  const head = find(root, (el) => el.name === "head");
  const body = find(root, (el) => el.name === "body") ?? root;
  const meta = (attr: "name" | "property", value: string) =>
    head ? find(head, (el) => el.name === "meta" && el.attribs[attr]?.toLowerCase() === value)?.attribs.content ?? null : null;
  const titleEl = head ? find(head, (el) => el.name === "title") : null;

  // Main content: <main> if the site has one, otherwise the body without header, nav and footer.
  const main = find(body, (el) => el.name === "main");
  const contentRoot = main ?? body;
  const chrome = new Set(main ? [] : ["header", "nav", "footer"]);

  const headings: SeoHeading[] = [];
  const images: SeoImage[] = [];
  let internalLinks = 0;
  let externalLinks = 0;
  let firstParagraph = "";
  const pieces: string[] = [];

  walk(contentRoot, (el, blockId) => {
    if (SKIP.has(el.name) || chrome.has(el.name)) return false;
    if (el.attribs.hidden !== undefined || el.attribs["aria-hidden"] === "true") return false;
    const level = /^h([1-6])$/.exec(el.name)?.[1];
    if (level) {
      headings.push({ level: Number(level), text: clean(textOf(el)).slice(0, 160), blockId });
      return;
    }
    if (el.name === "img") {
      images.push({ src: el.attribs.src ?? "", alt: el.attribs.alt === undefined ? null : el.attribs.alt.trim(), blockId });
      return;
    }
    if (el.name === "a" && el.attribs.href) {
      const href = el.attribs.href.trim();
      if (/^(mailto:|tel:|#|javascript:)/i.test(href)) return;
      try {
        const url = new URL(href, origin);
        if (url.origin === origin) {
          if (url.pathname !== path) internalLinks += 1;
        } else externalLinks += 1;
      } catch {
        // Not a URL: ignore.
      }
      return;
    }
    if (el.name === "p" && !firstParagraph) {
      const text = clean(textOf(el));
      if (text.split(" ").length >= 5) firstParagraph = text;
    }
  });

  // Headings in the page chrome still count for the outline (a site title in <header> as H1, say).
  if (!main) {
    walk(body, (el, blockId) => {
      if (SKIP.has(el.name)) return false;
      if (!chrome.has(el.name)) return;
      walk(el, (inner, id) => {
        const level = /^h([1-6])$/.exec(inner.name)?.[1];
        if (level) headings.push({ level: Number(level), text: clean(textOf(inner)).slice(0, 160), blockId: id });
      }, blockId);
      return false;
    });
  }

  for (const child of contentRoot.children) {
    if (isElement(child) && chrome.has(child.name)) continue;
    pieces.push(textOf(child));
  }
  // Line breaks between blocks stay, so sentences of different blocks are not merged.
  const text = pieces
    .join("\n")
    .split("\n")
    .map(clean)
    .filter(Boolean)
    .join("\n");
  const words = text ? text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length : 0;

  const canonical = head ? find(head, (el) => el.name === "link" && (el.attribs.rel ?? "").toLowerCase().split(/\s+/).includes("canonical"))?.attribs.href ?? null : null;

  return {
    path,
    status,
    title: titleEl ? clean(textOf({ ...titleEl, name: "span" } as Element)) || null : null,
    description: meta("name", "description")?.trim() || null,
    robots: meta("name", "robots"),
    canonical,
    ogImage: Boolean(meta("property", "og:image") || meta("name", "twitter:image")),
    lang: html_?.attribs.lang?.trim() || null,
    viewport: Boolean(meta("name", "viewport")),
    headings,
    text: text.slice(0, MAX_TEXT),
    words,
    firstParagraph: firstParagraph.slice(0, 1000),
    images,
    internalLinks,
    externalLinks,
  };
}

/** Renders the page on the site's running preview and reads its facts. Throws when the preview is not running. */
export async function analyzePreview(siteId: string, path: string): Promise<SeoFacts> {
  const preview = getPreview(siteId);
  if (preview.status !== "ready" || !preview.port) throw new Error("Die Vorschau läuft gerade nicht.");
  if (!path.startsWith("/") || path.startsWith("//")) throw new Error("Ungültiger Pfad.");
  const origin = `http://127.0.0.1:${preview.port}`;
  const res = await fetch(origin + path, { signal: AbortSignal.timeout(20_000), headers: { accept: "text/html" }, cache: "no-store" });
  const html = (await res.text()).slice(0, 3_000_000);
  return factsFromHtml(html, path, res.status, origin);
}
