import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";

import { CliError } from "./errors.mjs";
import { getEntry, validateEntry } from "./manifest.mjs";
import { formatTable } from "./format.mjs";

const TOOL_COMMANDS = {
  node: process.execPath,
  npx: "npx",
  python3: "python3",
  clang: "clang",
  cargo: "cargo",
  rustc: "rustc",
  bun: "bun",
  git: "git",
  xcodebuild: "xcodebuild",
  curl: "curl",
  rsync: "rsync",
  ditto: "ditto",
  codesign: "codesign",
  plutil: "plutil",
};

export function expandPath(value, home = os.homedir()) {
  if (typeof value !== "string") return value;
  if (value === "$HOME") return home;
  if (value.startsWith("$HOME/")) return path.join(home, value.slice("$HOME/".length));
  if (value === "${HOME}") return home;
  if (value.startsWith("${HOME}/")) {
    return path.join(home, value.slice("${HOME}/".length));
  }
  return value;
}

export function buildPlan(
  entry,
  { root, home = os.homedir(), allowInPlace = false, dryRun = false } = {},
) {
  if (!root) throw new CliError("buildPlan requires the repository root");
  validateEntry(entry, root);
  if (entry.inPlace && !allowInPlace && !dryRun) {
    throw new CliError(
      `${entry.slug} patches the installed app in place.\n` +
        "Re-run with --allow-in-place after reading docs/safety.md and confirming a backup.",
      3,
    );
  }
  const cwd = path.resolve(root, entry.cwd);
  const appPath = expandPath(entry.appPath, home);
  const outputPath = expandPath(entry.outputPath, home);
  const argv = entry.entry.map((arg) => expandPath(arg, home));
  const warnings = [];
  if (entry.profile === "shared") {
    warnings.push("shared profile: run only one instance at a time");
  }
  if (entry.inPlace) {
    warnings.push(
      "IN-PLACE: the installed app is modified; a backup must exist before continuing",
    );
  }
  return {
    entry,
    argv,
    cwd,
    appPath,
    outputPath,
    inPlace: Boolean(entry.inPlace),
    warnings,
  };
}

function run(argv, cwd, { inherit = false } = {}) {
  const result = spawnSync(argv[0], argv.slice(1), {
    cwd,
    stdio: inherit ? "inherit" : "pipe",
    encoding: "utf8",
    env: process.env,
  });
  if (result.error) {
    throw new CliError(`cannot run ${argv[0]}: ${result.error.message}`);
  }
  return result;
}

export function readPlist(appPath, key) {
  const plist = path.join(appPath, "Contents", "Info.plist");
  if (!fs.existsSync(plist)) return null;
  const result = spawnSync(
    "plutil",
    ["-extract", key, "raw", "-o", "-", plist],
    { encoding: "utf8" },
  );
  if (result.status !== 0) return null;
  const value = result.stdout.trim();
  return value || null;
}

export function appVersion(appPath) {
  return readPlist(appPath, "CFBundleShortVersionString");
}

export function appBundleId(appPath) {
  return readPlist(appPath, "CFBundleIdentifier");
}

export function isAppRunning(appPath) {
  const result = spawnSync("ps", ["-axo", "command="], { encoding: "utf8" });
  if (result.status !== 0) return null;
  const needle = `${appPath}/Contents/MacOS/`;
  return (
    result.stdout
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.includes(needle)) || null
  );
}

function statusFor(entry) {
  const sourceExists = fs.existsSync(expandPath(entry.appPath));
  const outputExists = fs.existsSync(expandPath(entry.outputPath));
  const sourceVersion = sourceExists ? appVersion(expandPath(entry.appPath)) : null;
  const outputVersion = outputExists ? appVersion(expandPath(entry.outputPath)) : null;
  const actualOutputId = outputExists ? appBundleId(expandPath(entry.outputPath)) : null;
  let status = "ok";
  if (!sourceExists) status = "source-missing";
  else if (!outputExists) status = "not-built";
  else if (actualOutputId !== entry.outputBundleId) status = "wrong-bundle-id";
  else if (
    entry.testedVersion &&
    sourceVersion &&
    sourceVersion !== entry.testedVersion
  ) {
    status = "version-drift";
  }
  return { sourceExists, outputExists, sourceVersion, outputVersion, actualOutputId, status };
}

