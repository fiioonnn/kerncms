const ACRONYMS = new Set(["cta", "url", "seo", "id", "faq", "api", "cms", "html", "css", "og", "rss", "pdf", "ui", "ux", "sku", "vat"]);
const WORDS: Record<string, string> = {
  href: "link",
  src: "image",
  img: "image",
  alt: "alt text",
  desc: "description",
  btn: "button",
  qty: "quantity",
  tel: "phone",
  addr: "address",
  bg: "background",
};

/** Human label for a field key: "cta_href" → "CTA link", "imageAlt" → "Image alt text". */
export function fieldLabel(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase())
    .map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : WORDS[w] ?? w));
  if (words.length === 0) return key;
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Label for a page/section/global name: "about-us" → "About us". */
export function nameLabel(name: string): string {
  return fieldLabel(name);
}
