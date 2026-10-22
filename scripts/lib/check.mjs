import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { loadManifest } from "../../bin/lib/manifest.mjs";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const FORBIDDEN_DIRS = new Set([
  "node_modules",
  ".venv",
  "build",
  "dist",
  "target",
  "__pycache__",
]);
const TEXT_EXTENSIONS = new Set([
  ".md",
  ".json",
  ".mjs",
  ".js",
  ".cjs",
  ".sh",
  ".txt",
  ".yml",
  ".yaml",
  ".css",
  ".html",
  ".py",
  ".ts",
  ".tsx",
  ".jsx",
  ".xml",
  ".plist",
  ".svg",
  ".toml",
]);
const TEXT_BASENAMES = new Set([
  ".gitignore",
  ".gitattributes",
  "LICENSE",
  "AUTHORS",
]);
const ALLOWED_EMAILS = new Set(["babakco@users.noreply.github.com"]);

const SECRET_PATTERNS = [
  {
    category: "PRIVATE_KEY",
    re: /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/g,
  },
  { category: "AWS_KEY", re: /\bAKIA[0-9A-Z]{16}\b/g },
  { category: "GITHUB_TOKEN", re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g },
  { category: "GITHUB_PAT", re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  {
    category: "OPENAI_KEY",
    re: /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}\b/g,
  },
  { category: "SLACK_TOKEN", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { category: "GOOGLE_KEY", re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { category: "BEARER_TOKEN", re: /\bBearer\s+[A-Za-z0-9._-]{20,}\b/g },
  {
    category: "DB_CREDENTIALS",
    re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\/\s:@]+:[^\/\s@]+@/g,
  },
  {
    category: "SENTRY_DSN",
    re: /https:\/\/[0-9a-f]{32}@[^\/\s]+\/\d+/g,
  },
  {
    category: "SECRET_ASSIGNMENT",
    re: /\b(?:api[_-]?key|secret|token|password|passwd)\b\s*[:=]\s*["'][^"']{8,}["']/gi,
  },
];

const PRIVATE_PATTERNS = [
  { category: "PRIVATE_PATH", re: /\/Users\/[A-Za-z0-9._-]+/g },
  { category: "PRIVATE_PATH", re: /\/home\/[A-Za-z0-9._-]+/g },
  {
    category: "PRIVATE_IP",
    re: /\b(?:10\.\d{1,3}|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b/g,
  },
  {
    category: "EMAIL",
    re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
];

export function isForbiddenPath(relativePath) {
  const parts = relativePath.split("/");
  for (const part of parts) {
    if (FORBIDDEN_DIRS.has(part)) return { type: "dir", name: part };
  }
  const base = parts.at(-1);
  if (!base) return null;
  if (base === ".env" || base.startsWith(".env.")) {
    return { type: "file", name: base };
  }
  if (base === "auth.json" || base.startsWith("credentials")) {
    return { type: "file", name: base };
  }
  if (/\.(pem|p12|key)$/i.test(base) || /^id_rsa/.test(base) || base.endsWith(".kdbx")) {
    return { type: "file", name: base };
  }
  return null;
}

function isPlaceholderLine(line) {
  return /<YOUR_|\$\{|YOUR_API_KEY|REDACTED|placeholder|example\.invalid|users\.noreply\.github\.com/i.test(
    line,
  );
}

function isRetinaAsset(line) {
  return /@\d+x\.(png|jpe?g|webp)\b/i.test(line);
}

function maskedPreview(line, match) {
  const masked = line.replace(match, "[REDACTED]").trim();
  return masked.length > 140 ? masked.slice(0, 137) + "..." : masked;
}

export function scanText(text) {
  const hits = [];
  const lines = String(text).split(/\r?\n/);
  lines.forEach((line, index) => {
    if (!line.trim()) return;
    if (!isPlaceholderLine(line)) {
      for (const { category, re } of SECRET_PATTERNS) {
        re.lastIndex = 0;
        const match = re.exec(line);
        if (match) {
          hits.push({
            category,
            line: index + 1,
            preview: maskedPreview(line, match[0]),
          });
        }
      }
    }
    for (const { category, re } of PRIVATE_PATTERNS) {
      re.lastIndex = 0;
      let match;
      while ((match = re.exec(line)) !== null) {
        if (category === "EMAIL") {
          if (ALLOWED_EMAILS.has(match[0])) continue;
          if (isRetinaAsset(match[0])) continue;
        }
        hits.push({
          category,
          line: index + 1,
          preview: maskedPreview(line, match[0]),
        });
      }
    }
  });
  return hits;
}

function isTextFile(relativePath) {
  const base = path.basename(relativePath);
  return (
    TEXT_EXTENSIONS.has(path.extname(relativePath).toLowerCase()) ||
    TEXT_BASENAMES.has(base)
  );
}

function walk(root) {
  const items = [];
  const visit = (directory, relative = "") => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === ".git") continue;
      if (entry.name === "Harness-RTL-Project-List.txt") continue;
      const rel = relative ? `${relative}/${entry.name}` : entry.name;
      const abs = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        items.push({ rel, abs, isDir: true });
        if (!FORBIDDEN_DIRS.has(entry.name)) visit(abs, rel);
      } else if (entry.isFile()) {
        items.push({ rel, abs, isDir: false });
      }
    }
  };
  visit(root);
  return items;
}

