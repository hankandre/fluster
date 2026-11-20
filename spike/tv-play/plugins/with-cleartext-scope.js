// Cleartext HTTP is allowed only for loopback (the recording proxy, reached through `adb reverse`)
// and, when OCTAVE_CLEARTEXT_HOST is set at prebuild time, that one extra host. The extra host is
// never committed: it lives only in the generated android/ folder (gitignored) and the APK in dist/.
const fs = require("fs");
const path = require("path");
const { withAndroidManifest, withDangerousMod } = require("expo/config-plugins");

function domains() {
  const list = ["127.0.0.1", "localhost"];
  const extra = (process.env.OCTAVE_CLEARTEXT_HOST || "").trim();
  if (extra) {
    if (!/^[A-Za-z0-9.-]+$/.test(extra)) throw new Error("OCTAVE_CLEARTEXT_HOST must be a bare host name or address");
    list.push(extra);
  }
  return list;
}

module.exports = function withCleartextScope(config) {
  config = withDangerousMod(config, [
    "android",
    async (c) => {
      const dir = path.join(c.modRequest.platformProjectRoot, "app/src/main/res/xml");
      fs.mkdirSync(dir, { recursive: true });
      const entries = domains().map((d) => `    <domain includeSubdomains="false">${d}</domain>`).join("\n");
      fs.writeFileSync(
        path.join(dir, "network_security_config.xml"),
        `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false" />
  <domain-config cleartextTrafficPermitted="true">
${entries}
  </domain-config>
</network-security-config>
`,
      );
      return c;
    },
  ]);
  return withAndroidManifest(config, (c) => {
    const app = c.modResults.manifest.application[0];
    app.$["android:networkSecurityConfig"] = "@xml/network_security_config";
    delete app.$["android:usesCleartextTraffic"];
    return c;
  });
};
