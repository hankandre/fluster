import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { fakeSessionGateway } from "../../test/fake-session-gateway";
import { UNKNOWN_SERVER_NAME } from "./error-copy";
import { useServerName } from "./use-server-name";

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

describe("useServerName", () => {
  it("falls back to your server while the name is unknown or the probe fails", async () => {
    expect(UNKNOWN_SERVER_NAME).toBe("your server");
    const connect = vi.fn().mockRejectedValue(new Error("down"));
    const { result } = renderHook(() => useServerName(fakeSessionGateway({ connect }), true), { wrapper });
    expect(result.current).toBe("your server");
    await waitFor(() => expect(connect).toHaveBeenCalled());
    expect(result.current).toBe("your server");
  });

  it("uses the server's name once known", async () => {
    const connect = vi.fn().mockResolvedValue({ name: "Hearth" });
    const { result } = renderHook(() => useServerName(fakeSessionGateway({ connect }), true), { wrapper });
    await waitFor(() => expect(result.current).toBe("Hearth"));
  });
});
