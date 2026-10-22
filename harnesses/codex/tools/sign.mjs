import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const STRIP_KEYS = new Set([
  'com.apple.application-identifier',
  'com.apple.developer.team-identifier',
  'keychain-access-groups',
  'com.apple.developer.aps-environment',
  // 26.1007.30912 added this provisioned capability; amfid kills an ad-hoc
  // binary that keeps it ("Adhoc signed app with restricted entitlements
  // detected ... The file is adhoc signed but contains restricted
  // entitlements", silent SIGKILL/exit 137 with zero output).
  'com.apple.developer.usernotifications.communication'
]);

const DISABLE_LIBRARY_VALIDATION_KEY = 'com.apple.security.cs.disable-library-validation';

function toLines(plistXml) {
  return String(plistXml).split('\n').flatMap((line) => line.replace(/>\s*</g, '>\n<').split('\n'));
}

function skipValue(lines, i) {
  let rest = lines[i].slice(lines[i].indexOf('</key>') + 6);
  let j = i;
  let container = null;
  for (;;) {
    const text = j === i ? rest : lines[j];
    if (container === null) {
      if (text === undefined) {
        return j;
      }
      if (text.trim() === '') {
        j++;
        continue;
      }
      const multi = text.match(/<(array|dict)(\s|>|\/)/);
      if (multi && !text.includes('/>') && !text.includes('</' + multi[1] + '>')) {
        container = multi[1];
        j++;
        continue;
      }
      const scalar = text.match(/<(string|integer|real|date|data)(\s|>|\/)/);
      if (scalar && !text.includes('/>') && !text.includes('</' + scalar[1] + '>')) {
        container = scalar[1];
        j++;
        continue;
      }
      return j + 1;
    }
    if (j >= lines.length) {
      return j;
    }
    const depthRe = new RegExp('</?' + container + '(\\s[^>]*)?/?>', 'g');
    const tags = lines[j].match(depthRe) || [];
    let depth = 1;
    for (const t of tags) {
      if (t.startsWith('</')) {
        depth--;
      } else if (!t.endsWith('/>')) {
        depth++;
      }
    }
    j++;
    if (depth <= 0) {
      return j;
    }
  }
}

export function stripEntitlements(plistXml) {
  const lines = toLines(plistXml);
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const keyMatch = line.match(/<key>([^<]*)<\/key>/);
    if (keyMatch && STRIP_KEYS.has(keyMatch[1])) {
      i = skipValue(lines, i);
      continue;
    }
    out.push(line);
    i++;
  }
  return out.join('\n');
}

export function prepareEntitlements(plistXml) {
  const stripped = stripEntitlements(plistXml);
  if (stripped.includes('<key>' + DISABLE_LIBRARY_VALIDATION_KEY + '</key>')) {
    return stripped;
  }
  const closeIdx = stripped.lastIndexOf('</dict>');
  if (closeIdx === -1) {
    return stripped;
  }
  // ad-hoc signatures make every binary its own team so the framework refuses to load with `different Team IDs` unless library validation is disabled; upstream never needed it because all its components share Team ID `2DC432GLL2`; the setting applies bundle-wide via `--deep` re-sign.
  return stripped.slice(0, closeIdx) + '  <key>' + DISABLE_LIBRARY_VALIDATION_KEY + '</key>\n  <true/>\n' + stripped.slice(closeIdx);
}

export function asarHeaderHash(asarPath) {
  const buf = readFileSync(asarPath);
  if (buf.length < 16) {
    throw new Error('asar too small to contain a header');
  }
  const headerSize = buf.readUInt32LE(12);
  if (headerSize <= 0 || buf.length < 16 + headerSize) {
    throw new Error('asar header size out of range');
  }
  return createHash('sha256').update(buf.subarray(16, 16 + headerSize)).digest('hex');
}

export const ASAR_INTEGRITY_SENTINEL = 'AGbevlPCksUGKNL8TSn7wGmJEuJsXb2A';

export function asarIntegrityDigest(headerHashHex) {
  return createHash('sha256').update('Resources/app.asar', 'utf8').update('SHA256', 'utf8').update(String(headerHashHex), 'utf8').digest('hex');
}

export function patchFrameworkIntegritySlot(frameworkPath, oldHeaderHashHex, newHeaderHashHex) {
  const buf = readFileSync(frameworkPath);
  const oldHex = asarIntegrityDigest(oldHeaderHashHex);
  const newHex = asarIntegrityDigest(newHeaderHashHex);
  const oldBytes = Buffer.from(oldHex, 'hex');
  const hits = [];
  let from = 0;
  for (;;) {
    const idx = buf.indexOf(oldBytes, from);
    if (idx === -1) {
      break;
    }
    hits.push(idx);
    from = idx + 1;
    if (hits.length > 1) {
      break;
    }
  }
  if (hits.length === 0) {
    throw new Error('integrity slot old digest not found');
  }
  if (hits.length !== 1) {
    throw new Error('multiple integrity slot matches, refusing to patch');
  }
  const sentinel = Buffer.from(ASAR_INTEGRITY_SENTINEL, 'utf8');
  const sIdx = buf.indexOf(sentinel);
  if (sIdx === -1) {
    throw new Error('integrity slot sentinel not found');
  }
  if (buf[sIdx + 32] !== 1) {
    throw new Error('integrity slot not in use');
  }
  if (buf[sIdx + 33] !== 1) {
    throw new Error('unsupported integrity slot version');
  }
  if (hits[0] !== sIdx + 34) {
    throw new Error('integrity slot offset mismatch');
  }
  Buffer.from(newHex, 'hex').copy(buf, hits[0]);
  writeFileSync(frameworkPath, buf);
  return { oldDigestHex: oldHex, newDigestHex: newHex, offset: hits[0] };
}

export function updateAsarHash(plistXml, sha256) {
  const lines = toLines(plistXml);
  const stack = [];
  let pendingKey = null;
  let awaiting = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const keyMatch = line.match(/<key>([^<]*)<\/key>/);
    const opensDict = line.includes('<dict>') && !line.includes('</dict>');
    const closesDict = line.includes('</dict>');
    if (awaiting) {
      const strMatch = line.match(/<string>([^<]*)<\/string>/);
      if (strMatch) {
        lines[i] = line.replace('<string>' + strMatch[1] + '</string>', '<string>' + String(sha256) + '</string>');
      }
      awaiting = false;
    }
    if (!awaiting && keyMatch) {
      pendingKey = keyMatch[1];
      if (stack.filter((s) => s).join('/') === 'ElectronAsarIntegrity/Resources/app.asar' && pendingKey === 'hash') {
        awaiting = true;
      }
    }
    if (opensDict) {
      stack.push(pendingKey);
      pendingKey = null;
    } else if (closesDict) {
      stack.pop();
      pendingKey = null;
    }
  }
  return lines.join('\n');
}
