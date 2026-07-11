import "server-only";

import { Client } from "pg";
import type { AdminProfile } from "@/lib/admin-profile";

function getDatabaseUrl() {
  const databaseUrl =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    "";

  if (!databaseUrl) return "";

  try {
    const url = new URL(databaseUrl);
    if (url.searchParams.get("sslmode") === "require") {
      url.searchParams.set("sslmode", "verify-full");
      return url.toString();
    }
  } catch {}

  return databaseUrl;
}

async function ensureAdminProfileTable(client: Client) {
  await client.query(`
    create table if not exists admin_profiles (
      user_id text primary key,
      display_name varchar(80) not null,
      headline varchar(100) not null default '',
      location varchar(100) not null default '',
      bio varchar(240) not null default '',
      avatar_data_url text,
      avatar_zoom double precision not null default 1,
      avatar_offset_x double precision not null default 0,
      avatar_offset_y double precision not null default 0,
      updated_at timestamptz not null default now()
    )
  `);
}

async function withProfileClient<T>(callback: (client: Client) => Promise<T>) {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    throw new Error("PostgreSQL connection string is not configured.");
  }

  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 15_000,
    statement_timeout: 12_000,
  });

  try {
    await client.connect();
    await ensureAdminProfileTable(client);
    return await callback(client);
  } finally {
    await client.end().catch(() => null);
  }
}

export async function getStoredAdminProfile(userId: string) {
  return withProfileClient(async (client) => {
    const result = await client.query<{
      display_name: string;
      headline: string;
      location: string;
      bio: string;
      avatar_data_url: string | null;
      avatar_zoom: number;
      avatar_offset_x: number;
      avatar_offset_y: number;
    }>(
      `
        select
          display_name,
          headline,
          location,
          bio,
          avatar_data_url,
          avatar_zoom,
          avatar_offset_x,
          avatar_offset_y
        from admin_profiles
        where user_id = $1
        limit 1
      `,
      [userId]
    );
    const row = result.rows[0];
    if (!row) return null;

    return {
      displayName: row.display_name,
      headline: row.headline,
      location: row.location,
      bio: row.bio,
      avatarDataUrl: row.avatar_data_url,
      avatarZoom: Number(row.avatar_zoom),
      avatarOffsetX: Number(row.avatar_offset_x),
      avatarOffsetY: Number(row.avatar_offset_y),
    };
  });
}

export async function saveStoredAdminProfile(userId: string, profile: AdminProfile) {
  return withProfileClient(async (client) => {
    await client.query(
      `
        insert into admin_profiles (
          user_id,
          display_name,
          headline,
          location,
          bio,
          avatar_data_url,
          avatar_zoom,
          avatar_offset_x,
          avatar_offset_y,
          updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
        on conflict (user_id) do update set
          display_name = excluded.display_name,
          headline = excluded.headline,
          location = excluded.location,
          bio = excluded.bio,
          avatar_data_url = excluded.avatar_data_url,
          avatar_zoom = excluded.avatar_zoom,
          avatar_offset_x = excluded.avatar_offset_x,
          avatar_offset_y = excluded.avatar_offset_y,
          updated_at = now()
      `,
      [
        userId,
        profile.displayName,
        profile.headline,
        profile.location,
        profile.bio,
        profile.avatarDataUrl,
        profile.avatarZoom,
        profile.avatarOffsetX,
        profile.avatarOffsetY,
      ]
    );
  });
}
