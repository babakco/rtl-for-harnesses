#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

import { checkRepo } from "./lib/check.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const staged = args.includes("--staged");
const allowMissingDocs = args.includes("--allow-missing-docs");

const result = checkRepo(root, { staged, allowMissingDocs });

if (result.errors.length) {
  for (const error of result.errors) process.stderr.write(`error: ${error}\n`);
}
if (result.hits.length) {
  for (const hit of result.hits) {
    process.stderr.write(
      `privacy: ${hit.file}:${hit.line}: ${hit.category}: ${hit.preview}\n`,
    );
  }
}

if (!result.ok) {
  process.stderr.write(
    `\ncheck-repo failed: ${result.errors.length} error(s), ${result.hits.length} privacy hit(s)\n`,
  );
  process.exit(4);
}

process.stdout.write(`check-repo: ok (${result.files} files)\n`);
