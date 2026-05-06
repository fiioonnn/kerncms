const CH_URL = process.env.CLICKHOUSE_URL || "http://localhost:8123";
const CH_USER = process.env.CLICKHOUSE_USER || "kern";
const CH_PASS = process.env.CLICKHOUSE_PASSWORD || "kern";
const CH_DB = process.env.CLICKHOUSE_DB || "analytics";

function authHeader() {
  return "Basic " + Buffer.from(`${CH_USER}:${CH_PASS}`).toString("base64");
}

export async function chQuery(sql: string, params?: Record<string, string | number>) {
  const url = new URL(CH_URL);
  url.searchParams.set("database", CH_DB);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(`param_${k}`, String(v));
    }
  }
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
    throw new Error(`ClickHouse query failed (${res.status}): ${text}`);
  }
  const text = await res.text();
  return text;
}

export async function chJson<T = unknown>(sql: string, params?: Record<string, string | number>): Promise<T[]> {
  const text = await chQuery(sql + " FORMAT JSONEachRow", params);
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

export async function chInsert(table: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const url = new URL(CH_URL);
  url.searchParams.set("database", CH_DB);
  url.searchParams.set("query", `INSERT INTO ${table} FORMAT JSONEachRow`);
  const body = rows.map((r) => JSON.stringify(r)).join("\n");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ClickHouse insert failed (${res.status}): ${text}`);
  }
}

export const CLICKHOUSE_DB = CH_DB;