function git(root, args) {
  return spawnSync("git", args, { cwd: root, encoding: "utf8" });
}

function checkHarnessDocs(root, manifest, errors, allowMissingDocs) {
  if (!manifest) return;
  for (const entry of manifest.harnesses) {
    const docs = path.join(root, entry.docs);
    const cwd = path.join(root, entry.cwd);
    if (!allowMissingDocs && !fs.existsSync(docs)) {
      errors.push(`missing harness README: ${entry.docs}`);
    }
    if (!allowMissingDocs && !fs.existsSync(cwd)) {
      errors.push(`missing harness directory: ${entry.cwd}`);
    }
  }
}

function checkScratchFile(root, errors) {
  const scratch = path.join(root, "Harness-RTL-Project-List.txt");
  if (!fs.existsSync(scratch)) return;
  if (!fs.existsSync(path.join(root, ".git"))) {
    errors.push("Harness-RTL-Project-List.txt exists outside Git; remove or ignore it");
    return;
  }
  const ignored = git(root, ["check-ignore", "-q", "Harness-RTL-Project-List.txt"]);
  if (ignored.status !== 0) {
    errors.push("Harness-RTL-Project-List.txt is not ignored by .gitignore");
  }
  const tracked = git(root, ["ls-files", "--error-unmatch", "Harness-RTL-Project-List.txt"]);
  if (tracked.status === 0) {
    errors.push("Harness-RTL-Project-List.txt is tracked by Git");
  }
}

function checkStaged(root, errors, hits) {
  const listing = git(root, ["diff", "--cached", "--name-only", "--diff-filter=ACMR"]);
  if (listing.status !== 0) {
    errors.push("cannot read the staged index");
    return;
  }
  const files = listing.stdout.split("\n").filter(Boolean);
  if (!files.length) {
    errors.push("no staged files to check");
    return;
  }
  for (const rel of files) {
    const forbidden = isForbiddenPath(rel);
    if (forbidden) {
      errors.push(`forbidden ${forbidden.type}: ${rel}`);
      continue;
    }
    const show = git(root, ["show", `:${rel}`]);
    if (show.status !== 0) {
      errors.push(`cannot read staged file: ${rel}`);
      continue;
    }
    const buffer = show.stdout;
    if (Buffer.byteLength(buffer) > MAX_FILE_BYTES) {
      errors.push(`file exceeds 5 MB: ${rel}`);
    }
    if (!isTextFile(rel)) continue;
    const text = buffer;
    if (rel.endsWith(".md") && !text.includes("Mehdi Ravanbakhsh")) {
      errors.push(`missing developer attribution: ${rel}`);
    }
    for (const hit of scanText(text)) {
      hits.push({ file: rel, ...hit });
    }
  }
}

export function checkRepo(root, { staged = false, allowMissingDocs = false } = {}) {
  const errors = [];
  const hits = [];
  let manifest = null;
  try {
    manifest = loadManifest(root);
  } catch (error) {
    errors.push(error.message);
  }
  checkHarnessDocs(root, manifest, errors, allowMissingDocs);
  checkScratchFile(root, errors);

  const items = walk(root);
  for (const item of items) {
    const forbidden = isForbiddenPath(item.rel);
    if (forbidden) {
      errors.push(`forbidden ${forbidden.type}: ${item.rel}`);
      continue;
    }
    if (item.isDir) continue;
    const size = fs.statSync(item.abs).size;
    if (size > MAX_FILE_BYTES) {
      errors.push(`file exceeds 5 MB: ${item.rel} (${size} bytes)`);
    }
    if (!isTextFile(item.rel)) continue;
    const text = fs.readFileSync(item.abs, "utf8");
    if (item.rel.endsWith(".md") && !text.includes("Mehdi Ravanbakhsh")) {
      errors.push(`missing developer attribution: ${item.rel}`);
    }
    for (const hit of scanText(text)) {
      hits.push({ file: item.rel, ...hit });
    }
  }

  if (staged) checkStaged(root, errors, hits);
  return {
    ok: errors.length === 0 && hits.length === 0,
    errors,
    hits,
    files: items.filter((item) => !item.isDir).length,
  };
}
