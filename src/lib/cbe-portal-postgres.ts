import { Client } from "pg";

const LOCAL_DOCKER_DATABASE_URL =
  "postgresql://mo_tshirt:mo_tshirt_dev@localhost:54329/mo_tshirt_docker_test";
const DEFAULT_STORAGE_LIMIT_MB = 512;

export type CbeInfoEntry = {
  id: string;
  title: string;
  email: string;
  password: string;
  notes: string;
  createdAt: string;
};

export type CbeProjectEntry = {
  id: string;
  name: string;
  owner: string;
  status: "Planning" | "In progress" | "Waiting" | "Done";
  priority: "Normal" | "Important" | "Urgent";
  dueDate: string;
  notes: string;
  startedAt: string;
  completedAt: string;
  createdAt: string;
};

export type CbeStorageSnapshot = {
  databaseName: string;
  usedBytes: number;
  limitBytes: number;
  percentUsed: number;
  tableBytes: {
    information: number;
    projects: number;
  };
};

function getDatabaseUrl() {
  const databaseUrl =
    process.env.POSTGRES_TEST_DATABASE_URL ||
    process.env.DATABASE_URL ||
    (process.env.NODE_ENV === "production" ? "" : LOCAL_DOCKER_DATABASE_URL);

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

function getStorageLimitBytes() {
  const configured = Number(process.env.CBE_POSTGRES_STORAGE_LIMIT_MB);
  const limitMb =
    Number.isFinite(configured) && configured > 0
      ? configured
      : DEFAULT_STORAGE_LIMIT_MB;
  return Math.round(limitMb * 1024 * 1024);
}

async function withClient<T>(callback: (client: Client) => Promise<T>) {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    throw new Error("PostgreSQL connection string is not configured.");
  }

  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 8_000,
  });

  try {
    await client.connect();
    await ensureCbeTables(client);
    return await callback(client);
  } finally {
    await client.end().catch(() => null);
  }
}

async function ensureCbeTables(client: Client) {
  await client.query(`
    create table if not exists cbe_portal_information (
      id bigserial primary key,
      title text not null,
      email text not null default '',
      password text not null default '',
      notes text not null default '',
      created_at timestamptz not null default now()
    )
  `);

  await client.query(`
    create table if not exists cbe_portal_projects (
      id bigserial primary key,
      name text not null,
      owner text not null default '',
      status text not null default 'Planning'
        check (status in ('Planning', 'In progress', 'Waiting', 'Done')),
      due_date date,
      notes text not null default '',
      created_at timestamptz not null default now()
    )
  `);

  await client.query(`
    alter table cbe_portal_projects
      add column if not exists priority text not null default 'Normal',
      add column if not exists started_at timestamptz not null default now(),
      add column if not exists completed_at timestamptz
  `);

  await client.query(`
    do $$
    begin
      if not exists (
        select 1
        from pg_constraint
        where conname = 'cbe_portal_projects_priority_check'
      ) then
        alter table cbe_portal_projects
          add constraint cbe_portal_projects_priority_check
          check (priority in ('Normal', 'Important', 'Urgent'));
      end if;
    end $$;
  `);
}

