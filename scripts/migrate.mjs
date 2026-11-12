// Applies the migrations in ./drizzle. Used by the `migrate` service in docker-compose.prod.yml.
// Unlike `drizzle-kit migrate`, it prints the actual error when something goes wrong.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL fehlt.");
  process.exit(1);
}

let host = "?";
try {
  host = new URL(url).host;
} catch {
  console.error("DATABASE_URL ist keine gültige URL. Enthält POSTGRES_PASSWORD Zeichen wie / + @ # ? Dann einen Hex-Wert nehmen (openssl rand -hex 32).");
  process.exit(1);
}

const client = postgres(url, { max: 1, connect_timeout: 10, onnotice: () => {} });
try {
  console.log(`Migrationen auf ${host} …`);
  await migrate(drizzle(client), { migrationsFolder: "drizzle" });
  console.log("Migrationen fertig.");
} catch (error) {
  console.error("Migration fehlgeschlagen:", error?.message ?? error);
  if (error?.cause) console.error("Ursache:", error.cause.message ?? error.cause);
  if ((error?.cause?.code ?? error?.code) === "28P01") {
    console.error(
      "Das Passwort passt nicht. Postgres übernimmt POSTGRES_PASSWORD nur beim ersten Start; wurde es danach geändert, das alte Passwort wieder eintragen oder das Volume postgres-data löschen.",
    );
  }
  process.exitCode = 1;
} finally {
  await client.end();
}
