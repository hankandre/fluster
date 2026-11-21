export interface ServerVersion {
  major: number;
  minor: number;
  patch: number;
}

export const MINIMUM_SERVER_VERSION: ServerVersion = { major: 10, minor: 11, patch: 0 };

// Accepts "12.4", "10.11.7", and "12.4.0-beta.1". A "-suffix" is allowed only after three numeric parts.
const TWO_PART_VERSION = /^(\d+)\.(\d+)$/;
const THREE_PART_VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/;

export function parseServerVersion(text: string): ServerVersion | undefined {
  const twoPart = TWO_PART_VERSION.exec(text);
  if (twoPart) {
    return { major: Number(twoPart[1]), minor: Number(twoPart[2]), patch: 0 };
  }
  const threePart = THREE_PART_VERSION.exec(text);
  if (threePart) {
    return { major: Number(threePart[1]), minor: Number(threePart[2]), patch: Number(threePart[3]) };
  }
  return undefined;
}

export function isSupportedServerVersion(version: ServerVersion): boolean {
  const minimum = MINIMUM_SERVER_VERSION;
  if (version.major !== minimum.major) {
    return version.major > minimum.major;
  }
  if (version.minor !== minimum.minor) {
    return version.minor > minimum.minor;
  }
  return version.patch >= minimum.patch;
}
