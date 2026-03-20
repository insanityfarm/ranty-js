import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildReviewPacket,
  buildTaskPacket,
  checkArchitecture,
  checkContextState,
  checkTerminology,
  generateGlossaryReadme,
  loadContextData,
  writeActiveTask,
  writeContextArtifacts,
} from "../context-system/shared.mjs";

const tempRoots = [];
const AUTHORITATIVE_DISCIPLINED = ["canonical", "doc", "file"].join(" ");

afterEach(async () => {
  const roots = tempRoots.splice(0, tempRoots.length);
  await Promise.all(
    roots.map(async (tempRoot) =>
      fs.rm(tempRoot, { force: true, recursive: true }),
    ),
  );
});

async function writeFile(repoRoot, relativePath, contents) {
  const absolutePath = path.join(repoRoot, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, contents, "utf8");
}

async function appendFile(repoRoot, relativePath, contents) {
  const absolutePath = path.join(repoRoot, relativePath);
  await fs.appendFile(absolutePath, contents, "utf8");
}

async function replaceInFile(
  repoRoot,
  relativePath,
  searchValue,
  replaceValue,
) {
  const absolutePath = path.join(repoRoot, relativePath);
  const contents = await fs.readFile(absolutePath, "utf8");
  await fs.writeFile(
    absolutePath,
    contents.replace(searchValue, replaceValue),
    "utf8",
  );
}

