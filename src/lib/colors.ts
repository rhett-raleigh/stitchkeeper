const COLORS: Record<string, string> = {
  red: "#c8312b", white: "#f4f1ea", ivory: "#f3ead3", cream: "#efe3c8", black: "#1f1d1b",
  blue: "#3b6fb6", navy: "#22345a", green: "#4f8a4b", yellow: "#f0c43a", orange: "#e57b2e",
  pink: "#e98aa8", purple: "#7a4fa0", brown: "#7a5236", grey: "#9a9894", gray: "#9a9894", beige: "#d9c6a5",
};

export function yarnColor(name: string | null): string | null {
  if (!name) return null;
  return COLORS[name.toLowerCase().split(/\s+/).pop() ?? ""] ?? null;
}
