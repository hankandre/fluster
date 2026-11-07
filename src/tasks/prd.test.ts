/// <reference types="node" />
// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface PrdTask {
  id: string;
  depends_on: string[];
  status: string;
  passes: boolean;
  evidence: string;
}

interface PrdPhase {
  id: string;
  tasks: PrdTask[];
}

interface Prd {
  status_values: string[];
  phases: PrdPhase[];
}

function allTasks(prd: Prd): PrdTask[] {
  return prd.phases.flatMap((phase) => phase.tasks);
}

function duplicateTaskIds(prd: Prd): string[] {
  const seen = new Set<string>();
  const problems: string[] = [];
  for (const task of allTasks(prd)) {
    if (seen.has(task.id)) {
      problems.push(`duplicate task id ${task.id}`);
    }
    seen.add(task.id);
  }
  return problems;
}

function duplicatePhaseIds(prd: Prd): string[] {
  const seen = new Set<string>();
  const problems: string[] = [];
  for (const phase of prd.phases) {
    if (seen.has(phase.id)) {
      problems.push(`duplicate phase id ${phase.id}`);
    }
    seen.add(phase.id);
  }
  return problems;
}

function unknownDependencies(prd: Prd): string[] {
  const ids = new Set(allTasks(prd).map((task) => task.id));
  const problems: string[] = [];
  for (const task of allTasks(prd)) {
    for (const dep of task.depends_on) {
      if (!ids.has(dep)) {
        problems.push(`${task.id} depends on unknown id ${dep}`);
      }
    }
  }
  return problems;
}

function invalidStatuses(prd: Prd): string[] {
  const problems: string[] = [];
  for (const task of allTasks(prd)) {
    if (!prd.status_values.includes(task.status)) {
      problems.push(`${task.id} has invalid status ${task.status}`);
    }
  }
  return problems;
}

function passesWithoutEvidence(prd: Prd): string[] {
  const problems: string[] = [];
  for (const task of allTasks(prd)) {
    if (task.passes === true && task.evidence.trim() === "") {
      problems.push(`${task.id} has passes=true without evidence`);
    }
  }
  return problems;
}

function statusAndPassesDisagree(prd: Prd): string[] {
  const problems: string[] = [];
  for (const task of allTasks(prd)) {
    if (task.status === "done" && task.passes !== true) {
      problems.push(`${task.id} is done but passes is not true`);
    }
    if (task.passes === true && task.status !== "done") {
      problems.push(`${task.id} has passes=true but status is ${task.status}`);
    }
  }
  return problems;
}

function findPrdProblems(prd: Prd): string[] {
  return [
    ...duplicateTaskIds(prd),
    ...duplicatePhaseIds(prd),
    ...unknownDependencies(prd),
    ...invalidStatuses(prd),
    ...passesWithoutEvidence(prd),
    ...statusAndPassesDisagree(prd),
  ];
}

const realPrd = JSON.parse(
  readFileSync(new URL("../../tasks/prd.json", import.meta.url), "utf8"),
) as Prd;

describe("tasks/prd.json", () => {
  it("has unique task ids across all phases", () => {
    expect(duplicateTaskIds(realPrd)).toEqual([]);
  });

  it("has unique phase ids", () => {
    expect(duplicatePhaseIds(realPrd)).toEqual([]);
  });

  it("only depends on task ids that exist", () => {
    expect(unknownDependencies(realPrd)).toEqual([]);
  });

  it("uses only the file's own status_values", () => {
    expect(invalidStatuses(realPrd)).toEqual([]);
  });

  it("has evidence for every task that passes", () => {
    expect(passesWithoutEvidence(realPrd)).toEqual([]);
  });

  it("keeps status done and passes=true in step", () => {
    expect(statusAndPassesDisagree(realPrd)).toEqual([]);
  });

  it("has no problems in any rule", () => {
    expect(findPrdProblems(realPrd)).toEqual([]);
  });
});

function makePrd(tasks: Partial<PrdTask>[], phaseIds: string[] = ["P0"]): Prd {
  const filled: PrdTask[] = tasks.map((task, index) => ({
    id: `P0-0${index + 1}`,
    depends_on: [],
    status: "todo",
    passes: false,
    evidence: "",
    ...task,
  }));
  return {
    status_values: ["todo", "in_progress", "blocked", "done"],
    phases: phaseIds.map((id) => ({ id, tasks: filled })),
  };
}

describe("findPrdProblems", () => {
  it("reports nothing for a valid file", () => {
    const prd = makePrd([
      { status: "done", passes: true, evidence: "pnpm check passed" },
      { depends_on: ["P0-01"] },
    ]);
    expect(findPrdProblems(prd)).toEqual([]);
  });

  it("reports a duplicate task id", () => {
    const prd = makePrd([{ id: "P0-01" }, { id: "P0-01" }]);
    expect(findPrdProblems(prd)).toContain("duplicate task id P0-01");
  });

  it("reports a duplicate phase id", () => {
    const prd = makePrd([{}], ["P0", "P0"]);
    expect(findPrdProblems(prd)).toContain("duplicate phase id P0");
  });

  it("reports an unknown depends_on id", () => {
    const prd = makePrd([{ depends_on: ["P9-99"] }]);
    expect(findPrdProblems(prd)).toContain("P0-01 depends on unknown id P9-99");
  });

  it("reports an invalid status value", () => {
    const prd = makePrd([{ status: "finished" }]);
    expect(findPrdProblems(prd)).toContain("P0-01 has invalid status finished");
  });

  it("reports passes=true without evidence", () => {
    const prd = makePrd([{ status: "done", passes: true, evidence: "" }]);
    expect(findPrdProblems(prd)).toContain("P0-01 has passes=true without evidence");
  });

  it("reports passes=true with whitespace-only evidence", () => {
    const prd = makePrd([{ status: "done", passes: true, evidence: "   " }]);
    expect(findPrdProblems(prd)).toContain("P0-01 has passes=true without evidence");
  });

  it("reports done without passes", () => {
    const prd = makePrd([{ status: "done", passes: false, evidence: "ran it" }]);
    expect(findPrdProblems(prd)).toContain("P0-01 is done but passes is not true");
  });

  it("reports passes without done", () => {
    const prd = makePrd([{ status: "todo", passes: true, evidence: "ran it" }]);
    expect(findPrdProblems(prd)).toContain("P0-01 has passes=true but status is todo");
  });
});
