import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { delimiter, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const postMergeScript = join(repositoryRoot, "scripts", "post-merge.sh");
const temporaryDirectories: string[] = [];
const approvalEnvironmentKeys = [
  "DATABASE_URL",
  "GARAGE_POST_MERGE_DISPOSABLE_DATABASE",
  "GARAGE_POST_MERGE_APPROVED_DATABASE_ID",
] as const;

function runPostMergeHook(overrides: Record<string, string> = {}) {
  const directory = mkdtempSync(join(tmpdir(), "garage-post-merge-test-"));
  temporaryDirectories.push(directory);
  const binDirectory = join(directory, "bin");
  mkdirSync(binDirectory);
  const npmLog = join(directory, "npm-commands.log");
  const npmShim = join(binDirectory, "npm");
  writeFileSync(
    npmShim,
    '#!/usr/bin/env sh\nprintf "%s\\n" "$*" >> "$POST_MERGE_TEST_NPM_LOG"\n',
    { mode: 0o755 },
  );

  const environment = { ...process.env } as Record<string, string | undefined>;
  for (const key of approvalEnvironmentKeys) delete environment[key];
  Object.assign(environment, overrides, {
    PATH: `${binDirectory}${delimiter}${process.env.PATH ?? ""}`,
    POST_MERGE_TEST_NPM_LOG: npmLog,
  });

  const result = spawnSync("bash", [postMergeScript], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: environment,
  });
  const npmCommands = existsSync(npmLog) ? readFileSync(npmLog, "utf8") : "";
  return {
    result,
    npmCommands,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("post-merge migration approval", () => {
  it("finishes setup and skips migrations when no disposable approval exists", () => {
    const { result, npmCommands, output } = runPostMergeHook();

    expect(result.status).toBe(0);
    expect(output).toContain("Post-merge migrations skipped");
    expect(npmCommands).toContain("ci --no-audit --no-fund");
    expect(npmCommands).toContain("run build");
    expect(npmCommands).not.toContain("run db:migrate");
  });

  it("runs migrations only when the approved database identity matches", () => {
    const connection = "postgresql://operator:not-a-real-secret@db.example.internal:5432/garage_disposable";
    const { result, npmCommands, output } = runPostMergeHook({
      DATABASE_URL: connection,
      GARAGE_POST_MERGE_DISPOSABLE_DATABASE: "yes",
      GARAGE_POST_MERGE_APPROVED_DATABASE_ID: "db.example.internal:5432/garage_disposable",
    });

    expect(result.status).toBe(0);
    expect(output).toContain("Post-merge disposable target approved");
    expect(npmCommands).toContain("run db:migrate");
    expect(output).not.toContain("not-a-real-secret");
    expect(output).not.toContain(connection);
  });

  it("stops before migrations when the approved identity does not match", () => {
    const connection = "postgresql://operator:not-a-real-secret@db.example.internal:5432/garage_disposable";
    const { result, npmCommands, output } = runPostMergeHook({
      DATABASE_URL: connection,
      GARAGE_POST_MERGE_DISPOSABLE_DATABASE: "yes",
      GARAGE_POST_MERGE_APPROVED_DATABASE_ID: "other.example.internal:5432/garage_disposable",
    });

    expect(result.status).not.toBe(0);
    expect(npmCommands).not.toContain("run db:migrate");
    expect(output).toContain("Post-merge migration blocked");
    expect(output).not.toContain("not-a-real-secret");
    expect(output).not.toContain(connection);
  });
});
