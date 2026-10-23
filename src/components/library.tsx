"use client";

import Link from "next/link";
import { useState } from "react";

export type LibraryItem = { id: number; title: string; subtitle: string; imageUrl: string | null; issueCount: number };

export function Library({ items }: { items: LibraryItem[] }) {
  const [query, setQuery] = useState("");
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = items.filter((p) => words.every((w) => `${p.title} ${p.subtitle}`.toLowerCase().includes(w)));

  return (
    <>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search ${items.length} patterns`}
        className="mt-4 w-full rounded-xl border border-line bg-card px-4 py-2.5 outline-none focus:border-yarn sm:max-w-sm"
      />
      {shown.length === 0 && <p className="mt-4 text-muted">No patterns match “{query}”.</p>}
      <ul className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        {shown.map((p) => (
          <li key={p.id}>
            <Link href={`/patterns/${p.id}`} className="group block">
              <div className="aspect-square overflow-hidden rounded-2xl border border-line bg-card">
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt="" className="h-full w-full object-cover transition group-hover:scale-105" />
                ) : (
                  <div className="flex h-full items-center justify-center font-display text-5xl text-line">{p.title.slice(0, 1)}</div>
                )}
              </div>
              <p className="mt-2 font-medium leading-snug">{p.title}</p>
              <p className="text-xs text-muted">
                {p.subtitle}
                {p.issueCount > 0 && <span className="text-warn"> · {p.issueCount} count check{p.issueCount > 1 && "s"}</span>}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