function runGit(repoRoot, args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

async function createFixtureRepo() {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "anti-drift-"));
  tempRoots.push(repoRoot);

  await Promise.all([
    writeFile(
      repoRoot,
      "README.md",
      "# Fixture repo\n\nThis repo exercises the anti-drift context system.\n",
    ),
    writeFile(repoRoot, "AGENTS.md", "# Fixture agents\n"),
    writeFile(repoRoot, ".gitignore", ".agent-context\nnode_modules\n"),
    writeFile(repoRoot, ".nvmrc", "22\n"),
    writeFile(
      repoRoot,
      "package.json",
      '{ "name": "fixture", "type": "module" }\n',
    ),
    writeFile(
      repoRoot,
      "tsconfig.json",
      '{ "compilerOptions": { "strict": true } }\n',
    ),
    writeFile(
      repoRoot,
      "tsconfig.build.json",
      '{ "extends": "./tsconfig.json" }\n',
    ),
    writeFile(repoRoot, "vitest.config.ts", "export default {};\n"),
    writeFile(repoRoot, "eslint.config.mjs", "export default [];\n"),
    writeFile(repoRoot, "docs/README.md", "# Fixture docs\n"),
    writeFile(
      repoRoot,
      "docs/context-system/README.md",
      "# Fixture context docs\n",
    ),
    writeFile(
      repoRoot,
      "glossary/terms.yaml",
      `version: 1
terms:
  - id: authoritative-artifact
    canonical: authoritative artifact
    definition: Checked-in file that defines current behavior.
    kind: governance
    discouraged:
      - ${AUTHORITATIVE_DISCIPLINED}
    applies_to:
      - docs/context-system/README.md
      - src/index.ts
    related_terms: []
examples:
  - term: authoritative-artifact
    examples:
      - spec/README.md
usage_rules:
  - Use authoritative artifact for current checked-in workflow or contract files.
cross_references:
  - ../spec/README.md
`,
    ),
    writeFile(repoRoot, "spec/README.md", "# Fixture spec\n"),
    writeFile(
      repoRoot,
      "spec/subsystems/index.yaml",
      `version: 1
status_vocabulary:
  locked: Locked subsystem.
  stable: Stable subsystem.
  evolving: Evolving subsystem.
source_roots:
  - README.md
  - AGENTS.md
  - .gitignore
  - .nvmrc
  - package.json
  - spec
  - docs
  - glossary
  - scripts
  - src
generated_roots:
  - spec/generated
allowed_local_outputs:
  - .agent-context
exempt_paths: []
architecture_rules:
  - id: arch-001
    from:
      - src/internal/**
    forbidden:
      - src/index.ts
      - src/public/**
    allowed: []
    message: Internal code should not depend on the public surface.
task_state_path: .agent-context/active-task.json
task_markdown_path: .agent-context/active-task.md
review_packet_path: .agent-context/drift-review.md
`,
    ),
    writeFile(
      repoRoot,
      "spec/subsystems/repo-governance-context-system.yaml",
      `id: repo-governance-context-system
title: Repo governance
status: stable
summary: Owns governance docs and generated context artifacts.
owned_paths:
  - README.md
  - AGENTS.md
  - .gitignore
  - .nvmrc
  - docs/**
  - glossary/**
  - scripts/**
  - spec/README.md
  - spec/decisions/**
  - spec/generated/**
  - spec/subsystems/index.yaml
  - spec/subsystems/repo-governance-context-system.yaml
related_paths: []
entrypoints:
  - path: spec/README.md
    symbols:
      - README
depends_on:
  - public-api-and-build-contract
  - library-core
used_by: []
required_reads:
  spec:
    - spec/README.md
  docs: []
  decisions:
    - spec/decisions/ADR-0001-test.md
glossary_terms:
  - authoritative artifact
public_contracts:
  - name: governance
    summary: Keeps authoritative context aligned.
invariants:
  - id: gov-001
    statement: Structured context artifacts are authoritative for architecture memory.
performance_constraints:
  - Context retrieval stays bounded.
change_policy:
  default: additive-only
  requires_adr:
    - changing the governance workflow
tests:
  - scripts/__tests__/contextSystem.test.js
decision_refs:
  - ADR-0001
history_anchors:
  introduced_by: fixture
  major_refactors: []
`,
    ),
    writeFile(
      repoRoot,
      "spec/subsystems/public-api-and-build-contract.yaml",
      `id: public-api-and-build-contract
title: Public API
status: locked
summary: Owns public exports and package-facing config.
owned_paths:
  - package.json
  - src/index.ts
  - src/public/**
  - spec/subsystems/public-api-and-build-contract.yaml
related_paths: []
entrypoints:
  - path: src/index.ts
    symbols:
      - createThing
depends_on:
  - library-core
used_by:
  - repo-governance-context-system
required_reads:
  spec:
    - spec/README.md
  docs: []
  decisions:
    - spec/decisions/ADR-0001-test.md
glossary_terms:
  - authoritative artifact
public_contracts:
  - name: createThing
    summary: Public entrypoint.
invariants:
  - id: api-001
    statement: Consumers import through the public barrel.
performance_constraints:
  - Public API changes stay intentional.
change_policy:
  default: additive-only
  requires_adr:
    - changing the export contract
tests: []
decision_refs:
  - ADR-0001
history_anchors:
  introduced_by: fixture
  major_refactors: []
`,
    ),
    writeFile(
      repoRoot,
      "spec/subsystems/library-core.yaml",
      `id: library-core
title: Library core
status: evolving
summary: Owns internal implementation.
owned_paths:
  - src/internal/**
  - src/__tests__/**
  - spec/subsystems/library-core.yaml
related_paths:
  - src/public/**
entrypoints:
  - path: src/internal/helper.ts
    symbols:
      - helper
depends_on: []
used_by:
  - public-api-and-build-contract
required_reads:
  spec:
    - spec/README.md
  docs: []
  decisions: []
glossary_terms: []
public_contracts:
  - name: helper
    summary: Internal helper.
invariants:
  - id: core-001
    statement: Internal helpers stay replaceable.
performance_constraints:
  - Internal helpers stay small.
change_policy:
  default: additive-only
  requires_adr: []
tests: []
decision_refs: []
history_anchors:
  introduced_by: fixture
  major_refactors: []
`,
    ),
    writeFile(
      repoRoot,
      "spec/subsystems/ops-tooling.yaml",
      `id: ops-tooling
title: Ops tooling
status: stable
summary: Owns unrelated reporting helpers.
owned_paths:
  - src/ops/**
  - spec/subsystems/ops-tooling.yaml
related_paths: []
entrypoints:
  - path: src/ops/report.ts
    symbols:
      - summarizeReport
depends_on: []
used_by: []
required_reads:
  spec:
    - spec/README.md
  docs: []
  decisions:
    - spec/decisions/ADR-0001-test.md
glossary_terms: []
public_contracts:
  - name: summarizeReport
    summary: Produces an unrelated report.
invariants:
  - id: ops-001
    statement: Ops tooling stays outside unrelated feature work unless explicitly targeted.
performance_constraints:
  - Reports stay isolated from unrelated feature concerns.
change_policy:
  default: additive-only
  requires_adr: []
tests: []
decision_refs:
  - ADR-0001
history_anchors:
  introduced_by: fixture
  major_refactors: []
`,
    ),
    writeFile(
      repoRoot,
      "spec/decisions/ADR-0001-test.md",
      `---
id: ADR-0001
status: accepted
date: 2026-03-19
subsystems:
  - public-api-and-build-contract
supersedes: []
tags:
  - fixture
---

# ADR-0001 Test decision

## Context

The fixture repo models a locked public seam.

## Decision

Keep the public contract explicit.

## Consequences

Public changes require visible record updates.

## Validation

The context-system tests cover the seam.
`,
    ),
    writeFile(
      repoRoot,
      "src/index.ts",
      `export { createThing } from './public/createThing.js';\n`,
    ),
    writeFile(
      repoRoot,
      "src/public/createThing.ts",
      `import { helper } from '../internal/helper.js';\n\nexport function createThing() {\n  return helper();\n}\n`,
    ),
    writeFile(
      repoRoot,
      "src/internal/helper.ts",
      `export function helper() {\n  return 'thing';\n}\n`,
    ),
    writeFile(
      repoRoot,
      "src/__tests__/sample.test.ts",
      `import { createThing } from '../index.js';\n\nexport const sample = createThing;\n`,
    ),
    writeFile(
      repoRoot,
      "scripts/context-system/check.mjs",
      `export const marker = true;\n`,
    ),
    writeFile(
      repoRoot,
      "src/ops/report.ts",
      `export function summarizeReport() {\n  return 'report';\n}\n`,
    ),
  ]);

  writeContextArtifacts(loadContextData(repoRoot));

  runGit(repoRoot, ["init"]);
  runGit(repoRoot, ["add", "-A"]);
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.com",
      "commit",
      "-m",
      "Initial fixture",
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );

  return repoRoot;
}

