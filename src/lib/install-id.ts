// Browser-storage adapter for the install id used to derive Jellyfin DeviceIds.
// The id is a random UUID, not a secret. Access tokens are never stored here.

export const INSTALL_ID_STORAGE_KEY = "fluster.installId";

let memoryInstallId: string | undefined;

export function getInstallId(): string {
  try {
    const stored = window.localStorage.getItem(INSTALL_ID_STORAGE_KEY);
    if (stored) return stored;
    const created = crypto.randomUUID();
    window.localStorage.setItem(INSTALL_ID_STORAGE_KEY, created);
    return created;
  } catch {
    // Storage can be blocked or unavailable. Keep one id for this launch.
    memoryInstallId ??= crypto.randomUUID();
    return memoryInstallId;
  }
}
