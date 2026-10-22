"use client";

import { useEffect, useTransition } from "react";
import { moveRow, nextPiece } from "@/app/actions";

type Props = {
  projectId: number;
  canGoBack: boolean;
  finished: boolean;
  // Set when this is the last row of a piece that must be made again.
  repeatPiece: { sectionStart: number; nextPiece: number; of: number } | null;
};

export function TrackerControls({ projectId, canGoBack, finished, repeatPiece }: Props) {
  const [pending, start] = useTransition();
  const forward = () =>
    start(() => (repeatPiece ? nextPiece(projectId, repeatPiece.sectionStart) : moveRow(projectId, 1)));
  const back = () => start(() => moveRow(projectId, -1));

  // Keep the current row visible in the "Jump to" list.
  useEffect(() => {
    const el = document.querySelector<HTMLElement>("[data-current-row]");
    const list = el?.closest("ol");
    if (el && list) list.scrollTop = el.offsetTop - list.clientHeight / 2;
  }, [canGoBack, finished, repeatPiece]);

  // Space / → to advance, ← / Backspace to undo, so a hand stays on the hook.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, button, select")) return;
      if (e.key === " " || e.key === "ArrowRight") { e.preventDefault(); if (!finished) forward(); }
      if (e.key === "ArrowLeft" || e.key === "Backspace") { e.preventDefault(); if (canGoBack) back(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="flex gap-3">
      <button
        onClick={back}
        disabled={!canGoBack || pending}
        className="rounded-full border border-line bg-card px-5 text-2xl text-muted transition hover:border-ink disabled:opacity-40"
        aria-label="Undo last row"
      >
        ↶
      </button>
      <button
        onClick={forward}
        disabled={finished || pending}
        className="flex-1 rounded-full bg-yarn py-5 text-lg font-semibold text-white shadow-md shadow-yarn/30 transition hover:bg-yarn-dark active:scale-[0.98] disabled:opacity-50"
      >
        {finished
          ? "All done 🎉"
          : repeatPiece
            ? `Done, start piece ${repeatPiece.nextPiece} of ${repeatPiece.of}`
            : "Done ✓"}
      </button>
    </div>
  );
}
