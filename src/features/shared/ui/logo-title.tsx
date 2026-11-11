import { useState } from "react";
import "./logo-title.css";

// The Logo when there is one and it loads, else the title as text. The caller puts it inside its heading.
export function LogoTitle({ title, logo }: { title: string; logo: { src: string } | undefined }) {
  const [failed, setFailed] = useState(false);
  if (logo && !failed) {
    return <img className="ui-logo-title" src={logo.src} alt={title} decoding="async" onError={() => setFailed(true)} />;
  }
  return <>{title}</>;
}
