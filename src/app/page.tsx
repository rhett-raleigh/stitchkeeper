import Link from "next/link";
import { connection } from "next/server";
import { listPatterns, listProjects } from "@/lib/db";
import { expandRows } from "@/lib/pattern";

const STATUS_LABEL = { active: "In progress", paused: "Paused", finished: "Finished", frogged: "Frogged" };

export default async function Home() {
  await connection();
  const projects = listProjects();
  const patterns = listPatterns();

  return (
    <div className="space-y-12 pt-6">
      <section>
        <h1 className="font-display text-4xl font-semibold">On the hook</h1>
        {projects.length === 0 ? (
          <p className="mt-3 text-muted">
            No projects yet. Open a pattern below and press <em>Start project</em>.
          </p>
        ) : (
          <ul className="mt-5 grid gap-4 sm:grid-cols-2">
            {projects.map((p) => {
              const rows = expandRows(p.pattern.pattern);
              const done = Math.min(p.rowIndex, rows.length);
              const current = rows[p.rowIndex];
              const section = current && p.pattern.pattern.sections[current.sectionIndex];
              return (
                <li key={p.id}>
                  <Link
                    href={`/projects/${p.id}`}
                    className="block rounded-2xl border border-line bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="font-display text-xl font-semibold">{p.name}</h2>
                      <span className="shrink-0 rounded-full bg-paper px-2.5 py-0.5 text-xs text-muted">
                        {STATUS_LABEL[p.status]}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {current ? `${section?.name} · ${current.label || "note"}` : "All rows done"}
                    </p>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-paper">
                      <div className="h-full rounded-full bg-yarn" style={{ width: `${(done / rows.length) * 100}%` }} />
                    </div>
                    <p className="mt-1.5 text-xs text-muted">
                      {done} of {rows.length} steps
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold">Pattern library</h2>
        {patterns.length === 0 ? (
          <p className="mt-3 text-muted">
            Nothing here yet. <Link href="/import" className="text-yarn underline">Import a pattern</Link> from a link or PDF.
          </p>
        ) : (
          <ul className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">
            {patterns.map((p) => (
              <li key={p.id}>
                <Link href={`/patterns/${p.id}`} className="group block">
                  <div className="aspect-square overflow-hidden rounded-2xl border border-line bg-card">
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageUrl} alt="" className="h-full w-full object-cover transition group-hover:scale-105" />
                    ) : (
                      <div className="flex h-full items-center justify-center font-display text-5xl text-line">
                        {p.title.slice(0, 1)}
                      </div>
                    )}
                  </div>
                  <p className="mt-2 font-medium leading-snug">{p.title}</p>
                  <p className="text-xs text-muted">
                    {p.pattern.designer ?? (p.sourceUrl ? new URL(p.sourceUrl).hostname.replace(/^www\./, "") : "PDF")}
                    {p.issues.length > 0 && <span className="text-warn"> · {p.issues.length} count check{p.issues.length > 1 && "s"}</span>}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
