import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  client?: ReturnType<typeof postgres>;
};

// Reuse the connection across HMR reloads in development.
const client = globalForDb.client ?? postgres(process.env.DATABASE_URL!);
if (process.env.NODE_ENV !== "production") globalForDb.client = client;

export const db = drizzle(client, { schema, casing: "snake_case" });
