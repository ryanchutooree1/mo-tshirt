import { NextResponse } from "next/server";
import { Client } from "pg";
import { isAdminRequest } from "@/lib/admin-request";

export const runtime = "nodejs";

const LOCAL_DOCKER_DATABASE_URL =
  "postgresql://mo_tshirt:mo_tshirt_dev@localhost:54329/mo_tshirt_docker_test";

function getDatabaseUrl() {
  return (
    process.env.POSTGRES_TEST_DATABASE_URL ||
    process.env.DATABASE_URL ||
    (process.env.NODE_ENV === "production" ? "" : LOCAL_DOCKER_DATABASE_URL)
  );
}

function getDatabaseUrlSource() {
  if (process.env.POSTGRES_TEST_DATABASE_URL) return "POSTGRES_TEST_DATABASE_URL";
  if (process.env.DATABASE_URL) return "DATABASE_URL";
  if (process.env.NODE_ENV !== "production") return "LOCAL_DOCKER_DATABASE_URL";
  return null;
}

function maskDatabaseUrl(value: string) {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.password) url.password = "****";
    if (url.username) url.username = url.username ? `${url.username.slice(0, 2)}***` : "";
    return url.toString();
  } catch {
    return "Configured, but not a valid URL format.";
  }
}

async function requireAdmin() {
  return isAdminRequest("/api/admin/docker-postgres/test");
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const databaseUrl = getDatabaseUrl();
  return NextResponse.json({
    configured: Boolean(databaseUrl),
    connection: maskDatabaseUrl(databaseUrl),
    env: getDatabaseUrlSource(),
  });
}

export async function POST() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    return NextResponse.json(
      {
        error:
          "Missing POSTGRES_TEST_DATABASE_URL. Start the Docker PostgreSQL service and set the connection string.",
      },
      { status: 400 }
    );
  }

  const startedAt = Date.now();
  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 8_000,
  });

  try {
    await client.connect();
    const versionResult = await client.query<{ version: string }>("select version()");
    await client.query(`
      create table if not exists admin_docker_postgres_tests (
        id bigserial primary key,
        label text not null,
        created_at timestamptz not null default now()
      )
    `);
    const insertResult = await client.query<{
      id: string;
      label: string;
      created_at: string;
    }>(
      "insert into admin_docker_postgres_tests (label) values ($1) returning id, label, created_at",
      [`admin-test-${new Date().toISOString()}`]
    );
    const countResult = await client.query<{ count: string }>(
      "select count(*)::text as count from admin_docker_postgres_tests"
    );

    return NextResponse.json({
      ok: true,
      latencyMs: Date.now() - startedAt,
      database: {
        version: versionResult.rows[0]?.version || "Unknown PostgreSQL",
        table: "admin_docker_postgres_tests",
        rowCount: Number(countResult.rows[0]?.count || 0),
        inserted: insertResult.rows[0] || null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "PostgreSQL test failed.",
      },
      { status: 500 }
    );
  } finally {
    await client.end().catch(() => null);
  }
}