function toInfoEntry(row: {
  id: string;
  title: string;
  email: string;
  password: string;
  notes: string;
  created_at: string;
}): CbeInfoEntry {
  return {
    id: row.id,
    title: row.title,
    email: row.email,
    password: row.password,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

function toProjectEntry(row: {
  id: string;
  name: string;
  owner: string;
  status: CbeProjectEntry["status"];
  priority: CbeProjectEntry["priority"];
  due_date: string | null;
  notes: string;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}): CbeProjectEntry {
  return {
    id: row.id,
    name: row.name,
    owner: row.owner,
    status: row.status,
    priority: row.priority,
    dueDate: row.due_date || "",
    notes: row.notes,
    startedAt: row.started_at,
    completedAt: row.completed_at || "",
    createdAt: row.created_at,
  };
}

export async function getCbePortalData() {
  return withClient(async (client) => {
    const information = await listCbeInformation(client);
    const projects = await listCbeProjects(client);
    const storage = await getCbeStorage(client);
    return { information, projects, storage };
  });
}

async function listCbeInformation(client: Client) {
  const result = await client.query<{
    id: string;
    title: string;
    email: string;
    password: string;
    notes: string;
    created_at: string;
  }>(`
    select id::text, title, email, password, notes, created_at::text
    from cbe_portal_information
    order by created_at desc, id desc
  `);
  return result.rows.map(toInfoEntry);
}

async function listCbeProjects(client: Client) {
  const result = await client.query<{
    id: string;
    name: string;
    owner: string;
    status: CbeProjectEntry["status"];
    priority: CbeProjectEntry["priority"];
    due_date: string | null;
    notes: string;
    started_at: string;
    completed_at: string | null;
    created_at: string;
  }>(`
    select
      id::text,
      name,
      owner,
      status,
      priority,
      due_date::text,
      notes,
      started_at::text,
      completed_at::text,
      created_at::text
    from cbe_portal_projects
    order by completed_at nulls first, due_date nulls last, created_at desc, id desc
  `);
  return result.rows.map(toProjectEntry);
}

async function getCbeStorage(client: Client): Promise<CbeStorageSnapshot> {
  const result = await client.query<{
    database_name: string;
    used_bytes: string;
    information_bytes: string;
    projects_bytes: string;
  }>(`
    select
      current_database() as database_name,
      pg_database_size(current_database())::text as used_bytes,
      pg_total_relation_size('cbe_portal_information'::regclass)::text as information_bytes,
      pg_total_relation_size('cbe_portal_projects'::regclass)::text as projects_bytes
  `);
  const row = result.rows[0];
  const usedBytes = Number(row?.used_bytes || 0);
  const limitBytes = getStorageLimitBytes();

  return {
    databaseName: row?.database_name || "postgres",
    usedBytes,
    limitBytes,
    percentUsed: limitBytes > 0 ? Math.min(100, (usedBytes / limitBytes) * 100) : 0,
    tableBytes: {
      information: Number(row?.information_bytes || 0),
      projects: Number(row?.projects_bytes || 0),
    },
  };
}

export async function createCbeInformation(input: {
  title: string;
  email: string;
  password: string;
  notes: string;
}) {
  return withClient(async (client) => {
    const result = await client.query<{
      id: string;
      title: string;
      email: string;
      password: string;
      notes: string;
      created_at: string;
    }>(
      `
        insert into cbe_portal_information (title, email, password, notes)
        values ($1, $2, $3, $4)
        returning id::text, title, email, password, notes, created_at::text
      `,
      [input.title, input.email, input.password, input.notes]
    );
    return toInfoEntry(result.rows[0]);
  });
}

export async function deleteCbeInformation(id: string) {
  return withClient(async (client) => {
    await client.query("delete from cbe_portal_information where id = $1", [id]);
  });
}

export async function createCbeProject(input: {
  name: string;
  owner: string;
  priority: CbeProjectEntry["priority"];
  dueDate: string;
  notes: string;
}) {
  return withClient(async (client) => {
    const result = await client.query<{
      id: string;
      name: string;
      owner: string;
      status: CbeProjectEntry["status"];
      priority: CbeProjectEntry["priority"];
      due_date: string | null;
      notes: string;
      started_at: string;
      completed_at: string | null;
      created_at: string;
    }>(
      `
        insert into cbe_portal_projects (name, owner, status, priority, due_date, notes)
        values ($1, $2, 'In progress', $3, $4, $5)
        returning
          id::text,
          name,
          owner,
          status,
          priority,
          due_date::text,
          notes,
          started_at::text,
          completed_at::text,
          created_at::text
      `,
      [input.name, input.owner, input.priority, input.dueDate || null, input.notes]
    );
    return toProjectEntry(result.rows[0]);
  });
}

export async function updateCbeProjectCompletion(id: string, completed: boolean) {
  return withClient(async (client) => {
    const result = await client.query<{
      id: string;
      name: string;
      owner: string;
      status: CbeProjectEntry["status"];
      priority: CbeProjectEntry["priority"];
      due_date: string | null;
      notes: string;
      started_at: string;
      completed_at: string | null;
      created_at: string;
    }>(
      `
        update cbe_portal_projects
        set
          status = $2,
          completed_at = case when $3 then coalesce(completed_at, now()) else null end
        where id = $1
        returning
          id::text,
          name,
          owner,
          status,
          priority,
          due_date::text,
          notes,
          started_at::text,
          completed_at::text,
          created_at::text
      `,
      [id, completed ? "Done" : "In progress", completed]
    );

    if (!result.rows[0]) {
      throw new Error("Project was not found.");
    }

    return toProjectEntry(result.rows[0]);
  });
}

export async function deleteCbeProject(id: string) {
  return withClient(async (client) => {
    await client.query("delete from cbe_portal_projects where id = $1", [id]);
  });
}