export function commandList(manifest, root) {
  const rows = manifest.harnesses.map((entry) => {
    const state = statusFor(entry, root);
    return [
      entry.slug,
      entry.name,
      state.sourceVersion || "-",
      state.outputVersion || "-",
      entry.method,
      entry.profile,
      entry.inPlace ? "yes" : "no",
    ];
  });
  process.stdout.write(
    formatTable(
      ["slug", "name", "source", "output", "method", "profile", "in-place"],
      rows,
    ),
  );
  return 0;
}

export function commandInfo(manifest, root, slug) {
  const entry = getEntry(manifest, slug);
  const state = statusFor(entry);
  const appPath = expandPath(entry.appPath);
  const outputPath = expandPath(entry.outputPath);
  const lines = [
    `slug:        ${entry.slug}`,
    `name:        ${entry.name}`,
    `vendor:      ${entry.vendor}`,
    `method:      ${entry.method}`,
    `profile:     ${entry.profile}`,
    `in-place:    ${entry.inPlace ? "yes" : "no"}`,
    `source app:  ${appPath}`,
    `source id:   ${entry.appBundleId}`,
    `output app:  ${outputPath}`,
    `output id:   ${entry.outputBundleId}`,
    `tested:      ${entry.testedVersion || "unknown"}`,
    `verified:    ${entry.lastVerifiedVersion || "not yet"}`,
    `detected:    ${state.status}`,
    `entry:       ${entry.entry.join(" ")}`,
    `verify:      ${entry.verify.join(" ")}`,
    `tests:       ${entry.tests.length ? entry.tests.join(" ") : "none"}`,
    `restore:     ${entry.restore ? entry.restore.join(" ") : "not provided"}`,
    `docs:        ${path.join(root, entry.docs)}`,
    `notes:       ${entry.notes}`,
  ];
  process.stdout.write(lines.join("\n") + "\n");
  return 0;
}

export function commandDetect(manifest) {
  const rows = manifest.harnesses.map((entry) => {
    const state = statusFor(entry);
    return [
      entry.slug,
      state.sourceVersion || "-",
      state.outputVersion || "-",
      state.actualOutputId || "-",
      state.status,
    ];
  });
  process.stdout.write(
    formatTable(["slug", "source", "output", "output bundle id", "status"], rows),
  );
  return 0;
}

function toolStatus(name) {
  if (name === "node") return true;
  const result = spawnSync("which", [TOOL_COMMANDS[name] || name], {
    encoding: "utf8",
  });
  return result.status === 0;
}

export function commandDoctor(manifest) {
  const problems = [];
  if (process.platform !== "darwin") {
    problems.push("macOS is required");
  }
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 18) problems.push(`Node 18+ required (found ${process.versions.node})`);
  if (!toolStatus("plutil")) problems.push("plutil not found");
  if (!toolStatus("codesign")) problems.push("codesign not found");

  const df = spawnSync("df", ["-k", "."], { encoding: "utf8" });
  const freeKb = df.stdout?.trim().split("\n").at(-1)?.split(/\s+/)[3];
  const freeGb = freeKb ? Number(freeKb) / 1024 / 1024 : null;

  process.stdout.write(`platform:  ${process.platform}\n`);
  process.stdout.write(`node:      ${process.versions.node}\n`);
  process.stdout.write(
    `disk free: ${freeGb === null ? "unknown" : freeGb.toFixed(1) + " GB"}\n`,
  );

  const tools = Object.keys(TOOL_COMMANDS);
  const missing = tools.filter((tool) => !toolStatus(tool));
  process.stdout.write(`missing:   ${missing.length ? missing.join(", ") : "none"}\n`);
  process.stdout.write("\nHarness readiness:\n");
  const rows = manifest.harnesses.map((entry) => {
    const missingTools = entry.requires.filter((tool) => !toolStatus(tool));
    const source = fs.existsSync(expandPath(entry.appPath));
    return [
      entry.slug,
      source ? "source-ok" : "source-missing",
      missingTools.length ? missingTools.join(",") : "-",
      entry.inPlace ? "in-place" : "copy",
    ];
  });
  process.stdout.write(
    formatTable(["slug", "source", "missing tools", "mode"], rows),
  );
  if (problems.length) {
    for (const problem of problems) process.stderr.write(`error: ${problem}\n`);
    return 1;
  }
  return 0;
}

