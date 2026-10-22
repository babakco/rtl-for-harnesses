#!/usr/bin/env python3
"""Surgical ASAR patcher for the Xiaomi MiMo AI RTL build.

Why "surgical" instead of `asar pack`?
  * A full unpack/repack round-trip is impossible here: the archive marks 122
    native entries as `unpacked`, but the shipped app.asar.unpacked directory
    only contains the darwin ones, so extraction fails and a repack would drop
    the rest.
  * This patcher never rewrites existing data. The original data section is
    copied byte-for-byte and new/updated files are appended at the end of the
    archive; only their header entries (offset/size/integrity) change.
    Dead bytes left behind by a replaced file are harmless.

Usage:
  patch_asar.py --list    <src.asar>
  patch_asar.py --extract <src.asar> <asar/path> <out-file>
  patch_asar.py <src.asar> <dst.asar> \
      --replace out/renderer/index.html=local.html \
      --add     out/renderer/rtl-fa.js=local.js
"""
import argparse
import hashlib
import json
import os
import struct
import sys

BLOCK_SIZE = 4194304


def make_integrity(data: bytes) -> dict:
    digest = hashlib.sha256(data).hexdigest()
    return {
        "algorithm": "SHA256",
        "hash": digest,
        "blockSize": BLOCK_SIZE,
        "blocks": [digest],
    }


def load(path: str):
    """Return (header, body, json_size_raw).

    Layout of an asar file:
      [u32 = 4][u32 = header_size][u32 = header_size - 4][u32 = json_size]
      [json bytes, NUL padded to 4][file data ...]
    """
    with open(path, "rb") as fh:
        raw = fh.read()
    if len(raw) < 16:
        raise SystemExit(f"{path}: too small to be an asar archive")
    first, header_size, second, json_size = struct.unpack("<IIII", raw[:16])
    if first != 4:
        raise SystemExit(f"{path}: bad asar magic ({first})")
    if json_size <= 0 or 16 + json_size > len(raw):
        raise SystemExit(f"{path}: bad asar json size ({json_size})")
    aligned = (json_size + 3) // 4 * 4
    if 8 + aligned != header_size or 4 + aligned != second:
        raise SystemExit(
            f"{path}: header math mismatch (header_size={header_size}, "
            f"second={second}, aligned={aligned})"
        )
    header = json.loads(raw[16:16 + json_size].decode("utf-8"))
    body = raw[16 + aligned:]
    return header, body, json_size


def walk(node, prefix=""):
    for name, entry in node.get("files", {}).items():
        path = prefix + "/" + name
        if "files" in entry:
            yield from walk(entry, path)
        else:
            yield path, entry


def find_node(header, asar_path):
    node = header
    for part in asar_path.strip("/").split("/"):
        children = node.get("files")
        if not children or part not in children:
            return None
        node = children[part]
    return node


def set_entry(header, asar_path, entry):
    parts = asar_path.strip("/").split("/")
    node = header
    for part in parts[:-1]:
        children = node.setdefault("files", {})
        nxt = children.get(part)
        if nxt is None or "files" not in nxt:
            nxt = {"files": {}}
            children[part] = nxt
        node = nxt
    node.setdefault("files", {})[parts[-1]] = entry


def pack(header, body: bytes, extra: bytes) -> bytes:
    json_bytes = json.dumps(header, separators=(",", ":")).encode("utf-8")
    padding = (4 - len(json_bytes) % 4) % 4
    json_padded = json_bytes + b"\x00" * padding
    aligned = len(json_padded)
    prefix = struct.pack("<IIII", 4, 8 + aligned, 4 + aligned, len(json_bytes))
    return prefix + json_padded + body + extra


def cmd_list(src: str) -> None:
    header, body, _ = load(src)
    files = dict(walk(header))
    unpacked = [p for p, e in files.items() if e.get("unpacked")]
    print(f"entries       : {len(files)}")
    print(f"unpacked      : {len(unpacked)}")
    print(f"data bytes    : {len(body)}")
    packed = [(p, e) for p, e in files.items() if not e.get("unpacked")]
    if packed:
        end = max(int(e["offset"]) + int(e["size"]) for _, e in packed)
        print(f"max end offset: {end}")
    for path in sorted(files):
        if path.startswith("/out/renderer/rtl-fa") \
                or path.startswith("/out/renderer/assets/vazirmatn") \
                or path == "/out/renderer/index.html":
            print(f"  {path}  size={files[path].get('size')} "
                  f"offset={files[path].get('offset')}")


