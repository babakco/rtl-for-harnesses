#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { CliError } from "./lib/errors.mjs";
import { loadManifest } from "./lib/manifest.mjs";
import {
  commandBuild,
  commandDetect,
  commandDocs,
  commandDoctor,
  commandInfo,
  commandList,
  commandTest,
  commandVerify,
} from "./lib/commands.mjs";

const USAGE = `Usage: ./rtl-harness <command> [options]

Commands:
  list                         list all harnesses
  info <slug>                  show one harness in detail
  detect                       compare installed source and RTL output
  doctor                       check macOS, Node, and required tools
  build <slug> [--yes]         build the RTL app (copy mode by default)
              [--dry-run] [--allow-in-place]
  verify <slug>                check output bundle id, signature, and tests
  test <slug> | --all          run harness test commands
  docs <slug> [--open]         print or open the harness README

Safety:
  Copy mode is the default. GitHub Copilot is the only in-place harness and
  requires --allow-in-place. OpenCode requires --rtl-app and is never run in
  its in-place no-flag mode by this CLI.
`;

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = {};
  const positionals = [];
  for (const arg of rest) {
    if (arg === "--yes") flags.yes = true;
    else if (arg === "--dry-run") flags.dryRun = true;
    else if (arg === "--allow-in-place") flags.allowInPlace = true;
    else if (arg === "--open") flags.open = true;
    else if (arg === "--all") flags.all = true;
    else if (arg === "--json") flags.json = true;
    else if (arg === "--help" || arg === "-h") flags.help = true;
    else if (arg.startsWith("-")) {
      throw new CliError(`unknown option: ${arg}`, 2);
    } else {
      positionals.push(arg);
    }
  }
  return { command, slug: positionals[0], positionals, flags };
}

function requireSlug(parsed) {
  if (!parsed.slug) throw new CliError(`${parsed.command} requires a harness slug`, 2);
  return parsed.slug;
}

async function main(argv) {
  const parsed = parseArgs(argv);
  if (!parsed.command || parsed.flags.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const manifest = loadManifest(root);
  switch (parsed.command) {
    case "list":
      return commandList(manifest, root);
    case "info":
      return commandInfo(manifest, root, requireSlug(parsed));
    case "detect":
      return commandDetect(manifest);
    case "doctor":
      return commandDoctor(manifest);
    case "build":
      return commandBuild(manifest, root, requireSlug(parsed), parsed.flags);
    case "verify":
      return commandVerify(manifest, root, requireSlug(parsed));
    case "test":
      if (parsed.flags.all) return commandTest(manifest, root, undefined, parsed.flags);
      return commandTest(manifest, root, requireSlug(parsed), parsed.flags);
    case "docs":
      return commandDocs(manifest, root, requireSlug(parsed), parsed.flags);
    default:
      process.stderr.write(`unknown command: ${parsed.command}\n\n${USAGE}`);
      return 2;
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      if (error instanceof CliError) {
        process.stderr.write(`error: ${error.message}\n`);
        process.exitCode = error.exitCode;
      } else {
        process.stderr.write(`error: ${error.stack || error.message}\n`);
        process.exitCode = 1;
      }
    });
}