async function confirmPlan(plan) {
  if (!process.stdin.isTTY) {
    process.stdout.write(
      "non-interactive session; re-run with --yes to execute the build.\n",
    );
    return false;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question("Execute this build? [y/N] ");
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

export async function commandBuild(manifest, root, slug, flags) {
  const entry = getEntry(manifest, slug);
  const plan = buildPlan(entry, {
    root,
    allowInPlace: Boolean(flags.allowInPlace),
    dryRun: Boolean(flags.dryRun),
  });
  const sourceVersion = appVersion(plan.appPath);
  process.stdout.write(`harness:  ${entry.name} (${entry.slug})\n`);
  process.stdout.write(`source:   ${plan.appPath}${sourceVersion ? ` (${sourceVersion})` : ""}\n`);
  process.stdout.write(`output:   ${plan.outputPath}\n`);
  process.stdout.write(`mode:     ${plan.inPlace ? "IN-PLACE" : "copy"}\n`);
  process.stdout.write(`profile:  ${entry.profile}\n`);
  if (entry.testedVersion && sourceVersion && sourceVersion !== entry.testedVersion) {
    process.stdout.write(
      `warning:  source version ${sourceVersion} differs from tested ${entry.testedVersion}\n`,
    );
  }
  for (const warning of plan.warnings) process.stdout.write(`warning:  ${warning}\n`);
  process.stdout.write(`command:  ${plan.argv.join(" ")}\n`);

  if (flags.dryRun) {
    process.stdout.write("dry-run:  nothing executed\n");
    return 0;
  }
  if (!fs.existsSync(plan.appPath)) {
    process.stderr.write(`error: source app not found: ${plan.appPath}\n`);
    return 1;
  }
  if (!flags.yes && !(await confirmPlan(plan))) {
    return 0;
  }
  const running = isAppRunning(plan.appPath);
  if (running) {
    process.stderr.write(
      `error: the source app is running. Quit it first:\n${running}\n`,
    );
    return 1;
  }
  const result = run(plan.argv, plan.cwd, { inherit: true });
  return result.status ?? 1;
}

export function commandVerify(manifest, root, slug) {
  const entry = getEntry(manifest, slug);
  const outputPath = expandPath(entry.outputPath);
  if (!fs.existsSync(outputPath)) {
    process.stderr.write(`error: output not found: ${outputPath}\n`);
    return 1;
  }
  const actualId = appBundleId(outputPath);
  const actualVersion = appVersion(outputPath);
  process.stdout.write(`output:    ${outputPath}\n`);
  process.stdout.write(`version:   ${actualVersion || "unknown"}\n`);
  process.stdout.write(`bundle id: ${actualId || "unknown"}\n`);
  if (actualId !== entry.outputBundleId) {
    process.stderr.write(
      `error: expected bundle id ${entry.outputBundleId}, found ${actualId || "none"}\n`,
    );
    return 1;
  }
  if (outputPath.endsWith(".app")) {
    const signed = spawnSync(
      "codesign",
      ["--verify", "--deep", "--strict", outputPath],
      { encoding: "utf8" },
    );
    if (signed.status !== 0) {
      process.stderr.write(
        `error: codesign verification failed:\n${signed.stderr || signed.stdout || ""}`,
      );
      return 1;
    }
    process.stdout.write("codesign:  ok\n");
  }
  const verify = run(entry.verify, path.resolve(root, entry.cwd));
  if (verify.status !== 0) {
    process.stderr.write(
      `error: harness verify command failed:\n${verify.stderr || verify.stdout || ""}`,
    );
    return 1;
  }
  process.stdout.write("verify:    ok\n");
  return 0;
}

export function commandTest(manifest, root, slug, flags) {
  const entries = flags.all
    ? manifest.harnesses
    : [getEntry(manifest, slug)];
  let failed = 0;
  for (const entry of entries) {
    if (!entry.tests.length) {
      process.stdout.write(`${entry.slug}: no automated tests\n`);
      continue;
    }
    process.stdout.write(`${entry.slug}: ${entry.tests.join(" ")}\n`);
    const result = run(entry.tests, path.resolve(root, entry.cwd), { inherit: true });
    if (result.status !== 0) failed += 1;
  }
  if (failed) {
    process.stderr.write(`${failed} harness test command(s) failed\n`);
    return 1;
  }
  return 0;
}

export function commandDocs(manifest, root, slug, flags) {
  const entry = getEntry(manifest, slug);
  const doc = path.join(root, entry.docs);
  if (!fs.existsSync(doc)) {
    process.stderr.write(`error: documentation not found: ${doc}\n`);
    return 1;
  }
  if (flags.open) {
    const result = spawnSync("open", [doc], { stdio: "inherit" });
    return result.status ?? 1;
  }
  process.stdout.write(doc + "\n");
  return 0;
}
