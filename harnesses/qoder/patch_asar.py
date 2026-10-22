#!/usr/bin/env python3
"""Surgical asar patcher for Qoder-RTL.
Preserves unpacked entries/links; replaces/adds only packed files.
Usage: patch_asar.py <src.asar> <dst.asar> --replace OUT=FILE ... --add ASAR_PATH=FILE ...
Also updates SHA256 integrity for touched files.
"""
import struct, json, hashlib, sys, os

def load_asar(path):
    with open(path, 'rb') as f:
        raw16 = f.read(16)
        a, header_size, header_json_size2, json_size = struct.unpack('<IIII', raw16)
        assert a == 4, raw16
        json_raw = f.read(json_size)
        header = json.loads(json_raw.decode('utf-8'))
        # header_size includes 16-byte prefix? data starts at header_size?
        # header_size = 1155536, json_size=1155527, 16+? Let's compute data offset:
        # Electron asar: [4B header_size_field][4B aligned header size][4B json size?][4B json size?]... simplest: data starts at header_size
        # Verify: header_size=1155536, we consumed 16+json_size=16+1155527=1155543. Hmm 1155543 != 1155536.
        # Actual spec: first 4 bytes (UInt32=4) = size of next UInt32? Then 4 bytes header size (including these 8?)...
        # Let's detect: try both candidates and validate by reading first file at offset 0.
        data_start_candidates = [header_size, 16 + json_size, 8 + json_size]
        rest = f.read()
        # We'll return all and let caller pick by validating offsets
        return header, json_size, rest, header_size

def get_data_start(header_size, json_size):
    # Verified empirically on Qoder 0.1.4 asar (fields 4,1155536,1155532,1155527):
    # data begins with b'MIT License...' at 16 + 4-byte-aligned(json_size).
    aligned = (json_size + 3) // 4 * 4
    return 16 + aligned

def collect_files(node, prefix=''):
    out = {}
    for name, entry in node.get('files', {}).items():
        p = prefix + '/' + name if prefix else '/' + name
        if 'files' in entry:
            out.update(collect_files(entry, p))
        else:
            out[p] = entry
    return out

BLOCK_SIZE = 4194304

def file_integrity(b):
    """Electron asar integrity: 'hash' is the whole-file SHA256, while
    'blocks' holds one SHA256 per blockSize chunk (not the whole-file hash)."""
    blocks = [hashlib.sha256(b[i:i + BLOCK_SIZE]).hexdigest()
              for i in range(0, len(b), BLOCK_SIZE)]
    return {'algorithm': 'SHA256', 'hash': hashlib.sha256(b).hexdigest(),
            'blockSize': BLOCK_SIZE, 'blocks': blocks}

def set_entry(header, asar_path, entry):
    parts = asar_path.strip('/').split('/')
    node = header
    for part in parts[:-1]:
        files = node.setdefault('files', {})
        nxt = files.get(part)
        if nxt is None or 'files' not in nxt:
            nxt = {'files': {}}
            files[part] = nxt
        node = nxt
    node.setdefault('files', {})[parts[-1]] = entry

def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('dst')
    ap.add_argument('--replace', action='append', default=[])
    ap.add_argument('--add', action='append', default=[])
    ap.add_argument('--add-raw', action='append', default=[])  # ASAR_PATH:STRING_CONTENT
    args = ap.parse_args()

    header, json_size, rest, header_size = load_asar(args.src)
    data_start = get_data_start(header_size, json_size)
    # rest = file data AFTER json (we read from after json). But data starts at header_size,
    # and we consumed 16+json_size bytes, so need to adjust:
    consumed = 16 + json_size
    # if data_start > consumed, skip padding; if < consumed, we over-read (shouldn't happen)
    if data_start > consumed:
        # rest starts with padding
        pad = data_start - consumed
        data = rest[pad:]
    elif data_start < consumed:
        raise SystemExit(f'header math wrong: data_start={data_start} consumed={consumed}')
    else:
        data = rest

    files = collect_files(header)

    # read original bytes for packed files
    orig_bytes = {}
    for p, e in files.items():
        if e.get('unpacked') or 'link' in e:
            continue
        off = int(e['offset'])
        sz = int(e['size'])
        orig_bytes[p] = data[off:off+sz]

    # apply replacements/additions
    touched = {}
    for item in args.replace:
        asar_path, local = item.split('=', 1)
        if not asar_path.startswith('/'):
            asar_path = '/' + asar_path
        with open(local, 'rb') as f:
            touched[asar_path] = f.read()
    for item in args.add:
        asar_path, local = item.split('=', 1)
        if not asar_path.startswith('/'):
            asar_path = '/' + asar_path
        with open(local, 'rb') as f:
            touched[asar_path] = f.read()

    for p, b in touched.items():
        entry = {'size': len(b), 'integrity': file_integrity(b)}
        set_entry(header, p, entry)

    # rebuild data: iterate files in sorted order for determinism, assign offsets
    files2 = collect_files(header)
    packed_paths = sorted([p for p, e in files2.items() if not e.get('unpacked') and 'link' not in e])
    new_data = bytearray()
    offset = 0
    for p in packed_paths:
        if p in touched:
            b = touched[p]
        elif p in orig_bytes:
            b = orig_bytes[p]
        else:
            raise SystemExit(f'missing bytes for {p}')
        # update entry offset/size/integrity
        parts = p.strip('/').split('/')
        node = header
        for part in parts[:-1]:
            node = node['files'][part]
        ent = node['files'][parts[-1]]
        ent['offset'] = str(offset)
        ent['size'] = len(b)
        if 'integrity' not in ent or p in touched:
            ent['integrity'] = file_integrity(b)
        new_data += b
        offset += len(b)

    json_str = json.dumps(header, separators=(',', ':'))
    json_bytes = json_str.encode('utf-8')
    # asar header layout: [UInt32:4][UInt32:header_size][UInt32:header_size-8?][UInt32:json_size][json][padding to 4?]
    # Reconstruct exactly like @electron/asar: header_size = 8 + aligned json size? Let's mimic:
    # Pad json to 4-byte alignment with NULs.
    pad_len = (4 - (len(json_bytes) % 4)) % 4
    json_padded = json_bytes + b'\x00' * pad_len
    aligned_size = len(json_padded)
    # header_size field = 8 + aligned_size? Check with original: aligned json? 1155527 %4 = 3, pad=1 -> aligned=1155528. 8+1155528=1155536 == header_size! Yes.
    new_header_size = 8 + aligned_size
    with open(args.dst, 'wb') as out:
        out.write(struct.pack('<I', 4))
        out.write(struct.pack('<I', new_header_size))   # == 8 + aligned
        out.write(struct.pack('<I', 4 + aligned_size))  # == 4 + aligned
        out.write(struct.pack('<I', len(json_bytes)))   # raw json len
        out.write(json_padded)
        out.write(new_data)
    print(f'patched {len(touched)} files -> {args.dst} ({os.path.getsize(args.dst)} bytes)')

if __name__ == '__main__':
    main()
