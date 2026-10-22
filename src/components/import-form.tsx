"use client";

import { useActionState } from "react";
import { importAction } from "@/app/actions";

export function ImportForm({ claude }: { claude: boolean }) {
  const [state, action, pending] = useActionState(importAction, null);

  return (
    <form action={action} className="mt-8 space-y-6 rounded-2xl border border-line bg-card p-6 shadow-sm">
      <label className="block">
        <span className="text-sm font-medium">Pattern link</span>
        <input
          name="url"
          type="url"
          placeholder="https://www.example.com/my-pattern"
          className="mt-1.5 w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 outline-none focus:border-yarn"
        />
      </label>

      <div className="flex items-center gap-3 text-xs uppercase tracking-widest text-muted">
        <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
      </div>

      <label className="block">
        <span className="text-sm font-medium">PDF files</span>
        <input
          name="pdf"
          type="file"
          accept="application/pdf"
          multiple
          className="mt-1.5 block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-ink file:px-4 file:py-2 file:text-paper"
        />
      </label>

      {claude ? (
        <label className="flex items-center gap-2 text-sm text-muted">
          <input name="forceClaude" type="checkbox" className="accent-yarn" />
          Always have Claude read it (otherwise only when the quick parser comes up short)
        </label>
      ) : (
        <p className="rounded-xl bg-paper p-3 text-sm text-muted">
          Using the built-in parser, which handles standard “Round 5: … (24)” patterns. Set{" "}
          <code>ANTHROPIC_API_KEY</code> so Claude can read scanned PDFs and messier layouts.
        </p>
      )}

      {state?.error && <p className="rounded-xl bg-yarn/10 p-3 text-sm text-yarn-dark">{state.error}</p>}

      <button
        disabled={pending}
        className="w-full rounded-full bg-yarn py-3 font-medium text-white transition hover:bg-yarn-dark disabled:opacity-60"
      >
        {pending ? "Reading pattern…" : "Import"}
      </button>
    </form>
  );
}
