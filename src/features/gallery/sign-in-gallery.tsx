import type { DiscoveredServer } from "../../domain/server-discovery";
import { ServerList } from "../sign-in/server-discovery";
import type { ServerSearch } from "../sign-in/use-server-discovery";
import "../sign-in/sign-in.css";

const SERVERS: DiscoveredServer[] = [
  { name: "Living Room", id: "a", address: "http://192.168.1.5:8096", advertisedBy: "192.168.1.5", addressIsSender: true, conflicting: false },
  { name: "Study", id: "b", address: "https://media.example.test", advertisedBy: "192.168.1.8", addressIsSender: false, conflicting: false },
  { name: "Garage", id: "c", address: "http://192.168.1.9:8096", advertisedBy: "192.168.1.9", addressIsSender: true, conflicting: true },
  { name: "Garage", id: "c", address: "http://192.168.1.66:8096", advertisedBy: "192.168.1.66", addressIsSender: true, conflicting: true },
];

const noop = () => undefined;

function search(state: ServerSearch["state"]): ServerSearch {
  return { state, searchAgain: noop };
}

// Browser mode has no network discovery, so each state of the server list is drawn here.
export function SignInGallery() {
  return (
    <>
      <section className="gallery-section" aria-label="Sign-in discovery found">
        <h2>Sign-in discovery: servers found</h2>
        <div className="sign-in-card">
          <ServerList
            search={search({ name: "found", result: { servers: SERVERS, refused: 1, dropped: 2 } })}
            busy={false}
            onChoose={noop}
          />
        </div>
      </section>
      <section className="gallery-section" aria-label="Sign-in discovery states">
        <h2>Sign-in discovery: searching, no reply, failed</h2>
        <div className="gallery-row">
          <div className="sign-in-card">
            <ServerList search={search({ name: "searching" })} busy={false} onChoose={noop} />
          </div>
          <div className="sign-in-card">
            <ServerList search={search({ name: "found", result: { servers: [], refused: 0, dropped: 0 } })} busy={false} onChoose={noop} />
          </div>
          <div className="sign-in-card">
            <ServerList search={search({ name: "failed" })} busy={false} onChoose={noop} />
          </div>
        </div>
      </section>
    </>
  );
}
