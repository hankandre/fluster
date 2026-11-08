// The user's maximum streaming bitrate (decision 0002, "Streaming limit
// setting"). Shell-neutral: this module holds the types, validation, and an
// in-memory store. A shell that can persist supplies its own store. The
// values are non-secret preferences and are never stored with or derived from
// a token.
import type { HostClass } from "../domain/host-class";

// Megabits per second; undefined is "No limit".
export const STREAMING_LIMIT_CHOICES_MBPS = [120, 80, 40, 20, 10, 8, 4, 2] as const;

export interface StreamingLimits {
  // Applies to loopback and private-LAN servers.
  localMbps?: number;
  // Applies to public servers.
  remoteMbps?: number;
}

export interface StreamingLimitStore {
  get(): StreamingLimits;
  set(limits: StreamingLimits): void;
}

export const NO_STREAMING_LIMITS: StreamingLimits = Object.freeze({});

export function isLimitChoice(value: unknown): value is number {
  return typeof value === "number" && (STREAMING_LIMIT_CHOICES_MBPS as readonly number[]).includes(value);
}

// Keeps only values from the offered list, so a hand-edited or corrupt
// record can never send an odd bitrate.
export function sanitizeLimits(value: unknown): StreamingLimits {
  if (typeof value !== "object" || value === null) return {};
  const record = value as Record<string, unknown>;
  const limits: StreamingLimits = {};
  if (isLimitChoice(record.localMbps)) limits.localMbps = record.localMbps;
  if (isLimitChoice(record.remoteMbps)) limits.remoteMbps = record.remoteMbps;
  return limits;
}

// The limit for a server, or undefined for no limit.
export function limitMbpsFor(hostClass: HostClass, limits: StreamingLimits): number | undefined {
  return hostClass === "public" ? limits.remoteMbps : limits.localMbps;
}

export function mbpsToBitsPerSecond(mbps: number): number {
  return mbps * 1_000_000;
}

export class MemoryStreamingLimits implements StreamingLimitStore {
  private limits: StreamingLimits;

  constructor(initial: StreamingLimits = NO_STREAMING_LIMITS) {
    this.limits = sanitizeLimits(initial);
  }

  get(): StreamingLimits {
    return this.limits;
  }

  set(limits: StreamingLimits): void {
    this.limits = sanitizeLimits(limits);
  }
}
