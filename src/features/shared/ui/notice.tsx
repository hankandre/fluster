import type { ReactNode, Ref } from "react";
import "./feedback.css";

interface NoticeProps {
  title: string;
  // The item the notice is about, in small text above the title.
  context?: string;
  // The explanation.
  children?: ReactNode;
  whatYouCanDo?: ReactNode;
  actions: ReactNode;
  headingRef?: Ref<HTMLHeadingElement>;
  headingLevel?: 1 | 2;
}

// A full-screen message with a title, an explanation, and actions (DESIGN.md 7.16). Left-aligned in five columns
// and centred vertically below the nav. It brings no art of its own.
export function Notice({ title, context, children, whatYouCanDo, actions, headingRef, headingLevel = 1 }: NoticeProps) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  return (
    <div className="ui-notice">
      <div className="ui-notice-text">
        {context ? <p className="ui-notice-context">{context}</p> : null}
        <Heading ref={headingRef} tabIndex={-1} className="ui-notice-title">{title}</Heading>
        {children ? <p className="ui-notice-body">{children}</p> : null}
        {whatYouCanDo ? <div className="ui-notice-help">{whatYouCanDo}</div> : null}
        <div className="ui-notice-actions">{actions}</div>
      </div>
    </div>
  );
}
