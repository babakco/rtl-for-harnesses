import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { scanText, checkRepo, isForbiddenPath } from "../scripts/lib/check.mjs";

const cleanManifest = (root) => {
  const entry = {
    slug: "fixture",
    name: "Fixture",
    vendor: "Test",
    appPath: "/Applications/Fixture.app",
    appBundleId: "com.example.fixture",
    outputBundleId: "com.example.fixture.rtl",
    outputPath: "/Applications/Fixture-RTL.app",
    additionalOutputs: [],
    method: "electron-asar",
    profile: "separate",
    inPlace: false,
    requires: ["node"],
    testedVersion: "1.0.0",
    lastVerifiedVersion: null,
    cwd: "harnesses/fixture",
    entry: ["true"],
    verify: ["true"],
    tests: [],
    restore: null,
    docs: "harnesses/fixture/README.md",
    notes: "test fixture",
  };
  fs.mkdirSync(path.join(root, "harnesses", "fixture"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "harnesses", "fixture", "README.md"),
    "# Fixture\n\nتوسعه‌دهنده: **Mehdi Ravanbakhsh**\n",
  );
  fs.writeFileSync(
    path.join(root, "manifest.json"),
    JSON.stringify({ schemaVersion: 1, harnesses: [entry] }, null, 2) + "\n",
  );
};

const withTemp = (fn) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rtl-check-"));
  try {
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};

test("clean text has no hits", () => {
  assert.deepEqual(scanText("# clean\ncommand --flag\n"), []);
});

test("absolute user paths are flagged", () => {
  const privatePath = "/Users/" + "alice" + "/project";
  const hits = scanText(`path: ${privatePath}\n`);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].category, "PRIVATE_PATH");
  assert.doesNotMatch(hits[0].preview, /alice/);
});

test("OpenAI-style keys are flagged and masked", () => {
  const key = "sk-" + "a".repeat(24);
  const hits = scanText(`key=${key}\n`);
  assert.equal(hits[0].category, "OPENAI_KEY");
  assert.doesNotMatch(hits[0].preview, new RegExp(key));
});

test("developer name and GitHub noreply address are allowed", () => {
  assert.deepEqual(scanText("Mehdi Ravanbakhsh\n"), []);
  assert.deepEqual(scanText("babakco@users.noreply.github.com\n"), []);
});

test("Retina image names are not treated as email addresses", () => {
  assert.deepEqual(scanText("icon_16x16@2x.png\n"), []);
});

test("placeholder secrets are ignored", () => {
  assert.deepEqual(scanText('api_key: "<YOUR_API_KEY>"\n'), []);
  assert.deepEqual(scanText("token = ${GITHUB_TOKEN}\n"), []);
});

test("forbidden filenames and directories are detected", () => {
  assert.equal(isForbiddenPath(".env")?.type, "file");
  assert.equal(isForbiddenPath("auth.json")?.type, "file");
  assert.equal(isForbiddenPath("certs/server.pem")?.type, "file");
  assert.equal(isForbiddenPath("node_modules/pkg/index.js")?.type, "dir");
  assert.equal(isForbiddenPath("harnesses/x/build/out")?.type, "dir");
});

test("checkRepo passes a clean fixture and rejects .env", () =>
  withTemp((root) => {
    cleanManifest(root);
    const clean = checkRepo(root);
    assert.equal(clean.ok, true, JSON.stringify(clean.errors));
    fs.writeFileSync(path.join(root, ".env"), "TOKEN=placeholder\n");
    const dirty = checkRepo(root);
    assert.equal(dirty.ok, false);
    assert.ok(dirty.errors.some((error) => error.includes(".env")));
  }));

test("checkRepo rejects files over 5 MB", () =>
  withTemp((root) => {
    cleanManifest(root);
    fs.writeFileSync(path.join(root, "big.bin"), Buffer.alloc(5 * 1024 * 1024 + 1));
    const result = checkRepo(root);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.includes("big.bin")));
  }));

test("checkRepo allows missing docs only when explicitly requested", () =>
  withTemp((root) => {
    cleanManifest(root);
    fs.rmSync(path.join(root, "harnesses", "fixture", "README.md"));
    assert.equal(checkRepo(root).ok, false);
    assert.equal(checkRepo(root, { allowMissingDocs: true }).ok, true);
  }));

test("source extensions are scanned for private paths", () =>
  withTemp((root) => {
    cleanManifest(root);
    const privatePath = "/Users/" + "alice" + "/tool";
    fs.writeFileSync(
      path.join(root, "harnesses", "fixture", "injector.m"),
      `NSString *p = @"${privatePath}";\n`,
    );
    const result = checkRepo(root);
    assert.equal(result.ok, false);
    assert.ok(result.hits.some((hit) => hit.file.includes("injector.m")));
  }));

test("staged scan reads binary files larger than 1 MiB", () =>
  withTemp((root) => {
    cleanManifest(root);
    fs.writeFileSync(
      path.join(root, "icon.icns"),
      Buffer.alloc(1024 * 1024 + 1024, 0x41),
    );
    assert.equal(spawnSync("git", ["init", "-q"], { cwd: root }).status, 0);
    assert.equal(spawnSync("git", ["add", "-A"], { cwd: root }).status, 0);
    const result = checkRepo(root, { staged: true });
    assert.equal(result.ok, true, JSON.stringify(result.errors));
  }));
