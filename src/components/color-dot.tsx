import { yarnColor } from "@/lib/colors";

export function ColorDot({ color, label = false }: { color: string | null; label?: boolean }) {
  const hex = yarnColor(color);
  if (!color) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <span
        className="inline-block h-3 w-3 rounded-full border border-ink/20"
        style={{ background: hex ?? "transparent" }}
        title={color}
      />
      {label && color}
    </span>
  );
}
