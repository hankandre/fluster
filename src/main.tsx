import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { App } from "./app/App";
import { createQueryClient } from "./app/query-client";
import { applyFormFlag } from "./features/shared/tv-form";
import "./styles.css";

const queryClient = createQueryClient();

// Browser development only: Vite drops this branch from a build.
if (import.meta.env.DEV) applyFormFlag(window.location.search, document.documentElement);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
