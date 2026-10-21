import { Pool, type PoolConfig } from "pg";

/**
 * Create the database pool without interpolating a raw password into a URL.
 * A password such as `pa#ss@word` is valid for PostgreSQL but not valid as an
 * unescaped URI component, so Compose supplies the connection fields directly.
 * DATABASE_URL remains supported for developer and test environments.
 */
export function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString) return new Pool({ connectionString });

  const config: PoolConfig = {
    host: process.env.PGHOST || "db",
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || "agentwatch",
    user: process.env.PGUSER || "agentwatch",
    password: process.env.PGPASSWORD || "agentwatch",
  };
  return new Pool(config);
}
