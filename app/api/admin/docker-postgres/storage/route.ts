import { NextResponse } from "next/server";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { isAdminRequest } from "@/lib/admin-request";

const DEFAULT_HOSTING_LIMIT_GB = 1;
const SKIPPED_DIRS = new Set([".git", "node_modules"]);
const BUILD_FOOTPRINT_PATHS = [".next", "public"];
const SOURCE_FOOTPRINT_PATHS = ["app", "src", "public", "docs", "scripts", "package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "next.config.js", "next.config.ts", "tsconfig.json"];

function toBytesFromGb(value: string | undefined, fallbackGb: number) {
  const parsed = Number(value);
  const gb = Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackGb;
  return Math.round(gb * 1024 * 1024 * 1024);
}

async function pathExists(targetPath: string) {
  try { await stat(targetPath); return true; } catch { return false; }
}

function fromProjectRoot(entry: string) {
  return path.join(/* turbopackIgnore: true */ process.cwd(), entry);
}

async function sumPathBytes(targetPath: string): Promise<number> {
  const info = await stat(targetPath);
  if (info.isFile()) return info.size;
  if (!info.isDirectory()) return 0;
  const entries = await readdir(targetPath, { withFileTypes: true });
  let total = 0;
  for (const entry of entries) {
    if (SKIPPED_DIRS.has(entry.name) || entry.isSymbolicLink()) continue;
    total += await sumPathBytes(path.join(targetPath, entry.name));
  }
  return total;
}

export async function GET() {
  if (!(await isAdminRequest("/api/admin/docker-postgres/storage"))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    const hasBuildOutput = await pathExists(fromProjectRoot(".next"));
    const targets = (hasBuildOutput ? BUILD_FOOTPRINT_PATHS : SOURCE_FOOTPRINT_PATHS).map(fromProjectRoot);
    let usedBytes = 0;
    for (const target of targets) if (await pathExists(target)) usedBytes += await sumPathBytes(target);
    return NextResponse.json({
      provider: process.env.HOSTING_PROVIDER_LABEL?.trim() || (process.env.VERCEL ? "Vercel" : "MO T-SHIRT Host"),
      usedBytes,
      limitBytes: toBytesFromGb(process.env.HOSTING_STORAGE_LIMIT_GB, DEFAULT_HOSTING_LIMIT_GB),
      isEstimate: true,
    });
  } catch (error) {
    console.error("database:storage:get", error);
    return NextResponse.json({ error: "Failed to load storage usage." }, { status: 500 });
  }
}
