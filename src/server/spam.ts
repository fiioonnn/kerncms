/*
 * Spam check for public form submissions. Signals add up; at SPAM_SCORE the submission is
 * stored as spam (own tab, no mail, no notification) instead of being dropped, so a false
 * alarm can be moved back. The honeypot (_gotcha) is handled before this and drops silently.
 *
 * _t: the form carries an empty hidden field "_t" that the site's script fills with Date.now()
 * on page load. Bots that post the raw form without running JavaScript send it empty; bots
 * that do run it usually submit within a second or two. Sites without the field send no _t
 * at all and are not judged on timing.
 */

const SPAM_SCORE = 2;
const MIN_FILL_MS = 3000;

const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+/gi;
const MARKUP_LINK = /<a\s[^>]*href|\[url[=\]]|\[\/url\]|\[link[=\]]/i;
const FOREIGN_SCRIPT = /[\u0400-\u04FF\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF\u0E00-\u0E7F]/g;

export type SpamCheck = { spam: boolean; reasons: string[] };

export function checkSpam(data: Record<string, string>, meta: { t?: string; now?: number } = {}): SpamCheck {
  const reasons: string[] = [];
  let score = 0;
  const add = (points: number, reason: string) => {
    score += points;
    reasons.push(reason);
  };
  const values = Object.values(data);
  const all = values.join("\n");

  // Timing
  if (meta.t !== undefined) {
    const started = Number(meta.t);
    if (!meta.t.trim() || !Number.isFinite(started)) add(2, "Ohne JavaScript abgeschickt");
    else {
      const elapsed = (meta.now ?? Date.now()) - started;
      if (elapsed >= 0 && elapsed < MIN_FILL_MS) add(2, "In weniger als 3 Sekunden ausgefüllt");
    }
  }

  // Links
  if (MARKUP_LINK.test(all)) add(2, "Enthält HTML- oder Forum-Links");
  const links = all.match(URL_PATTERN)?.length ?? 0;
  if (links >= 3) add(2, `Enthält ${links} Links`);
  else if (links > 0) add(1, links === 1 ? "Enthält einen Link" : `Enthält ${links} Links`);

  // A name with a link or markup is never a name.
  const name = (data.name ?? "").trim();
  if (name && (/https?:\/\/|www\.|<|>/i.test(name) || name.length > 80)) add(2, "Ungewöhnlicher Name");

  // Mostly Cyrillic / Asian script on a German site.
  const letters = all.match(/\p{L}/gu)?.length ?? 0;
  const foreign = all.match(FOREIGN_SCRIPT)?.length ?? 0;
  if (letters > 20 && foreign / letters > 0.3) add(2, "Überwiegend fremde Schrift");

  return { spam: score >= SPAM_SCORE, reasons };
}
