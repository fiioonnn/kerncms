/*
 * On-page SEO score of a rendered page. The server reads the facts from the preview's HTML
 * (src/server/seo/analyze.ts); the checks and the score are computed here, so the editor can
 * re-score instantly when only the focus keyword changes.
 */

export type SeoHeading = { level: number; text: string; blockId: string | null };
export type SeoImage = { src: string; alt: string | null; blockId: string | null };

/** What the analysis read from the page's HTML. */
export type SeoFacts = {
  path: string;
  status: number;
  title: string | null;
  description: string | null;
  robots: string | null;
  canonical: string | null;
  ogImage: boolean;
  lang: string | null;
  viewport: boolean;
  headings: SeoHeading[];
  /** Visible text of the main content, whitespace collapsed (capped). */
  text: string;
  words: number;
  firstParagraph: string;
  images: SeoImage[];
  internalLinks: number;
  externalLinks: number;
};

export type SeoStatus = "good" | "improve" | "problem";

/** Where a check can be fixed: an SEO field of the page, a block, or the focus keyword. */
export type SeoTarget = { kind: "seo"; field: "title" | "description" | "image" | "noindex" } | { kind: "block"; blockId: string } | { kind: "keyword" };

export type SeoCheck = {
  id: string;
  group: "basics" | "content" | "keyword";
  status: SeoStatus;
  title: string;
  detail: string;
  weight: number;
  target?: SeoTarget;
};

export type SeoReport = { score: number; checks: SeoCheck[] };

export const SEO_GROUPS: Record<SeoCheck["group"], string> = {
  basics: "Grundlagen",
  content: "Inhalt",
  keyword: "Fokus-Suchphrase",
};

const FACTOR: Record<SeoStatus, number> = { good: 1, improve: 0.5, problem: 0 };

/** Lowercase, umlauts spelled out, everything but letters and digits as single spaces. */
export function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const STOPWORDS = new Set(["in", "im", "der", "die", "das", "den", "dem", "des", "und", "oder", "fuer", "von", "vom", "mit", "am", "an", "auf", "zu", "zum", "zur", "bei", "ein", "eine", "einen", "the", "of", "for", "and", "a", "to"]);

/** The words of a phrase that matter (without "in", "für", …). */
function phraseWords(phrase: string) {
  const words = normalizeText(phrase).split(" ").filter(Boolean);
  const meaningful = words.filter((w) => !STOPWORDS.has(w));
  return meaningful.length ? meaningful : words;
}

/** A word of the text matches a keyword word exactly or as a short inflection (Praxis/Praxen aside). */
const wordMatches = (word: string, wanted: string) => word === wanted || (wanted.length >= 4 && word.startsWith(wanted) && word.length - wanted.length <= 3);

/** Whether the text contains all meaningful words of the phrase, in any order ("Zahnarzt in München" matches "Zahnarzt München"). */
export function matchesPhrase(text: string | null | undefined, phrase: string) {
  if (!text) return false;
  const wanted = phraseWords(phrase);
  if (wanted.length === 0) return false;
  const words = normalizeText(text).split(" ");
  return wanted.every((w) => words.some((word) => wordMatches(word, w)));
}

/** In how many sentences the phrase occurs (all its meaningful words in one sentence). */
export function countPhrase(text: string, phrase: string) {
  return text.split(/[.!?;:\n]+/).filter((sentence) => matchesPhrase(sentence, phrase)).length;
}

const contains = matchesPhrase;

function lengthCheck(
  id: string,
  label: string,
  value: string | null,
  [min, max]: [number, number],
  weight: number,
  field: "title" | "description",
  texts: { missing: string; short: string; long: string; good: string },
): SeoCheck {
  const target: SeoTarget = { kind: "seo", field };
  const length = value?.trim().length ?? 0;
  if (!length) return { id, group: "basics", status: "problem", title: `${label} fehlt`, detail: texts.missing, weight, target };
  if (length < min) return { id, group: "basics", status: "improve", title: `${label} ist kurz`, detail: `${length} Zeichen, ideal sind ${min}–${max}. ${texts.short}`, weight, target };
  if (length > max) return { id, group: "basics", status: "improve", title: `${label} ist lang`, detail: `${length} Zeichen, ideal sind ${min}–${max}. ${texts.long}`, weight, target };
  return { id, group: "basics", status: "good", title: `${label} passt`, detail: `${length} Zeichen. ${texts.good}`, weight, target };
}

