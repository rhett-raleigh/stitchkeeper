import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { Pattern } from "./pattern";
import type { StitchIssue } from "./stitchcheck";

export const DATA_DIR = process.env.STITCHKEEPER_DATA ?? path.join(process.cwd(), "data");
export const FILES_DIR = path.join(DATA_DIR, "files");
mkdirSync(FILES_DIR, { recursive: true });

const globalForDb = globalThis as unknown as { stitchkeeperDb?: DatabaseSync };
const db = (globalForDb.stitchkeeperDb ??= new DatabaseSync(path.join(DATA_DIR, "stitchkeeper.db")));

db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS patterns (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    source_url TEXT,
    source_file TEXT,
    image_url TEXT,
    extractor TEXT NOT NULL,
    data TEXT NOT NULL,
    issues TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY,
    pattern_id INTEGER NOT NULL REFERENCES patterns(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    row_index INTEGER NOT NULL DEFAULT 0,
    piece INTEGER NOT NULL DEFAULT 1,
    yarn TEXT NOT NULL DEFAULT '',
    hook TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at TEXT
  );
`);

export type ProjectStatus = "active" | "paused" | "finished" | "frogged";

export type PatternRecord = {
  id: number;
  title: string;
  sourceUrl: string | null;
  sourceFile: string | null;
  imageUrl: string | null;
  extractor: string;
  pattern: Pattern;
  issues: StitchIssue[];
  createdAt: string;
};

export type ProjectRecord = {
  id: number;
  patternId: number;
  name: string;
  status: ProjectStatus;
  rowIndex: number;
  piece: number;
  yarn: string;
  hook: string;
  notes: string;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
};

type Row = Record<string, unknown>;

function toPattern(r: Row): PatternRecord {
  return {
    id: r.id as number,
    title: r.title as string,
    sourceUrl: r.source_url as string | null,
    sourceFile: r.source_file as string | null,
    imageUrl: r.image_url as string | null,
    extractor: r.extractor as string,
    pattern: JSON.parse(r.data as string),
    issues: JSON.parse(r.issues as string),
    createdAt: r.created_at as string,
  };
}

function toProject(r: Row): ProjectRecord {
  return {
    id: r.id as number,
    patternId: r.pattern_id as number,
    name: r.name as string,
    status: r.status as ProjectStatus,
    rowIndex: r.row_index as number,
    piece: r.piece as number,
    yarn: r.yarn as string,
    hook: r.hook as string,
    notes: r.notes as string,
    startedAt: r.started_at as string,
    updatedAt: r.updated_at as string,
    finishedAt: r.finished_at as string | null,
  };
}

export function insertPattern(p: {
  pattern: Pattern;
  issues: StitchIssue[];
  extractor: string;
  sourceUrl?: string | null;
  sourceFile?: string | null;
  imageUrl?: string | null;
}): number {
  const result = db
    .prepare(
      `INSERT INTO patterns (title, source_url, source_file, image_url, extractor, data, issues)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      p.pattern.title,
      p.sourceUrl ?? null,
      p.sourceFile ?? null,
      p.imageUrl ?? null,
      p.extractor,
      JSON.stringify(p.pattern),
      JSON.stringify(p.issues),
    );
  return Number(result.lastInsertRowid);
}

export function findPatternBySource(sourceUrl: string | null, sourceFile: string | null): PatternRecord | null {
  const r = db
    .prepare("SELECT * FROM patterns WHERE (source_url IS NOT NULL AND source_url = ?) OR (source_file IS NOT NULL AND source_file = ?)")
    .get(sourceUrl, sourceFile);
  return r ? toPattern(r) : null;
}

export function listPatterns(): PatternRecord[] {
  return db.prepare("SELECT * FROM patterns ORDER BY created_at DESC, id DESC").all().map(toPattern);
}

export function getPattern(id: number): PatternRecord | null {
  const r = db.prepare("SELECT * FROM patterns WHERE id = ?").get(id);
  return r ? toPattern(r) : null;
}

export function deletePattern(id: number) {
  db.prepare("DELETE FROM projects WHERE pattern_id = ?").run(id);
  db.prepare("DELETE FROM patterns WHERE id = ?").run(id);
}

export function createProject(patternId: number, name: string): number {
  const result = db.prepare("INSERT INTO projects (pattern_id, name) VALUES (?, ?)").run(patternId, name);
  return Number(result.lastInsertRowid);
}

export function listProjects(): (ProjectRecord & { pattern: PatternRecord })[] {
  return db
    .prepare(
      `SELECT pr.*, pa.id AS pa_id FROM projects pr JOIN patterns pa ON pa.id = pr.pattern_id
       ORDER BY CASE pr.status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END, pr.updated_at DESC`,
    )
    .all()
    .map((r) => ({ ...toProject(r), pattern: getPattern(r.pa_id as number)! }));
}

export function getProject(id: number): ProjectRecord | null {
  const r = db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
  return r ? toProject(r) : null;
}

export function updateProject(
  id: number,
  fields: Partial<Pick<ProjectRecord, "rowIndex" | "piece" | "status" | "yarn" | "hook" | "notes" | "name">>,
) {
  const columns: Record<string, string> = {
    rowIndex: "row_index",
    piece: "piece",
    status: "status",
    yarn: "yarn",
    hook: "hook",
    notes: "notes",
    name: "name",
  };
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return;
  const sets = entries.map(([k]) => `${columns[k]} = ?`);
  const values = entries.map(([, v]) => v as string | number);
  if (fields.status === "finished") sets.push("finished_at = datetime('now')");
  db.prepare(`UPDATE projects SET ${sets.join(", ")}, updated_at = datetime('now') WHERE id = ?`).run(...values, id);
}

export function deleteProject(id: number) {
  db.prepare("DELETE FROM projects WHERE id = ?").run(id);
}
