import { useEffect, useRef } from "react";
import { HOME_ROUTE } from "./routes";

export function NotFoundView() {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <main>
      <h1 ref={heading} tabIndex={-1}>Not found</h1>
      <p>There is nothing at this address.</p>
      <a href={HOME_ROUTE}>Go to Home</a>
    </main>
  );
}
