import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Cpu,
  Film,
  LoaderCircle,
  LockKeyhole,
  MonitorPlay,
  Play,
  Server,
  Settings2,
} from "lucide-react";
import type { LibraryItem } from "../domain/catalog";
import type { PlaybackStartChoice, PlayerCapabilities } from "../domain/playback";
import { resumeChoice, startOverChoice, ticksToSeconds } from "../domain/playback";
import { PlayerView } from "../components/PlayerView";
import { redactText } from "../lib/redact";
import type { PocServices } from "./services";
import type { JellyfinGateway } from "../lib/jellyfin/gateway";
import { PlaybackCancelledError, PlaybackCoordinator } from "../lib/player/coordinator";
import { initialPlaybackSessionState, playbackSessionReducer } from "../lib/player/session-state";

type Connection = { gateway: JellyfinGateway; name: string; version: string };
type SignedInUser = { id: string; name: string };
type PlaybackAction =
  | { kind: "start"; item: LibraryItem; choice: PlaybackStartChoice }
  | { kind: "retry" };

function message(error: unknown): string {
  return redactText(error instanceof Error ? error.message : "Something went wrong.");
}

function formatRuntime(ticks?: number): string {
  const minutes = Math.round(ticksToSeconds(ticks) / 60);
  if (!minutes) return "Runtime unavailable";
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}

function itemEyebrow(item: LibraryItem): string {
  if (item.type === "Movie") return ["MOVIE", item.productionYear].filter(Boolean).join(" · ");
  const episode = item.season != null && item.episode != null
    ? `S${String(item.season).padStart(2, "0")} E${String(item.episode).padStart(2, "0")}`
    : "EPISODE";
  return [episode, item.productionYear].filter(Boolean).join(" · ");
}

