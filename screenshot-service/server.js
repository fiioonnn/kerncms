const express = require("express");
const puppeteer = require("puppeteer-core");

const PORT = Number(process.env.PORT || 3000);
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || "/usr/bin/chromium";
const NAV_TIMEOUT = Number(process.env.NAV_TIMEOUT_MS || 30000);

let browserPromise = null;
async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      executablePath: CHROMIUM_PATH,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--hide-scrollbars",
      ],
    });
    browserPromise.then((b) => {
      b.on("disconnected", () => {
        browserPromise = null;
      });
    });
  }
  return browserPromise;
}

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/screenshot", async (req, res) => {
  const { url, viewportWidth = 1280, viewportHeight = 800 } = req.body || {};
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "url required" });
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ error: "invalid url" });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return res.status(400).json({ error: "only http/https supported" });
  }

  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setViewport({
      width: Math.max(320, Math.min(2400, viewportWidth)),
      height: Math.max(400, Math.min(2400, viewportHeight)),
      deviceScaleFactor: 1,
    });
    await page.setUserAgent(
      "Mozilla/5.0 (compatible; kern-screenshotter/1.0; +https://kern.cms)"
    );
    await page.goto(url, { waitUntil: "networkidle0", timeout: NAV_TIMEOUT });

    await page.evaluate(async () => {
      const viewport = window.innerHeight;
      let y = 0;
      while (y < document.documentElement.scrollHeight) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 200));
        y += Math.floor(viewport * 0.8);
      }
      window.scrollTo(0, document.documentElement.scrollHeight);
      await new Promise((r) => setTimeout(r, 400));
      window.scrollTo(0, 0);
      await new Promise((r) => setTimeout(r, 200));
    });

    try {
      await page.waitForNetworkIdle({ idleTime: 500, timeout: NAV_TIMEOUT });
    } catch {
      /* fall through — still try to capture */
    }

    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
      const imgs = Array.from(document.images || []);
      await Promise.all(
        imgs.map((img) => {
          if (img.complete && img.naturalHeight !== 0) return Promise.resolve();
          if (typeof img.decode === "function") {
            return img.decode().catch(() => undefined);
          }
          return new Promise((resolve) => {
            img.addEventListener("load", resolve, { once: true });
            img.addEventListener("error", resolve, { once: true });
          });
        })
      );
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    });

    const dims = await page.evaluate(() => ({
      width: Math.max(
        document.documentElement.scrollWidth,
        document.body ? document.body.scrollWidth : 0
      ),
      height: Math.max(
        document.documentElement.scrollHeight,
        document.body ? document.body.scrollHeight : 0
      ),
    }));

    const raw = await page.screenshot({ fullPage: true, type: "png" });
    const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Length", String(buffer.length));
    res.setHeader("X-Page-Width", String(dims.width));
    res.setHeader("X-Page-Height", String(dims.height));
    res.end(buffer);
  } catch (err) {
    res.status(500).json({ error: err && err.message ? err.message : "screenshot failed" });
  } finally {
    if (page) {
      try {
        await page.close();
      } catch {
        /* ignore */
      }
    }
  }
});

app.listen(PORT, () => {
  console.log(`kern-screenshot listening on :${PORT}`);
});
