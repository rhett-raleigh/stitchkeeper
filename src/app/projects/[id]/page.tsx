import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { deleteProjectAction, jumpToRow, saveProjectDetails, setStatus } from "@/app/actions";
import { ColorDot } from "@/components/color-dot";
import { StepText } from "@/components/step-text";
import { TrackerControls } from "@/components/tracker-controls";
import { getPattern, getProject, type ProjectStatus } from "@/lib/db";
import { expandRows } from "@/lib/pattern";

const STATUSES: [ProjectStatus, string][] = [
  ["active", "In progress"],
  ["paused", "Paused"],
  ["finished", "Finished"],
  ["frogged", "Frogged"],
];

export default async function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  await connection();
  const project = getProject(Number((await params).id));
  if (!project) notFound();
  const record = getPattern(project.patternId)!;
  const { pattern } = record;
  const rows = expandRows(pattern);
  const index = Math.min(project.rowIndex, rows.length);
  const current = rows[index];
  const finished = !current;
  const section = current ? pattern.sections[current.sectionIndex] : null;
  const issue = current && record.issues.find((i) => i.sectionIndex === current.sectionIndex && i.stepIndex === current.stepIndex);

  const sectionRows = rows.map((r, i) => ({ ...r, i })).filter((r) => current && r.sectionIndex === current.sectionIndex);
  const sectionStart = sectionRows[0]?.i ?? 0;
  const isLastOfSection = current && sectionRows.at(-1)?.i === index;
  const repeatPiece =
    section && isLastOfSection && project.piece < section.makeCount
      ? { sectionStart, nextPiece: project.piece + 1, of: section.makeCount }
      : null;
  const upNext = rows.slice(index + 1, index + 3);
  const nextRow = rows.slice(index + 1).find((r) => r.kind === "row");

  return (
    <div className="pt-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">{project.name}</h1>
          <Link href={`/patterns/${record.id}`} className="text-sm text-muted underline">
            {pattern.title} pattern
          </Link>
        </div>
        <div className="flex gap-1 rounded-full border border-line bg-card p-1 text-sm">
          {STATUSES.map(([value, label]) => (
            <form key={value} action={setStatus.bind(null, project.id, value)}>
              <button
                className={`rounded-full px-3 py-1 ${project.status === value ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}
              >
                {label}
              </button>
            </form>
          ))}
        </div>
      </div>

      <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-card">
        <div className="h-full rounded-full bg-yarn transition-all" style={{ width: `${(index / rows.length) * 100}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted">{index} of {rows.length} steps done</p>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <div className="rounded-3xl border border-line bg-card p-6 shadow-sm sm:p-8">
            {finished ? (
              <div className="py-8 text-center">
                <p className="font-display text-4xl font-semibold">Finished!</p>
                <p className="mt-2 text-muted">Every row is done. Mark it Finished up top and admire your work.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between text-sm text-muted">
                  <span className="font-medium uppercase tracking-wider">
                    {section!.name}
                    {section!.makeCount > 1 && ` · piece ${project.piece} of ${section!.makeCount}`}
                  </span>
                  <ColorDot color={current.color} label />
                </div>
                {current.kind === "row" ? (
                  <>
                    <div className="mt-3 flex items-baseline justify-between gap-4">
                      <p className="font-display text-5xl font-semibold sm:text-6xl">{current.label}</p>
                      {current.stitchCount != null && (
                        <p className="text-right">
                          <span className="font-display text-5xl font-semibold tabular-nums text-yarn">
                            {issue ? issue.computed : current.stitchCount}
                          </span>
                          <span className="block text-xs text-muted">stitches</span>
                        </p>
                      )}
                    </div>
                    <p className="mt-5 text-xl leading-relaxed">
                      <StepText text={current.text} abbreviations={pattern.abbreviations} />
                    </p>
                    {issue && (
                      <p className="mt-4 rounded-xl bg-warn/10 p-3 text-sm text-warn">
                        The pattern says ({issue.stated}), but these instructions make {issue.computed}. Count yours!
                      </p>
                    )}
                  </>
                ) : (
                  <p className="mt-4 text-xl italic leading-relaxed">{current.text}</p>
                )}
              </>
            )}
          </div>

          <TrackerControls projectId={project.id} canGoBack={index > 0} finished={finished} repeatPiece={repeatPiece} />
          <p className="text-center text-xs text-muted">Tip: press space for done, ← to undo.</p>

          {upNext.length > 0 && (
            <div className="rounded-2xl border border-dashed border-line p-4 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Up next</p>
              {upNext.map((r, i) => (
                <p key={i} className="mt-1.5 text-muted">
                  {r.kind === "row" ? <><strong className="text-ink">{r.label}</strong> {r.text}</> : <em>{r.text}</em>}
                </p>
              ))}
              {nextRow && section && nextRow.sectionIndex !== current?.sectionIndex && (
                <p className="mt-2 text-xs text-sage">Next piece: {pattern.sections[nextRow.sectionIndex].name}</p>
              )}
            </div>
          )}
        </div>

        <aside className="space-y-6">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Jump to</h2>
            <ol className="relative mt-2 max-h-[22rem] overflow-y-auto rounded-2xl border border-line bg-card text-sm">
              {rows.map((r, i) =>
                r.kind === "row" ? (
                  <li key={i} data-current-row={i === index || undefined}>
                    <form action={jumpToRow.bind(null, project.id, i)}>
                      <button
                        className={`flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-paper ${
                          i === index ? "bg-yarn/10 font-semibold text-yarn-dark" : i < index ? "text-muted line-through decoration-line" : ""
                        }`}
                      >
                        <span>
                          <span className="text-xs text-muted no-underline">{pattern.sections[r.sectionIndex].name} · </span>
                          {r.label}
                        </span>
                        <span className="tabular-nums text-muted">{r.stitchCount != null && `(${r.stitchCount})`}</span>
                      </button>
                    </form>
                  </li>
                ) : null,
              )}
            </ol>
          </div>

          <form action={saveProjectDetails.bind(null, project.id)} className="space-y-3 rounded-2xl border border-line bg-card p-4 text-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">My project</h2>
            <Field label="Name" name="name" defaultValue={project.name} />
            <Field label="Yarn I'm using" name="yarn" defaultValue={project.yarn} placeholder={pattern.yarns[0]} />
            <Field label="Hook" name="hook" defaultValue={project.hook} placeholder={pattern.hooks[0]} />
            <label className="block">
              <span className="text-muted">Notes</span>
              <textarea
                name="notes"
                defaultValue={project.notes}
                rows={4}
                className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 outline-none focus:border-yarn"
              />
            </label>
            <button className="rounded-full bg-ink px-4 py-2 text-paper hover:bg-yarn">Save</button>
          </form>

          <form action={deleteProjectAction.bind(null, project.id)}>
            <button className="text-xs text-muted underline hover:text-yarn">Delete project</button>
          </form>
        </aside>
      </div>
    </div>
  );
}

function Field(props: { label: string; name: string; defaultValue: string; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-muted">{props.label}</span>
      <input
        name={props.name}
        defaultValue={props.defaultValue}
        placeholder={props.placeholder}
        className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 outline-none focus:border-yarn"
      />
    </label>
  );
}
