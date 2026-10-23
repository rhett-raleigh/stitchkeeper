import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Pattern } from "./pattern";
import type { StitchIssue } from "./stitchcheck";

// Cloudflare D1. Schema lives in migrations/; locally it's the miniflare copy in .wrangler/.
const db = () => getCloudflareContext().env.DB;

export type ProjectStatus = "active" | "paused" | "finished" | "frogged";

export type PatternRecord = {
  id: number;
  title: string;
  sourceUrl: string | null;
  sourceFile: string | null;
  imageUrl: string | null;
  /** Pages of the source PDF this pattern came from (a pattern book holds many). */
  sourcePages: { first: number; last: number } | null;
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
    sourcePages: r.source_pages ? JSON.parse(r.source_pages as string) : null,
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

export async function insertPattern(p: {
  pattern: Pattern;
  issues: StitchIssue[];
  extractor: string;
  sourceUrl?: string | null;
  sourceFile?: string | null;
  imageUrl?: string | null;
  sourcePages?: { first: number; last: number } | null;
}): Promise<number> {
  const result = await db()
    .prepare(
      `INSERT INTO patterns (title, source_url, source_file, image_url, source_pages, extractor, data, issues)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      p.pattern.title,
      p.sourceUrl ?? null,
      p.sourceFile ?? null,
      p.imageUrl ?? null,
      p.sourcePages ? JSON.stringify(p.sourcePages) : null,
      p.extractor,
      JSON.stringify(p.pattern),
      JSON.stringify(p.issues),
    )
    .run();
  return result.meta.last_row_id;
}

export async function findPatternBySource(sourceUrl: string | null, sourceFile: string | null): Promise<PatternRecord | null> {
  const r = await db()
    .prepare("SELECT * FROM patterns WHERE (source_url IS NOT NULL AND source_url = ?) OR (source_file IS NOT NULL AND source_file = ?)")
    .bind(sourceUrl, sourceFile)
    .first<Row>();
  return r ? toPattern(r) : null;
}

export async function setPatternImage(id: number, imageUrl: string | null) {
  await db().prepare("UPDATE patterns SET image_url = ? WHERE id = ?").bind(imageUrl, id).run();
}

export async function listPatternsBySourceFile(sourceFile: string): Promise<PatternRecord[]> {
  const { results } = await db().prepare("SELECT * FROM patterns WHERE source_file = ? ORDER BY id").bind(sourceFile).all<Row>();
  return results.map(toPattern);
}

export async function listPatterns(): Promise<PatternRecord[]> {
  const { results } = await db().prepare("SELECT * FROM patterns ORDER BY created_at DESC, id DESC").all<Row>();
  return results.map(toPattern);
}

export async function getPattern(id: number): Promise<PatternRecord | null> {
  const r = await db().prepare("SELECT * FROM patterns WHERE id = ?").bind(id).first<Row>();
  return r ? toPattern(r) : null;
}

export async function deletePattern(id: number) {
  await db().batch([
    db().prepare("DELETE FROM projects WHERE pattern_id = ?").bind(id),
    db().prepare("DELETE FROM patterns WHERE id = ?").bind(id),
  ]);
}

export async function createProject(patternId: number, name: string): Promise<number> {
  const result = await db().prepare("INSERT INTO projects (pattern_id, name) VALUES (?, ?)").bind(patternId, name).run();
  return result.meta.last_row_id;
}

export async function listProjects(): Promise<(ProjectRecord & { pattern: PatternRecord })[]> {
  // Two queries rather than a join, so each pattern's (large) data column is read once.
  const [{ results: projects }, { results: patterns }] = await db().batch<Row>([
    db().prepare(
      `SELECT * FROM projects
       ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END, updated_at DESC`,
    ),
    db().prepare("SELECT * FROM patterns WHERE id IN (SELECT pattern_id FROM projects)"),
  ]);
  const byId = new Map(patterns.map((r) => [r.id as number, toPattern(r)]));
  return projects.map((r) => ({ ...toProject(r), pattern: byId.get(r.pattern_id as number)! }));
}

export async function getProject(id: number): Promise<ProjectRecord | null> {
  const r = await db().prepare("SELECT * FROM projects WHERE id = ?").bind(id).first<Row>();
  return r ? toProject(r) : null;
}

export async function updateProject(
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
  await db()
    .prepare(`UPDATE projects SET ${sets.join(", ")}, updated_at = datetime('now') WHERE id = ?`)
    .bind(...values, id)
    .run();
}

export async function deleteProject(id: number) {
  await db().prepare("DELETE FROM projects WHERE id = ?").bind(id).run();
}
