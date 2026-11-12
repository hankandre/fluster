import { Skeleton } from "../shared/ui";

// "482913" is drawn "482 913". An even length splits in half, an odd length
// in threes with the remainder last, and three or fewer stay together.
export function groupCode(code: string): string[] {
  if (code.length === 0) return [];
  if (code.length <= 3) return [code];
  if (code.length % 2 === 0) {
    const half = code.length / 2;
    return [code.slice(0, half), code.slice(half)];
  }
  const groups: string[] = [];
  for (let start = 0; start < code.length; start += 3) groups.push(code.slice(start, start + 3));
  return groups;
}

// The groups sit in spans with no text between them, so the text content stays the bare code.
export function QuickConnectCode({ code }: { code: string }) {
  const groups = groupCode(code);
  return (
    <div
      className="sign-in-code"
      role="group"
      aria-label="Quick Connect code"
      aria-busy={code === "" ? true : undefined}
      data-testid="quick-connect-code"
    >
      {groups.length === 0 ? (
        <Skeleton shape="line" width="8ch" height="1em" />
      ) : (
        groups.map((group, index) => <span className="sign-in-code-group" key={index}>{group}</span>)
      )}
    </div>
  );
}
