import { useState } from "react";
import { useSession, type SessionGateway } from "../../app/session";
import type { ServerDiscovery } from "../../domain/server-discovery";
import { PasswordStep } from "./password-step";
import { QuickConnectStep } from "./quick-connect-step";
import { ServerStep } from "./server-step";
import type { Stage } from "./sign-in-stage";
import { useServerDiscovery } from "./use-server-discovery";

export { QUICK_CONNECT_POLL_MS } from "./quick-connect-step";

const HOME_ROUTE = "#/next/home";

// `discovery` is present only in the desktop shell. The search lives here so
// its result survives moving between steps.
export function SignInView({ discovery }: { discovery?: ServerDiscovery } = {}) {
  const session = useSession();
  const search = useServerDiscovery(discovery);
  const [stage, setStage] = useState<Stage>({ name: "server" });

  function finishSignIn(gateway: SessionGateway) {
    session.signIn(gateway);
    window.location.hash = HOME_ROUTE;
  }

  switch (stage.name) {
    case "server":
      return <ServerStep search={search} onConnected={setStage} />;
    case "quick-connect":
      return (
        <QuickConnectStep
          gateway={stage.gateway}
          onSignedIn={() => finishSignIn(stage.gateway)}
          onCancel={() => setStage({ name: "server" })}
          onUsePassword={() => setStage({ name: "password", gateway: stage.gateway })}
        />
      );
    case "password":
      return (
        <PasswordStep
          gateway={stage.gateway}
          onSignedIn={() => finishSignIn(stage.gateway)}
          onBack={() => setStage({ name: "server" })}
        />
      );
  }
}