export function PocApp({ services }: { services: PocServices }) {
  const queryClient = useQueryClient();
  const { native } = services;
  const player = useMemo(() => services.createPlayerEngine(), [services]);
  const coordinator = useRef<PlaybackCoordinator | undefined>(undefined);
  const [serverUrl, setServerUrl] = useState("");
  const [connection, setConnection] = useState<Connection>();
  const [signedInUser, setSignedInUser] = useState<SignedInUser>();
  const [loginPending, setLoginPending] = useState(false);
  const [loginError, setLoginError] = useState<string>();
  const [playbackPending, setPlaybackPending] = useState(false);
  const [activeItem, setActiveItem] = useState<LibraryItem>();
  const [pendingResumeItem, setPendingResumeItem] = useState<LibraryItem>();
  const [session, dispatchSession] = useReducer(playbackSessionReducer, initialPlaybackSessionState);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [capabilities, setCapabilities] = useState<PlayerCapabilities>();
  const [playerInitializationError, setPlayerInitializationError] = useState<string>();
  const closingWindow = useRef(false);

  useEffect(() => {
    void player.initialize().then(setCapabilities).catch((error: unknown) => {
      setPlayerInitializationError(message(error));
    });
  }, [player]);

  useEffect(() => {
    if (!native) return;
    let cancelled = false;
    let removeListener: (() => void) | undefined;
    void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
      const appWindow = getCurrentWindow();
      const unlisten = await appWindow.onCloseRequested(async (event) => {
        event.preventDefault();
        if (closingWindow.current) return;
        closingWindow.current = true;
        try {
          await coordinator.current?.stop();
          await coordinator.current?.flush();
        } finally {
          await appWindow.destroy();
        }
      });
      if (cancelled) unlisten();
      else removeListener = unlisten;
    });
    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, [native]);

  const connect = useMutation({
    mutationFn: async () => {
      const gateway = services.createGateway(serverUrl);
      const info = await gateway.connect();
      return { gateway, ...info };
    },
    onSuccess: (value) => {
      setConnection(value);
      setSignedInUser(undefined);
      setLoginError(undefined);
      coordinator.current = undefined;
    },
  });

  const login = async (username: string, password: string) => {
    if (!connection) return;
    setLoginPending(true);
    setLoginError(undefined);
    try {
      const user = await connection.gateway.login(username, password);
      setSignedInUser({ id: user.userId, name: user.username });
    } catch (error) {
      setLoginError(message(error));
    } finally {
      setLoginPending(false);
    }
  };

  const latest = useQuery({
    queryKey: ["latest", connection?.gateway.serverUrl, signedInUser?.id],
    queryFn: ({ signal }) => connection!.gateway.latest(signal),
    enabled: Boolean(connection && signedInUser),
  });

  const runPlayback = async (action: PlaybackAction) => {
    setPlaybackPending(true);
    try {
      if (!connection) throw new Error("Connect to Jellyfin first.");
      if (!coordinator.current) {
        coordinator.current = new PlaybackCoordinator(connection.gateway, player, {
          onEvent: (event) => dispatchSession({ type: "event", event }),
          onReportingError: (warning) => dispatchSession({
            type: "reporting-warning",
            message: redactText(warning),
          }),
          onSessionEnded: (reason) => {
            void queryClient.invalidateQueries({
              queryKey: ["latest", connection.gateway.serverUrl, signedInUser?.id],
            });
            if (reason !== "error") {
              setActiveItem(undefined);
              dispatchSession({ type: "reset" });
            }
          },
        });
      }
      switch (action.kind) {
        case "start":
          await coordinator.current.start(action.item, action.choice);
          break;
        case "retry":
          await coordinator.current.retry();
          break;
      }
    } catch (error) {
      if (!(error instanceof PlaybackCancelledError)) {
        dispatchSession({ type: "failure", message: message(error) });
      }
    } finally {
      setPlaybackPending(false);
    }
  };

  const closePlayer = async () => {
    try {
      if (coordinator.current) await coordinator.current.stop();
      setActiveItem(undefined);
      dispatchSession({ type: "reset" });
    } catch (error) {
      dispatchSession({ type: "failure", message: message(error) });
    }
  };

  const requestPlayback = (item: LibraryItem) => {
    const resume = resumeChoice(item);
    if (resume) {
      setPendingResumeItem(item);
      return;
    }
    beginPlayback(item, startOverChoice());
  };

  const beginPlayback = (item: LibraryItem, choice: PlaybackStartChoice) => {
    setPendingResumeItem(undefined);
    setActiveItem(item);
    dispatchSession({ type: "reset" });
    void runPlayback({ kind: "start", item, choice });
  };

  const retryPlayback = () => {
    if (!activeItem) return;
    dispatchSession({ type: "reset" });
    void runPlayback({ kind: "retry" });
  };

  const phase = !connection ? "connect" : !signedInUser ? "login" : "library";

  return (
    <main className={`app-shell ${activeItem ? "has-player" : ""}`}>
      <header className="topbar">
        <div className="brand" aria-label="Fluster home">
          <span className="brand-mark"><span /></span>
          <span>FLUSTER</span>
        </div>
        <div className="topbar-actions">
          {!native && <span className="mode-pill"><MonitorPlay size={14} /> Browser development mode</span>}
          {connection && <span className="server-pill"><span /> {connection.name} · {connection.version}</span>}
          {!activeItem && (
            <button className="icon-button" aria-label="Player information" onClick={() => setSettingsOpen(!settingsOpen)}>
              <Settings2 size={19} />
            </button>
          )}
        </div>
      </header>

      {settingsOpen && !activeItem && (
        <PlayerInformation
          capabilities={capabilities}
          error={playerInitializationError}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {activeItem ? (
        <PlayerView
          item={activeItem}
          player={player}
          session={session}
          retrying={playbackPending}
          onRetry={retryPlayback}
          onBack={closePlayer}
        />
      ) : (
        <section className={phase === "library" ? "content library-content" : "content auth-content"}>
          {phase === "connect" && (
            <section className="auth-card">
              <div className="step-icon"><Server size={26} /></div>
              <p className="kicker">STEP 01 / CONNECTION</p>
              <h1>Connect your<br /><em>Jellyfin library.</em></h1>
              <p className="lede">Fluster asks the server for original files only. Decoding stays on this machine.</p>
              <form onSubmit={(event) => { event.preventDefault(); connect.mutate(); }}>
                <label htmlFor="server-url">SERVER URL</label>
                <div className="field-row">
                  <input
                    id="server-url"
                    type="url"
                    placeholder="https://media.example.com"
                    value={serverUrl}
                    onChange={(event) => setServerUrl(event.target.value)}
                    required
                    autoFocus
                  />
                  <button type="submit" className="primary-button" disabled={connect.isPending}>
                    {connect.isPending ? <LoaderCircle className="spin" size={18} /> : <ArrowRight size={18} />}
                    Connect
                  </button>
                </div>
                {connect.error && <p className="form-error"><AlertTriangle size={15} /> {message(connect.error)}</p>}
              </form>
              <div className="trust-row"><LockKeyhole size={15} /> Credentials and access tokens remain in memory for this session.</div>
            </section>
          )}

          {phase === "login" && connection && (
            <LoginCard
              serverName={connection.name}
              pending={loginPending}
              error={loginError}
              onSubmit={login}
              onBack={() => {
                void connection.gateway.logout();
                setConnection(undefined);
                setSignedInUser(undefined);
                setLoginError(undefined);
              }}
            />
          )}

          {phase === "library" && (
            <>
              <div className="library-heading">
                <div>
                  <p className="kicker">YOUR LIBRARY / LATEST</p>
                  <h1>Ready to <em>play.</em></h1>
                  <p>Signed in as {signedInUser?.name}. Ten newest file-backed movies and episodes.</p>
                </div>
                <div className="policy-badge"><Check size={16} /> DIRECT PLAY ONLY</div>
              </div>

              {playerInitializationError && native && (
                <div className="notice warning"><AlertTriangle size={18} /> {playerInitializationError}</div>
              )}
              {latest.isPending && <div className="loading-block"><LoaderCircle className="spin" /> Loading the latest ten…</div>}
              {latest.error && <div className="notice warning"><AlertTriangle size={18} /> {message(latest.error)}</div>}
              {latest.data?.length === 0 && <div className="empty-state">No playable movies or episodes were returned.</div>}
              <div className="media-grid">
                {latest.data?.map((item, index) => (
                  <article className="media-card" key={item.id}>
                    <div className={`artwork artwork-${index % 5}`}>
                      <span className="card-number">{String(index + 1).padStart(2, "0")}</span>
                      <Film size={38} strokeWidth={1} />
                      <button
                        className="play-button"
                        aria-label={`Play ${item.name}`}
                        onClick={() => requestPlayback(item)}
                        disabled={Boolean(playerInitializationError && native)}
                      ><Play size={20} fill="currentColor" /></button>
                    </div>
                    <div className="media-copy">
                      <p>{itemEyebrow(item)}</p>
                      <h2>{item.name}</h2>
                      {item.seriesName && <h3>{item.seriesName}</h3>}
                      <span>{formatRuntime(item.runTimeTicks)}</span>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {pendingResumeItem && (
        <ResumeDialog
          item={pendingResumeItem}
          onResume={() => beginPlayback(pendingResumeItem, resumeChoice(pendingResumeItem)!)}
          onStartOver={() => beginPlayback(pendingResumeItem, startOverChoice())}
          onCancel={() => setPendingResumeItem(undefined)}
        />
      )}

      {!activeItem && (
        <footer className="app-footer">
          <span>FLUSTER / LINUX + macOS</span>
          <span>ORIGINAL BYTES · LOCAL DECODE · NO SERVER FFMPEG</span>
        </footer>
      )}
    </main>
  );
}

function ResumeDialog({ item, onResume, onStartOver, onCancel }: {
  item: LibraryItem;
  onResume(): void;
  onStartOver(): void;
  onCancel(): void;
}) {
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onCancel();
    }}>
      <section className="resume-dialog" role="dialog" aria-modal="true" aria-labelledby="resume-title">
        <p className="kicker">CONTINUE WATCHING</p>
        <h2 id="resume-title">Resume {item.name}?</h2>
        <p>Your Jellyfin progress is saved at {formatResumeTime(item.resumePositionTicks)}.</p>
        <div className="resume-actions">
          <button className="text-button" onClick={onCancel}>Cancel</button>
          <button className="text-button" onClick={onStartOver}>Start Over</button>
          <button className="primary-button" autoFocus onClick={onResume}><Play size={17} fill="currentColor" /> Resume at {formatResumeTime(item.resumePositionTicks)}</button>
        </div>
      </section>
    </div>
  );
}

function formatResumeTime(ticks: number): string {
  const totalSeconds = Math.floor(ticksToSeconds(ticks));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function LoginCard({ serverName, pending, error, onSubmit, onBack }: {
  serverName: string;
  pending: boolean;
  error?: string;
  onSubmit(username: string, password: string): Promise<void> | void;
  onBack(): void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  return (
    <section className="auth-card">
      <div className="step-icon"><LockKeyhole size={26} /></div>
      <p className="kicker">STEP 02 / SIGN IN</p>
      <h1>Welcome to<br /><em>{serverName}.</em></h1>
      <p className="lede">Use your Jellyfin username and password. The resulting token is never persisted.</p>
      <form onSubmit={(event) => {
        event.preventDefault();
        const submittedPassword = password;
        setPassword("");
        void onSubmit(username, submittedPassword);
      }} className="login-form">
        <label htmlFor="username">USERNAME</label>
        <input id="username" value={username} onChange={(event) => setUsername(event.target.value)} required autoFocus />
        <label htmlFor="password">PASSWORD</label>
        <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        {error && <p className="form-error"><AlertTriangle size={15} /> {error}</p>}
        <div className="form-actions">
          <button type="button" className="text-button" onClick={onBack}>Change server</button>
          <button type="submit" className="primary-button" disabled={pending}>
            {pending ? <LoaderCircle className="spin" size={18} /> : <ArrowRight size={18} />} Sign in
          </button>
        </div>
      </form>
    </section>
  );
}

function PlayerInformation({ capabilities, error, onClose }: {
  capabilities?: PlayerCapabilities;
  error?: string;
  onClose(): void;
}) {
  return (
    <aside className="settings-panel" aria-label="Player information">
      <div className="settings-heading"><div><p className="kicker">NATIVE MEDIA</p><h2>Player engine</h2></div><button onClick={onClose}>Done</button></div>
      {error ? (
        <p className="form-error"><AlertTriangle size={15} /> {error}</p>
      ) : (
        <div className="automatic-gpu">
          <Cpu size={18} />
          <div>
            <strong>{capabilities?.renderer ?? "Initializing libmpv"}</strong>
            <span>
              {capabilities?.libmpvVersion ? `libmpv ${capabilities.libmpvVersion} · ` : ""}
              {capabilities?.nativeRenderer ?? "native renderer pending"}. Hardware decoding is automatic.
            </span>
          </div>
        </div>
      )}
      <p className="settings-note">There is no GPU or executable selector. Release builds carry the pinned media runtime.</p>
    </aside>
  );
}
