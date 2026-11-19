import { ArrowLeft } from "lucide-react";
import { Button } from "./button";

// The round back-arrow icon button (DESIGN.md §8 Back). The player's top bar and every non-root page use it;
// the caller decides what Back does.
export function BackButton({ onBack }: { onBack(): void }) {
  return (
    <Button variant="icon" aria-label="Back" onClick={onBack}>
      <ArrowLeft size={21} aria-hidden="true" />
    </Button>
  );
}
