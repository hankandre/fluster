import { Search, SearchX } from "lucide-react";
import { EmptyState } from "../shared/ui";

// The page before any search (DESIGN.md 10).
export function SearchStart() {
  return (
    <EmptyState icon={Search} title="Search your libraries">Movies, shows, and episodes.</EmptyState>
  );
}

export function SearchNoResults({ term }: { term: string }) {
  return (
    <EmptyState icon={SearchX} title={`No matches for "${term}"`}>Check the spelling, or try part of the title.</EmptyState>
  );
}
