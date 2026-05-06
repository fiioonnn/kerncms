const CH_URL = process.env.CLICKHOUSE_URL || "http://localhost:8123";
const CH_USER = process.env.CLICKHOUSE_USER || "kern";
const CH_PASS = process.env.CLICKHOUSE_PASSWORD || "kern";
const CH_DB = process.env.CLICKHOUSE_DB || "analytics";

function authHeader() {
  return "Basic " + Buffer.from(`${CH_USER}:${CH_PASS}`).toString("base64");
}

async function exec(sql: string, database?: string) {
  const url = new URL(CH_URL);
  if (database) url.searchParams.set("database", database);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "text/plain",
    },
    body: sql,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ClickHouse exec failed (${res.status}): ${text}`);
  }
}

async function waitReady(maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${CH_URL}/ping`);
      if (res.ok) return;
    } catch {
      /* not ready yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("ClickHouse did not become ready in time");
}

const STATEMENTS = [
  `CREATE DATABASE IF NOT EXISTS ${CH_DB}`,
  `
    CREATE TABLE IF NOT EXISTS ${CH_DB}.events (
      timestamp     DateTime DEFAULT now(),
      project_id    String,
      site_id       String,
      name          LowCardinality(String),
      visitor_hash  String,
      session_hash  String,
      path          String,
      referrer      String,
      country       LowCardinality(String),
      region        LowCardinality(String) DEFAULT '',
      city          LowCardinality(String) DEFAULT '',
      lat           Float32 DEFAULT 0,
      lng           Float32 DEFAULT 0,
      device        LowCardinality(String),
      browser       LowCardinality(String),
      os            LowCardinality(String),
      screen_width  UInt16,
      click_x_pct   UInt16 DEFAULT 0,
      click_y_pct   UInt16 DEFAULT 0,
      properties    String
    )
    ENGINE = MergeTree
    PARTITION BY toYYYYMM(timestamp)
    ORDER BY (project_id, timestamp)
    TTL timestamp + INTERVAL 24 MONTH
  `,
  `ALTER TABLE ${CH_DB}.events ADD COLUMN IF NOT EXISTS click_x_pct UInt16 DEFAULT 0`,
  `ALTER TABLE ${CH_DB}.events ADD COLUMN IF NOT EXISTS click_y_pct UInt16 DEFAULT 0`,
  `ALTER TABLE ${CH_DB}.events ADD COLUMN IF NOT EXISTS region LowCardinality(String) DEFAULT ''`,
  `ALTER TABLE ${CH_DB}.events ADD COLUMN IF NOT EXISTS city LowCardinality(String) DEFAULT ''`,
  `ALTER TABLE ${CH_DB}.events ADD COLUMN IF NOT EXISTS lat Float32 DEFAULT 0`,
  `ALTER TABLE ${CH_DB}.events ADD COLUMN IF NOT EXISTS lng Float32 DEFAULT 0`,
];

async function main() {
  await waitReady();
  for (const sql of STATEMENTS) {
    await exec(sql.trim());
  }
  console.log("ClickHouse migrations applied");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
