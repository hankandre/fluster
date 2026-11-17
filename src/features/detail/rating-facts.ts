import type { ItemDetail } from "../../domain/catalog";

// The rating parts of a facts line, in plain words: "7.8/10" then "91% critics". Each shows only when the
// server has it. No logo and no star glyph (DESIGN.md 7.9). Genres stay a separate trailing part of the line.
export function ratingFacts(item: Pick<ItemDetail, "communityRating" | "criticRating">): string[] {
  const parts: string[] = [];
  if (item.communityRating !== undefined) parts.push(`${item.communityRating.toFixed(1)}/10`);
  if (item.criticRating !== undefined) parts.push(`${Math.round(item.criticRating)}% critics`);
  return parts;
}