/** All checks for a page and the 0–100 score. `keyword` is the focus keyword (empty: no keyword checks). */
export function scoreSeo(facts: SeoFacts, keyword: string): SeoReport {
  const checks: SeoCheck[] = [];
  const add = (check: SeoCheck) => checks.push(check);
  const h1s = facts.headings.filter((h) => h.level === 1);

  /* ----- Basics ----- */

  if (facts.robots && /noindex/i.test(facts.robots)) {
    add({ id: "noindex", group: "basics", status: "problem", title: "Für Suchmaschinen gesperrt", detail: "Die Seite steht auf „noindex“ und erscheint deshalb nicht bei Google.", weight: 15, target: { kind: "seo", field: "noindex" } });
  } else {
    add({ id: "noindex", group: "basics", status: "good", title: "Suchmaschinen dürfen die Seite aufnehmen", detail: "Kein „noindex“ gesetzt.", weight: 15, target: { kind: "seo", field: "noindex" } });
  }

  add(
    lengthCheck("title", "Titel", facts.title, [30, 60], 10, "title", {
      missing: "Ohne Titel zeigt Google irgendetwas von der Seite als Überschrift.",
      short: "Ein etwas längerer Titel sagt mehr über die Seite.",
      long: "Google schneidet ihn in den Suchergebnissen ab.",
      good: "Wird in den Suchergebnissen vollständig angezeigt.",
    }),
  );

  add(
    lengthCheck("description", "Beschreibung", facts.description, [70, 160], 10, "description", {
      missing: "Ohne Beschreibung wählt Google selbst einen Textausschnitt für die Suchergebnisse.",
      short: "Nutze den Platz, um zum Klicken einzuladen.",
      long: "Google kürzt sie in den Suchergebnissen.",
      good: "Wird in den Suchergebnissen vollständig angezeigt.",
    }),
  );

  if (!facts.ogImage) {
    add({ id: "og-image", group: "basics", status: "improve", title: "Kein Vorschaubild", detail: "Beim Teilen in sozialen Netzwerken und Messengern erscheint dann kein Bild.", weight: 4, target: { kind: "seo", field: "image" } });
  } else {
    add({ id: "og-image", group: "basics", status: "good", title: "Vorschaubild gesetzt", detail: "Wird beim Teilen angezeigt.", weight: 4, target: { kind: "seo", field: "image" } });
  }

  add(
    facts.viewport
      ? { id: "viewport", group: "basics", status: "good", title: "Für Smartphones eingerichtet", detail: "Die Seite hat ein Viewport-Tag.", weight: 3 }
      : { id: "viewport", group: "basics", status: "problem", title: "Nicht für Smartphones eingerichtet", detail: "Es fehlt das Viewport-Meta-Tag im Code der Website. Google bewertet zuerst die Smartphone-Ansicht.", weight: 3 },
  );
  add(
    facts.lang
      ? { id: "lang", group: "basics", status: "good", title: "Sprache angegeben", detail: `Die Seite ist als „${facts.lang}“ ausgezeichnet.`, weight: 2 }
      : { id: "lang", group: "basics", status: "improve", title: "Sprache nicht angegeben", detail: "Im Code der Website fehlt lang=\"de\" am <html>-Element.", weight: 2 },
  );
  add(
    facts.canonical
      ? { id: "canonical", group: "basics", status: "good", title: "Kanonische Adresse gesetzt", detail: "Google weiß, unter welcher Adresse die Seite gezählt wird.", weight: 2 }
      : { id: "canonical", group: "basics", status: "improve", title: "Keine kanonische Adresse", detail: "Im Code der Website fehlt <link rel=\"canonical\">. Das vermeidet doppelte Treffer.", weight: 2 },
  );

  /* ----- Content ----- */

  if (h1s.length === 0) {
    add({ id: "h1", group: "content", status: "problem", title: "Keine Hauptüberschrift (H1)", detail: "Jede Seite sollte genau eine H1 haben, die sagt, worum es geht.", weight: 10 });
  } else if (h1s.length > 1) {
    const second = h1s.find((h) => h.blockId && h.blockId !== h1s[0].blockId) ?? h1s[1];
    add({
      id: "h1",
      group: "content",
      status: "improve",
      title: `${h1s.length} Hauptüberschriften (H1)`,
      detail: `Besser ist genau eine. Gefunden: ${h1s.map((h) => `„${h.text}“`).join(", ")}.`,
      weight: 10,
      ...(second.blockId ? { target: { kind: "block", blockId: second.blockId } } : {}),
    });
  } else {
    add({ id: "h1", group: "content", status: "good", title: "Eine Hauptüberschrift (H1)", detail: `„${h1s[0].text}“`, weight: 10, ...(h1s[0].blockId ? { target: { kind: "block", blockId: h1s[0].blockId } } : {}) });
  }

  const skip = facts.headings.find((h, i) => i > 0 && h.level > facts.headings[i - 1].level + 1);
  if (skip) {
    const before = facts.headings[facts.headings.indexOf(skip) - 1];
    add({
      id: "heading-order",
      group: "content",
      status: "improve",
      title: "Überschriften überspringen eine Ebene",
      detail: `Auf H${before.level} folgt H${skip.level} („${skip.text}“). Eine lückenlose Gliederung hilft Google und Screenreadern.`,
      weight: 4,
      ...(skip.blockId ? { target: { kind: "block", blockId: skip.blockId } } : {}),
    });
  } else if (facts.headings.length > 1) {
    add({ id: "heading-order", group: "content", status: "good", title: "Überschriften sauber gegliedert", detail: `${facts.headings.length} Überschriften ohne Lücken.`, weight: 4 });
  }

  add(
    facts.words < 150
      ? { id: "words", group: "content", status: "problem", title: "Sehr wenig Text", detail: `${facts.words} Wörter. Mit unter 150 Wörtern hat Google kaum etwas, um die Seite einzuordnen.`, weight: 8 }
      : facts.words < 300
        ? { id: "words", group: "content", status: "improve", title: "Wenig Text", detail: `${facts.words} Wörter. Ab etwa 300 Wörtern lässt sich die Seite besser einordnen.`, weight: 8 }
        : { id: "words", group: "content", status: "good", title: "Genug Text", detail: `${facts.words} Wörter.`, weight: 8 },
  );

  const missingAlt = facts.images.filter((img) => img.alt === null);
  if (facts.images.length > 0) {
    const firstBlock = missingAlt.find((img) => img.blockId)?.blockId;
    add(
      missingAlt.length === 0
        ? { id: "alt", group: "content", status: "good", title: "Alle Bilder haben einen Alternativtext", detail: `${facts.images.length} ${facts.images.length === 1 ? "Bild" : "Bilder"}.`, weight: 8 }
        : {
            id: "alt",
            group: "content",
            status: missingAlt.length * 2 > facts.images.length ? "problem" : "improve",
            title: `${missingAlt.length} ${missingAlt.length === 1 ? "Bild ohne" : "Bilder ohne"} Alternativtext`,
            detail: "Der Alternativtext beschreibt das Bild für Google-Bildersuche und Screenreader.",
            weight: 8,
            ...(firstBlock ? { target: { kind: "block", blockId: firstBlock } } : {}),
          },
    );
  }

  add(
    facts.internalLinks > 0
      ? { id: "internal-links", group: "content", status: "good", title: "Verlinkt auf andere Seiten", detail: `${facts.internalLinks} ${facts.internalLinks === 1 ? "interner Link" : "interne Links"} im Inhalt.`, weight: 4 }
      : { id: "internal-links", group: "content", status: "improve", title: "Keine Links auf andere Seiten", detail: "Links im Inhalt auf passende Seiten der Website helfen Google und Besuchern weiter.", weight: 4 },
  );

  /* ----- Focus keyword ----- */

  const phrase = keyword.trim();
  if (phrase) {
    const k = { kind: "keyword" } as const;
    const inTitle = contains(facts.title, phrase);
    add({ id: "kw-title", group: "keyword", status: inTitle ? "good" : "problem", title: inTitle ? "Im Titel" : "Nicht im Titel", detail: inTitle ? "Der Titel enthält die Suchphrase." : "Der Titel ist das wichtigste Signal. Nimm die Suchphrase möglichst weit vorne auf.", weight: 8, target: { kind: "seo", field: "title" } });

    const inDescription = contains(facts.description, phrase);
    add({ id: "kw-description", group: "keyword", status: inDescription ? "good" : "improve", title: inDescription ? "In der Beschreibung" : "Nicht in der Beschreibung", detail: inDescription ? "Google hebt sie in den Suchergebnissen fett hervor." : "Google hebt die Suchphrase in der Beschreibung fett hervor, das bringt Klicks.", weight: 5, target: { kind: "seo", field: "description" } });

    const inH1 = h1s.some((h) => contains(h.text, phrase));
    const h1Block = h1s[0]?.blockId;
    add({ id: "kw-h1", group: "keyword", status: inH1 ? "good" : "improve", title: inH1 ? "In der Hauptüberschrift" : "Nicht in der Hauptüberschrift", detail: inH1 ? "Die H1 enthält die Suchphrase." : "Die H1 sollte die Suchphrase enthalten.", weight: 6, ...(h1Block ? { target: { kind: "block", blockId: h1Block } } : {}) });

    const inIntro = contains(facts.firstParagraph, phrase);
    add({ id: "kw-intro", group: "keyword", status: inIntro ? "good" : "improve", title: inIntro ? "Im ersten Absatz" : "Nicht im ersten Absatz", detail: inIntro ? "Die Suchphrase kommt gleich am Anfang vor." : "Erwähne die Suchphrase früh im Text.", weight: 4 });

    const isHome = facts.path === "/";
    if (!isHome) {
      const inUrl = contains(facts.path.replace(/[/_-]+/g, " "), phrase);
      add({ id: "kw-url", group: "keyword", status: inUrl ? "good" : "improve", title: inUrl ? "In der Adresse" : "Nicht in der Adresse", detail: inUrl ? `${facts.path} enthält die Suchphrase.` : `Eine Adresse wie /${normalizeText(phrase).replace(/ /g, "-")} hilft ein wenig. Achtung: Eine geänderte Adresse braucht eine Weiterleitung.`, weight: 4 });
    }

    const count = countPhrase(facts.text, phrase);
    const density = facts.words > 0 ? (count * phraseWords(phrase).length * 100) / facts.words : 0;
    const shown = density.toLocaleString("de-DE", { maximumFractionDigits: 1 });
    add(
      count === 0
        ? { id: "kw-density", group: "keyword", status: "problem", title: "Kommt im Text nicht vor", detail: "Die Suchphrase steht nirgends im sichtbaren Text der Seite.", weight: 4, target: k }
        : density > 3
          ? { id: "kw-density", group: "keyword", status: "improve", title: "Sehr häufig im Text", detail: `${count}-mal (${shown} %). Das wirkt schnell überoptimiert, ideal sind 0,5–3 %.`, weight: 4 }
          : density < 0.5
            ? { id: "kw-density", group: "keyword", status: "improve", title: "Selten im Text", detail: `${count}-mal (${shown} %). Ideal sind 0,5–3 %.`, weight: 4 }
            : { id: "kw-density", group: "keyword", status: "good", title: "Gut im Text verteilt", detail: `${count}-mal (${shown} %).`, weight: 4 },
    );
  }

  const total = checks.reduce((sum, c) => sum + c.weight, 0);
  const earned = checks.reduce((sum, c) => sum + c.weight * FACTOR[c.status], 0);
  return { score: total ? Math.round((earned * 100) / total) : 0, checks };
}

/** Color tone of a score, like traffic lights. */
export function scoreTone(score: number): SeoStatus {
  return score >= 80 ? "good" : score >= 50 ? "improve" : "problem";
}
