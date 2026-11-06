// Pure module -- no server imports, no React.

export interface AuthorColor {
  bg: string;
  border: string;
  text: string;
}

const PALETTE: AuthorColor[] = [
  { bg: "#dbeafe", border: "#93c5fd", text: "#1d4ed8" },
  { bg: "#dcfce7", border: "#86efac", text: "#15803d" },
  { bg: "#fce7f3", border: "#f9a8d4", text: "#be185d" },
  { bg: "#fef3c7", border: "#fde68a", text: "#b45309" },
  { bg: "#ede9fe", border: "#c4b5fd", text: "#6d28d9" },
  { bg: "#ffedd5", border: "#fdba74", text: "#c2410c" },
  { bg: "#cffafe", border: "#67e8f9", text: "#0e7490" },
  { bg: "#fdf4ff", border: "#e879f9", text: "#86198f" },
];

/** Build a stable userId -> color mapping based on order of first appearance. */
export function buildAuthorColors(
  userIds: string[],
): Record<string, AuthorColor> {
  const seen: string[] = [];
  for (const id of userIds) {
    if (!seen.includes(id)) seen.push(id);
  }
  const map: Record<string, AuthorColor> = {};
  for (let i = 0; i < seen.length; i++) {
    map[seen[i]] = PALETTE[i % PALETTE.length];
  }
  return map;
}
