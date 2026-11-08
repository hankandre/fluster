import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import "./feedback.css";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  // One plain sentence.
  children?: ReactNode;
  // At most one action.
  action?: ReactNode;
  // The heading level that fits the page outline.
  headingLevel?: 2 | 3;
}

export function EmptyState({ icon: Icon, title, children, action, headingLevel = 2 }: EmptyStateProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className="ui-empty">
      <Icon className="ui-empty-icon" aria-hidden="true" size={48} strokeWidth={1.5} />
      <Heading className="ui-empty-title">{title}</Heading>
      {children ? <p className="ui-empty-body">{children}</p> : null}
      {action}
    </div>
  );
}
