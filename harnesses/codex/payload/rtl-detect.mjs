const RTL_RANGES = [
  [0x0590, 0x05FF],
  [0x0600, 0x06FF],
  [0x0750, 0x077F],
  [0x08A0, 0x08FF],
  [0xFB50, 0xFDFF],
  [0xFE70, 0xFEFF]
];

export function hasRTLChar(ch) {
  const cp = String(ch).codePointAt(0);
  if (cp === undefined) {
    return false;
  }
  if (cp === 0x200C) {
    return true;
  }
  for (const [lo, hi] of RTL_RANGES) {
    if (cp >= lo && cp <= hi) {
      return true;
    }
  }
  return false;
}

export function hasRTL(text) {
  for (const ch of String(text)) {
    if (hasRTLChar(ch)) {
      return true;
    }
  }
  return false;
}

export function detectDir(text) {
  if (!text) {
    return 'ltr';
  }
  return hasRTL(text) ? 'rtl' : 'ltr';
}