describe("context system tooling", () => {
  it("builds generated glossary output and deterministic task packets", async () => {
    const repoRoot = await createFixtureRepo();
    const contextData = loadContextData(repoRoot);

    const glossaryReadme = generateGlossaryReadme(contextData.glossary);
    const taskPacket = buildTaskPacket(contextData, {
      allowLocked: ["public-api-and-build-contract"],
      task: "public-api-and-build-contract authoritative artifact",
    });
    const primaryMatch = taskPacket.matchedSubsystems[0];

    expect(glossaryReadme).toContain("authoritative artifact");
    expect(primaryMatch.id).toBe("public-api-and-build-contract");
    expect(taskPacket.lockedSubsystems).toContain(
      "public-api-and-build-contract",
    );
    expect(taskPacket.allowLocked).toContain("public-api-and-build-contract");
    expect(taskPacket.requiredSubsystemRecords).toContain(
      "spec/subsystems/public-api-and-build-contract.yaml",
    );
  });

  it("skips generated glossary output during terminology checks and flags discouraged prose elsewhere", async () => {
    const repoRoot = await createFixtureRepo();

    expect(() => checkTerminology(loadContextData(repoRoot))).not.toThrow();

    await writeFile(
      repoRoot,
      "docs/context-system/README.md",
      `# Fixture context docs\n\nThis note falls back to ${AUTHORITATIVE_DISCIPLINED}.\n`,
    );

    expect(() => checkTerminology(loadContextData(repoRoot))).toThrow(
      /authoritative artifact/,
    );
  });

  it("enforces architecture rules", async () => {
    const repoRoot = await createFixtureRepo();

    expect(() => checkArchitecture(loadContextData(repoRoot))).not.toThrow();

    await writeFile(
      repoRoot,
      "src/internal/badImport.ts",
      `import { createThing } from '../public/createThing.js';\n\nexport function readBadImport() {\n  return createThing();\n}\n`,
    );

    expect(() => checkArchitecture(loadContextData(repoRoot))).toThrow(
      /arch-001/,
    );
  });

  it("fails when derived context artifacts are stale", async () => {
    const repoRoot = await createFixtureRepo();

    await replaceInFile(
      repoRoot,
      "glossary/terms.yaml",
      "Checked-in file that defines current behavior.",
      "Checked-in file that defines current behavior and workflow.",
    );

    expect(() => checkContextState(loadContextData(repoRoot))).toThrow(
      /Derived context artifacts are stale/,
    );
  });

  it("fails when first-party files are unmapped", async () => {
    const repoRoot = await createFixtureRepo();

    await writeFile(
      repoRoot,
      "src/unowned.ts",
      "export const unowned = true;\n",
    );

    expect(() => writeContextArtifacts(loadContextData(repoRoot))).toThrow(
      /Unmapped first-party files detected/,
    );
  });

  it("fails when changed files spill outside the active task packet", async () => {
    const repoRoot = await createFixtureRepo();
    const contextData = loadContextData(repoRoot);
    const taskPacket = buildTaskPacket(contextData, {
      allowLocked: ["public-api-and-build-contract"],
      task: "public-api-and-build-contract export contract",
    });

    writeActiveTask(contextData, taskPacket);
    await appendFile(
      repoRoot,
      "src/ops/report.ts",
      "\nexport const touched = true;\n",
    );
    writeContextArtifacts(loadContextData(repoRoot));

    expect(() => checkContextState(loadContextData(repoRoot))).toThrow(
      /spill outside the active task packet/,
    );
  });

  it("fails closed on locked subsystem edits without ADR updates and passes once the ADR changes too", async () => {
    const repoRoot = await createFixtureRepo();
    const contextData = loadContextData(repoRoot);
    const taskPacket = buildTaskPacket(contextData, {
      allowLocked: ["public-api-and-build-contract"],
      task: "public-api-and-build-contract export contract",
    });

    writeActiveTask(contextData, taskPacket);
    await appendFile(
      repoRoot,
      "src/index.ts",
      "\nexport const TOUCH = true;\n",
    );
    await appendFile(
      repoRoot,
      "spec/subsystems/public-api-and-build-contract.yaml",
      "\n# touched during locked-subsystem test\n",
    );
    writeContextArtifacts(loadContextData(repoRoot));

    expect(() => checkContextState(loadContextData(repoRoot))).toThrow(
      /requires an ADR change/,
    );

    await appendFile(
      repoRoot,
      "spec/decisions/ADR-0001-test.md",
      "\nThe locked public seam changed during this test.\n",
    );

    expect(() => checkContextState(loadContextData(repoRoot))).not.toThrow();
    expect(buildReviewPacket(loadContextData(repoRoot))).toContain("api-001");
  });
});
