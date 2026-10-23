"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import * as db from "@/lib/db";
import { importPdf, importUrl } from "@/lib/importer";
import { expandRows } from "@/lib/pattern";

export type ImportState = { error?: string } | null;

export async function importAction(_prev: ImportState, form: FormData): Promise<ImportState> {
  const url = String(form.get("url") ?? "").trim();
  const files = form.getAll("pdf").filter((f): f is File => f instanceof File && f.size > 0);
  const forceClaude = form.get("forceClaude") === "on";

  let lastId: number | null = null;
  let multiple = files.length > 1;
  try {
    if (url) lastId = (await importUrl(url, { forceClaude })).id;
    for (const file of files) {
      const results = await importPdf(Buffer.from(await file.arrayBuffer()), file.name, { forceClaude });
      lastId = results[0].id;
      if (results.length > 1) multiple = true;
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  if (lastId == null) return { error: "Paste a link or choose a PDF." };
  redirect(multiple ? "/" : `/patterns/${lastId}`);
}

export async function startProject(patternId: number) {
  const pattern = await db.getPattern(patternId);
  if (!pattern) throw new Error("Pattern not found");
  const id = await db.createProject(patternId, pattern.title);
  redirect(`/projects/${id}`);
}

export async function deletePatternAction(patternId: number) {
  await db.deletePattern(patternId);
  redirect("/");
}

export async function setPatternPhoto(patternId: number, imageUrl: string | null) {
  // Only photos we extracted ourselves (see lib/extract/images.ts).
  if (imageUrl && !/^\/files\/[a-f0-9]{16}-p\d+(-i\d+)?\.jpg$/.test(imageUrl)) throw new Error("Not a pattern photo");
  await db.setPatternImage(patternId, imageUrl);
  redirect(`/patterns/${patternId}`);
}

export async function moveRow(projectId: number, delta: number) {
  const project = await db.getProject(projectId);
  if (!project) return;
  const pattern = (await db.getPattern(project.patternId))!;
  const rows = expandRows(pattern.pattern);
  const rowIndex = Math.min(Math.max(project.rowIndex + delta, 0), rows.length);
  const changedSection = rows[rowIndex]?.sectionIndex !== rows[project.rowIndex]?.sectionIndex;
  await db.updateProject(projectId, {
    rowIndex,
    piece: changedSection ? 1 : undefined,
    status: project.status === "paused" ? "active" : undefined,
  });
  refresh();
}

export async function jumpToRow(projectId: number, rowIndex: number) {
  await db.updateProject(projectId, { rowIndex, piece: 1 });
  refresh();
}

// Pieces made more than once (e.g. "make 2 arms") restart the same section.
export async function nextPiece(projectId: number, sectionStart: number) {
  const project = await db.getProject(projectId);
  if (!project) return;
  await db.updateProject(projectId, { piece: project.piece + 1, rowIndex: sectionStart });
  refresh();
}

export async function setStatus(projectId: number, status: db.ProjectStatus) {
  await db.updateProject(projectId, { status });
  refresh();
}

export async function saveProjectDetails(projectId: number, form: FormData) {
  await db.updateProject(projectId, {
    name: String(form.get("name") ?? "").trim() || undefined,
    yarn: String(form.get("yarn") ?? ""),
    hook: String(form.get("hook") ?? ""),
    notes: String(form.get("notes") ?? ""),
  });
  refresh();
}

export async function deleteProjectAction(projectId: number) {
  await db.deleteProject(projectId);
  redirect("/");
}
