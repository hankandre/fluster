// Host classes for plain-HTTP decisions (docs/decisions/0001).
// The classifier reads only the literal host of a parsed URL, never a DNS
// answer. src-tauri/src/url_policy.rs implements the same rules, and both are
// tested against tests/fixtures/host-classes.json.

export type HostClass = "loopback" | "private-lan" | "public";

const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const IPV6_GROUP_PATTERN = /^[0-9a-f]{1,4}$/;

// `url` must come from the WHATWG URL parser, which has already turned
// numeric, hex, and octal IPv4 forms into dotted decimal, lowercased names,
// and compressed IPv6 addresses.
export function classifyHost(url: URL): HostClass {
  const host = url.hostname;
  if (host.startsWith("[") && host.endsWith("]")) {
    const groups = parseIpv6(host.slice(1, -1));
    return groups ? classifyIpv6(groups) : "public";
  }
  const ipv4 = parseIpv4(host);
  if (ipv4) return classifyIpv4(ipv4);
  return classifyDomain(host);
}

function parseIpv4(host: string): number[] | undefined {
  const match = IPV4_PATTERN.exec(host);
  if (!match) return undefined;
  const octets = match.slice(1).map(Number);
  return octets.every((octet) => octet <= 255) ? octets : undefined;
}

function classifyIpv4([a, b]: number[]): HostClass {
  if (a === 127) return "loopback";
  if (a === 10) return "private-lan";
  if (a === 172 && b >= 16 && b <= 31) return "private-lan";
  if (a === 192 && b === 168) return "private-lan";
  if (a === 169 && b === 254) return "private-lan";
  return "public";
}

function parseIpv6Part(part: string): number[] | undefined {
  if (part === "") return [];
  const groups = part.split(":");
  if (!groups.every((group) => IPV6_GROUP_PATTERN.test(group))) return undefined;
  return groups.map((group) => parseInt(group, 16));
}

// Expands a WHATWG-serialized IPv6 address into eight 16-bit groups.
function parseIpv6(text: string): number[] | undefined {
  const halves = text.split("::");
  if (halves.length > 2) return undefined;
  const front = parseIpv6Part(halves[0]);
  if (!front) return undefined;
  if (halves.length === 1) return front.length === 8 ? front : undefined;
  const back = parseIpv6Part(halves[1]);
  if (!back) return undefined;
  const missing = 8 - front.length - back.length;
  if (missing < 1) return undefined;
  return [...front, ...new Array<number>(missing).fill(0), ...back];
}

function classifyIpv6(groups: number[]): HostClass {
  const firstFiveAreZero = groups.slice(0, 5).every((group) => group === 0);
  if (firstFiveAreZero && groups[5] === 0 && groups[6] === 0 && groups[7] === 1) return "loopback";
  // IPv4-mapped (::ffff:0:0/96) takes the class of the embedded address.
  if (firstFiveAreZero && groups[5] === 0xffff) {
    return classifyIpv4([groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff]);
  }
  if ((groups[0] & 0xfe00) === 0xfc00) return "private-lan";
  if ((groups[0] & 0xffc0) === 0xfe80) return "private-lan";
  return "public";
}

function classifyDomain(host: string): HostClass {
  if (host === "localhost") return "loopback";
  const name = host.endsWith(".") ? host.slice(0, -1) : host;
  const labels = name.split(".");
  if (labels.some((label) => label === "")) return "public";
  const count = labels.length;
  if (count >= 2 && labels[count - 1] === "local") return "private-lan";
  if (count >= 3 && labels[count - 2] === "home" && labels[count - 1] === "arpa") return "private-lan";
  return "public";
}
