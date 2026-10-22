import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadManifest, getEntry, validateEntry } from "../bin/lib/manifest.mjs";
import { buildPlan } from "../bin/lib/commands.mjs";
import { parseArgs } from "../bin/rtl-harness.mjs";
import { formatTable } from "../bin/lib/format.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("manifest contains all 15 harnesses", () => {
  const manifest = loadManifest(root);
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.harnesses.length, 15);
  assert.equal(new Set(manifest.harnesses.map((h) => h.slug)).size, 15);
});

test("getEntry rejects an unknown slug", () => {
  const manifest = loadManifest(root);
  assert.throws(() => getEntry(manifest, "no-such-harness"), /unknown harness/i);
});

test("buildPlan refuses in-place without --allow-in-place", () => {
  const manifest = loadManifest(root);
  const entry = getEntry(manifest, "github-copilot");
  assert.throws(() => buildPlan(entry, { root }), /allow-in-place/i);
});

test("buildPlan expands $HOME and returns the manifest argv", () => {
  const manifest = loadManifest(root);
  const entry = getEntry(manifest, "codex");
  const plan = buildPlan(entry, { root, home: "/tmp/example-home" });
  assert.equal(plan.outputPath, "/tmp/example-home/Applications/ChatGPT-RTL.app");
  assert.equal(plan.argv[0], "bash");
  assert.equal(plan.argv.at(-1), "--make-rtl");
});

test("buildPlan rejects a cwd outside the repository", () => {
  const entry = {
    slug: "fixture",
    cwd: "../outside",
    entry: ["true"],
    outputPath: "/tmp/out.app",
    appPath: "/tmp/in.app",
    inPlace: false,
    profile: "separate",
  };
  assert.throws(() => validateEntry(entry, root), /outside|harnesses/i);
});

test("parseArgs handles build flags", () => {
  const parsed = parseArgs(["build", "zcode", "--yes", "--dry-run"]);
  assert.equal(parsed.command, "build");
  assert.equal(parsed.slug, "zcode");
  assert.equal(parsed.flags.yes, true);
  assert.equal(parsed.flags.dryRun, true);
});

test("parseArgs rejects unknown flags", () => {
  assert.throws(() => parseArgs(["build", "zcode", "--nope"]), /unknown option/i);
});

test("formatTable prints a header and one row per harness", () => {
  const table = formatTable(["slug", "name"], [["a", "A"], ["b", "B"]]);
  const lines = table.trim().split("\n");
  assert.equal(lines.length, 3);
  assert.match(lines[0], /slug/);
  assert.match(lines[1], /a/);
  assert.match(lines[2], /b/);
});
