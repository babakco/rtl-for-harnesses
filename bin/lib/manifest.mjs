import fs from "node:fs";
import path from "node:path";

import { CliError } from "./errors.mjs";

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const BUNDLE_RE = /^[A-Za-z0-9.-]+$/;
const METHODS = new Set([
  "electron-asar",
  "electron-asar-preload",
  "electron-asar-surgical",
  "electron-asar-framework",
  "electron-unpacked",
  "tauri-source",
  "native-source-rust",
  "webkit-dylib",
]);
const PROFILES = new Set(["separate", "shared"]);
const REQUIRED = [
  "slug",
  "name",
  "vendor",
  "appPath",
  "appBundleId",
  "outputBundleId",
  "outputPath",
  "additionalOutputs",
  "method",
  "profile",
  "inPlace",
  "requires",
  "testedVersion",
  "lastVerifiedVersion",
  "cwd",
  "entry",
  "verify",
  "tests",
  "restore",
  "docs",
  "notes",
];

function fail(message) {
  throw new CliError(message, 1);
}

function isStringArray(value, { allowEmpty = false } = {}) {
  return (
    Array.isArray(value) &&
    (allowEmpty || value.length > 0) &&
    value.every((item) => typeof item === "string" && item.length > 0)
  );
}

/**
 * Validate the fields the CLI needs before running a command. Full validation
 * is requested by loadManifest; buildPlan uses the smaller core check so tests
 * can exercise path safety with a fixture.
 */
export function validateEntry(entry, root, { full = false } = {}) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    fail("manifest entry must be an object");
  }
  if (typeof entry.slug !== "string" || !SLUG_RE.test(entry.slug)) {
    fail(`invalid harness slug: ${String(entry.slug)}`);
  }
  if (!isStringArray(entry.entry)) {
    fail(`${entry.slug}: entry must be a non-empty array of strings`);
  }
  if (typeof entry.cwd !== "string" || entry.cwd.length === 0) {
    fail(`${entry.slug}: cwd is required`);
  }
  const allowed = path.resolve(root, "harnesses", entry.slug);
  const actual = path.resolve(root, entry.cwd);
  if (actual !== allowed && !actual.startsWith(allowed + path.sep)) {
    fail(`${entry.slug}: cwd must stay inside harnesses/${entry.slug}`);
  }
  if (full) {
    for (const key of REQUIRED) {
      if (!(key in entry)) fail(`${entry.slug}: missing required field ${key}`);
    }
    if (typeof entry.name !== "string" || !entry.name.trim()) {
      fail(`${entry.slug}: name is required`);
    }
    if (typeof entry.vendor !== "string" || !entry.vendor.trim()) {
      fail(`${entry.slug}: vendor is required`);
    }
    if (typeof entry.appPath !== "string" || !entry.appPath.trim()) {
      fail(`${entry.slug}: appPath is required`);
    }
    if (typeof entry.outputPath !== "string" || !entry.outputPath.trim()) {
      fail(`${entry.slug}: outputPath is required`);
    }
    if (typeof entry.appBundleId !== "string" || !BUNDLE_RE.test(entry.appBundleId)) {
      fail(`${entry.slug}: invalid appBundleId`);
    }
    if (
      typeof entry.outputBundleId !== "string" ||
      !BUNDLE_RE.test(entry.outputBundleId)
    ) {
      fail(`${entry.slug}: invalid outputBundleId`);
    }
    if (!Array.isArray(entry.additionalOutputs)) {
      fail(`${entry.slug}: additionalOutputs must be an array`);
    }
    if (!METHODS.has(entry.method)) fail(`${entry.slug}: invalid method`);
    if (!PROFILES.has(entry.profile)) fail(`${entry.slug}: invalid profile`);
    if (typeof entry.inPlace !== "boolean") fail(`${entry.slug}: inPlace must be boolean`);
    if (!Array.isArray(entry.requires)) fail(`${entry.slug}: requires must be an array`);
    if (!isStringArray(entry.verify)) {
      fail(`${entry.slug}: verify must be a non-empty argv array`);
    }
    if (!isStringArray(entry.tests, { allowEmpty: true })) {
      fail(`${entry.slug}: tests must be an array of strings`);
    }
    if (
      entry.restore !== null &&
      entry.restore !== undefined &&
      !isStringArray(entry.restore)
    ) {
      fail(`${entry.slug}: restore must be an argv array or null`);
    }
    if (entry.testedVersion !== null && typeof entry.testedVersion !== "string") {
      fail(`${entry.slug}: testedVersion must be a string or null`);
    }
    if (
      entry.lastVerifiedVersion !== null &&
      typeof entry.lastVerifiedVersion !== "string"
    ) {
      fail(`${entry.slug}: lastVerifiedVersion must be a string or null`);
    }
    if (entry.docs !== `harnesses/${entry.slug}/README.md`) {
      fail(`${entry.slug}: docs must point at harnesses/${entry.slug}/README.md`);
    }
    if (typeof entry.notes !== "string" || !entry.notes.trim()) {
      fail(`${entry.slug}: notes is required`);
    }
  }
  return true;
}

export function loadManifest(root) {
  const file = path.join(root, "manifest.json");
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail(`cannot read manifest.json: ${error.message}`);
  }
  if (manifest.schemaVersion !== 1) fail("manifest schemaVersion must be 1");
  if (!Array.isArray(manifest.harnesses) || manifest.harnesses.length === 0) {
    fail("manifest.harnesses must be a non-empty array");
  }
  const seen = new Set();
  for (const entry of manifest.harnesses) {
    validateEntry(entry, root, { full: true });
    if (seen.has(entry.slug)) fail(`duplicate harness slug: ${entry.slug}`);
    seen.add(entry.slug);
  }
  return manifest;
}

export function getEntry(manifest, slug) {
  const entry = manifest.harnesses.find((item) => item.slug === slug);
  if (!entry) {
    const available = manifest.harnesses.map((item) => item.slug).join(", ");
    fail(`unknown harness: ${slug}\navailable: ${available}`);
  }
  return entry;
}
