import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { deletePatternAction, startProject } from "@/app/actions";
import { ColorDot } from "@/components/color-dot";
import { StepText } from "@/components/step-text";
import { getPattern } from "@/lib/db";

export default async function PatternPage({ params }: PageProps<"/patterns/[id]">) {
  await connection();
  const record = await getPattern(Number((await params).id));
  if (!record) notFound();
  const { pattern, issues } = record;
  const issueAt = new Map(issues.map((i) => [`${i.sectionIndex}:${i.stepIndex}`, i]));
  const materials = [
    ["Yarn", pattern.yarns],
    ["Hook", pattern.hooks],
    ["Notions", pattern.notions],
  ] as const;

  return (
    <article className="pt-6">
      <div className="grid gap-8 md:grid-cols-[1fr_280px]">
        <div>
          <h1 className="font-display text-4xl font-semibold leading-tight">{pattern.title}</h1>
          <p className="mt-2 text-muted">
            {pattern.designer && <>by {pattern.designer} · </>}
            {record.sourceUrl ? (
              <a href={record.sourceUrl} target="_blank" rel="noreferrer" className="underline">
                original pattern
              </a>
            ) : (
              <a href={`/files/${record.sourceFile}`} target="_blank" className="underline">
                original PDF
              </a>
            )}
            {" · "}read by {record.extractor === "claude" ? "Claude" : "quick parser"}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <form action={startProject.bind(null, record.id)}>
              <button className="rounded-full bg-yarn px-6 py-3 font-medium text-white transition hover:bg-yarn-dark">
                Start project
              </button>
            </form>
            <form action={deletePatternAction.bind(null, record.id)}>
              <button className="rounded-full border border-line px-5 py-3 text-sm text-muted hover:border-yarn hover:text-yarn">
                Delete
              </button>
            </form>
          </div>

          {pattern.notes.length > 0 && (
            <ul className="mt-6 space-y-1 text-sm text-muted">
              {pattern.notes.map((n, i) => (
                <li key={i}>※ {n}</li>
              ))}
            </ul>
          )}

          {issues.length > 0 && (
            <div className="mt-6 rounded-2xl border border-warn/40 bg-warn/10 p-4">
              <p className="font-medium text-warn">Stitch-count check found {issues.length} likely typo{issues.length > 1 && "s"}</p>
              <ul className="mt-2 space-y-1 text-sm">
                {issues.map((i) => (
                  <li key={`${i.sectionIndex}:${i.stepIndex}`}>
                    <strong>{pattern.sections[i.sectionIndex]?.name}</strong>: {i.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <aside className="space-y-4 rounded-2xl border border-line bg-card p-5 text-sm">
          {record.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={record.imageUrl} alt="" className="-mx-1 -mt-1 rounded-xl" />
          )}
          {record.sourceFile && (
            <Link href={`/patterns/${record.id}/photo`} className="block text-xs text-muted underline hover:text-yarn">
              {record.imageUrl ? "Choose a different photo" : "Choose a photo"}
            </Link>
          )}
          {materials.map(([label, items]) =>
            items.length ? (
              <div key={label}>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</h3>
                <ul className="mt-1 space-y-0.5">{items.map((m, i) => <li key={i}>{m}</li>)}</ul>
              </div>
            ) : null,
          )}
          {pattern.gauge && <p><span className="text-muted">Gauge:</span> {pattern.gauge}</p>}
          {pattern.finishedSize && <p><span className="text-muted">Size:</span> {pattern.finishedSize}</p>}
          {pattern.abbreviations.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Abbreviations</h3>
              <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                {pattern.abbreviations.map((a) => (
                  <div key={a.abbr} className="contents">
                    <dt className="font-medium">{a.abbr}</dt>
                    <dd className="text-muted">{a.meaning}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </aside>
      </div>

      <div className="mt-10 space-y-8">
        {pattern.sections.map((section, si) => (
          <section key={si}>
            <h2 className="font-display text-2xl font-semibold">
              {section.name}
              {section.makeCount > 1 && <span className="ml-2 text-base text-muted">make {section.makeCount}</span>}
            </h2>
            <ol className="mt-3 divide-y divide-line rounded-2xl border border-line bg-card">
              {section.steps.map((step, i) => {
                const issue = issueAt.get(`${si}:${i}`);
                return step.kind === "note" ? (
                  <li key={i} className="px-4 py-2.5 text-sm italic text-muted">{step.text}</li>
                ) : (
                  <li key={i} className={`grid grid-cols-[7.5rem_1fr_auto] gap-3 px-4 py-2.5 ${issue ? "bg-warn/10" : ""}`}>
                    <span className="flex items-center gap-2 whitespace-nowrap font-medium">
                      <ColorDot color={step.color} /> {step.label}
                    </span>
                    <span><StepText text={step.text} abbreviations={pattern.abbreviations} /></span>
                    <span className={`tabular-nums ${issue ? "font-semibold text-warn" : "text-muted"}`} title={issue?.message}>
                      {step.stitchCount != null && `(${step.stitchCount})`}
                      {issue && ` → ${issue.computed}?`}
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
    </article>
  );
}
