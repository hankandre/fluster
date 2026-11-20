import { requireNativeModule, requireNativeViewManager } from "expo-modules-core";
import type { ComponentType } from "react";
import type { ViewProps } from "react-native";

export interface LaunchConfig {
  server?: string;
  user?: string;
  pass?: string;
  title?: string;
  year?: string;
  canary?: string;
}

export interface NativeProbeResult {
  redirectSameStatus: number;
  redirectCanaryStatus: number;
  offOriginStatus: number;
  offOriginRefused: boolean;
  apiKeyUrlRefused: boolean;
}

interface OctavePlayerNative {
  takeLaunchConfig(): LaunchConfig;
  startSession(origin: string, authorization: string): void;
  runNativeProbes(origin: string, canaryOrigin: string): Promise<NativeProbeResult>;
}

export const OctavePlayer = requireNativeModule<OctavePlayerNative>("OctavePlayer");

export interface PlayerStatusEvent {
  event: string;
  tMs: number;
  [key: string]: unknown;
}

export interface OctavePlayerViewProps extends ViewProps {
  // Tokenless stream URL; the header is added natively by the shared OkHttp client.
  url: string;
  onStatus?: (event: { nativeEvent: PlayerStatusEvent }) => void;
}

export const OctavePlayerView: ComponentType<OctavePlayerViewProps> = requireNativeViewManager("OctavePlayer");
