export type TvPlatform = "browser" | "android-tv" | "tizen";
export type ExitRule = "leave" | "confirm";

export const LEAVE_APP_EVENT = "fluster:leave-app";

// How Back on Home leaves the app (DESIGN.md 6, D14 B): Android TV and the browser TV form leave without a
// question; Tizen asks first.
export function exitRule(platform: TvPlatform): ExitRule {
  switch (platform) {
    case "android-tv":
      return "leave";
    case "browser":
      return "leave";
    case "tizen":
      return "confirm";
  }
}

// The TV shell sets <html data-tv-platform>. Read at call time, never cached; anything else is the browser.
export function currentTvPlatform(): TvPlatform {
  const value = document.documentElement.dataset.tvPlatform;
  switch (value) {
    case "android-tv":
    case "tizen":
      return value;
    default:
      return "browser";
  }
}

// A browser cannot close a tab it did not open, so the event is the whole effect here; the TV shell listens
// for it and finishes the activity.
export function leaveApp(): void {
  window.dispatchEvent(new Event(LEAVE_APP_EVENT));
}