def cmd_extract(src: str, asar_path: str, out_path: str) -> None:
    header, body, _ = load(src)
    if not asar_path.startswith("/"):
        asar_path = "/" + asar_path
    entry = find_node(header, asar_path)
    if entry is None or "files" in entry:
        raise SystemExit(f"{asar_path}: not a file entry")
    if entry.get("unpacked"):
        raise SystemExit(f"{asar_path}: unpacked entry, read app.asar.unpacked instead")
    start = int(entry["offset"])
    data = body[start:start + int(entry["size"])]
    with open(out_path, "wb") as fh:
        fh.write(data)
    print(f"extracted {asar_path} -> {out_path} ({len(data)} bytes)")


def main() -> None:
    parser = argparse.ArgumentParser(description="Surgical asar patcher")
    parser.add_argument("src")
    parser.add_argument("dst", nargs="?")
    parser.add_argument("--list", action="store_true")
    parser.add_argument("--hash", action="store_true",
                        help="print the ElectronAsarIntegrity SHA256 of the header")
    parser.add_argument("--extract", metavar="ASAR_PATH=OUT_FILE",
                        help="write one packed entry out to a local file")
    parser.add_argument("--replace", action="append", default=[],
                        help="ASAR_PATH=LOCAL_FILE (target must already exist)")
    parser.add_argument("--add", action="append", default=[],
                        help="ASAR_PATH=LOCAL_FILE (must be a new file)")
    args = parser.parse_args()

    if args.list:
        cmd_list(args.src)
        return
    if args.hash:
        with open(args.src, "rb") as fh:
            raw = fh.read(16)
            _first, _header_size, _second, json_size = struct.unpack("<IIII", raw)
            print(hashlib.sha256(fh.read(json_size)).hexdigest())
        return
    if args.extract:
        if "=" not in args.extract:
            parser.error("--extract expects ASAR_PATH=OUT_FILE")
        asar_path, out_path = args.extract.split("=", 1)
        cmd_extract(args.src, asar_path, out_path)
        return
    if not args.dst:
        parser.error("dst.asar is required unless --list/--extract is used")
    if not args.replace and not args.add:
        parser.error("nothing to do: pass --replace and/or --add")

    header, body, _ = load(args.src)

    touched = {}
    for kind, items in (("replace", args.replace), ("add", args.add)):
        for item in items:
            if "=" not in item:
                raise SystemExit(f"--{kind} expects ASAR_PATH=LOCAL_FILE, got {item!r}")
            asar_path, local = item.split("=", 1)
            if not asar_path.startswith("/"):
                asar_path = "/" + asar_path
            if not os.path.isfile(local):
                raise SystemExit(f"missing local file: {local}")
            existing = find_node(header, asar_path)
            if kind == "replace" and (existing is None or "files" in existing):
                raise SystemExit(f"--replace target does not exist: {asar_path}")
            if kind == "add" and existing is not None:
                raise SystemExit(f"--add target already exists: {asar_path}")
            with open(local, "rb") as fh:
                touched[asar_path] = fh.read()

    # Append the new payload right after the untouched original data section.
    cursor = len(body)
    chunks = bytearray()
    for asar_path in sorted(touched):
        data = touched[asar_path]
        set_entry(header, asar_path, {
            "size": len(data),
            "offset": str(cursor),
            "integrity": make_integrity(data),
        })
        chunks += data
        cursor += len(data)

    out = pack(header, body, bytes(chunks))
    with open(args.dst, "wb") as fh:
        fh.write(out)

    print(f"patched {len(touched)} file(s): {', '.join(sorted(touched))}")
    print(f"{args.src} -> {args.dst}  ({len(out)} bytes, "
          f"+{len(out) - os.path.getsize(args.src)})")


if __name__ == "__main__":
    sys.exit(main())
