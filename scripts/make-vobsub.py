#!/usr/bin/env python3
"""Writes a synthetic VobSub pair (<base>.idx and <base>.sub) with two cues.

Every pixel is generated here, so no third-party media is involved. ffmpeg has no
text-to-bitmap subtitle encoder, so this builds the DVD subpicture packets directly:
SPU RLE bitmaps inside MPEG-PS private stream 1 packets (substream 0x20).
Usage: make-vobsub.py <output base path without extension>
"""
import struct
import sys

WIDTH, HEIGHT = 640, 360
BOX_X, BOX_Y, BOX_W, BOX_H = 120, 280, 400, 40  # box height must be even


def rle_line(width):
    # 100 transparent pixels (color 0), 200 solid (color 1), then color 0 to the end of the line.
    nibbles = []

    def run(count, color):
        value = (count << 2) | color
        if count < 4:
            nibbles.append(value)
        elif count < 16:
            nibbles.extend([value >> 4, value & 15])
        elif count < 64:
            nibbles.extend([value >> 8, (value >> 4) & 15, value & 15])
        else:
            nibbles.extend([value >> 12, (value >> 8) & 15, (value >> 4) & 15, value & 15])

    run(100, 0)
    run(200, 1)
    nibbles.extend([0, 0, 0, 0])  # count 0: fill to the end of the line with color 0
    if len(nibbles) % 2:
        nibbles.append(0)
    return bytes((nibbles[i] << 4) | nibbles[i + 1] for i in range(0, len(nibbles), 2))


def spu(start_delay_cs, stop_delay_cs):
    field = rle_line(BOX_W) * (BOX_H // 2)
    top_offset = 4
    bottom_offset = top_offset + len(field)
    data = field + field
    dcsq_offset = 4 + len(data)
    x2, y2 = BOX_X + BOX_W - 1, BOX_Y + BOX_H - 1
    coords = struct.pack(">BBBBBB", BOX_X >> 4, ((BOX_X & 15) << 4) | (x2 >> 8), x2 & 255,
                         BOX_Y >> 4, ((BOX_Y & 15) << 4) | (y2 >> 8), y2 & 255)
    first = b"\x01" + b"\x03\x01\x00" + b"\x04\x0f\xf0" + b"\x05" + coords
    first += b"\x06" + struct.pack(">HH", top_offset, bottom_offset) + b"\xff"
    second_offset = dcsq_offset + 4 + len(first)
    first = struct.pack(">HH", start_delay_cs, second_offset) + first
    second = struct.pack(">HH", stop_delay_cs, second_offset) + b"\x02\xff"
    body = data + first + second
    return struct.pack(">HH", 4 + len(body), dcsq_offset) + body


def ps_packet(payload, pts_90khz):
    pack = b"\x00\x00\x01\xba" + bytes([0x44, 0x00, 0x04, 0x00, 0x04, 0x01, 0x01, 0x89, 0xc3, 0xf8])
    pts = pts_90khz
    pts_bytes = bytes([
        0x21 | ((pts >> 29) & 0x0e), (pts >> 22) & 0xff, 0x01 | ((pts >> 14) & 0xfe),
        (pts >> 7) & 0xff, 0x01 | ((pts << 1) & 0xfe),
    ])
    inner = b"\x20" + payload  # substream id 0x20 = subpicture stream 0
    header = bytes([0x81, 0x80, 5]) + pts_bytes
    length = len(header) + len(inner)
    return pack + b"\x00\x00\x01\xbd" + struct.pack(">H", length) + header + inner


def main(base):
    cues = [(1.0, 4.0), (5.0, 9.0)]
    sub = bytearray()
    idx = [
        "# VobSub index file, v7 (do not modify this line!)",
        f"size: {WIDTH}x{HEIGHT}",
        "palette: 000000, ffffff, 000000, 000000, 000000, 000000, 000000, 000000, "
        "000000, 000000, 000000, 000000, 000000, 000000, 000000, 000000",
        "langidx: 0",
        "",
        "id: en, index: 0",
    ]
    for start, stop in cues:
        pos = len(sub)
        total = int(start * 1000)
        h, rest = divmod(total, 3600000)
        m, rest = divmod(rest, 60000)
        s, ms = divmod(rest, 1000)
        idx.append(f"timestamp: {h:02d}:{m:02d}:{s:02d}:{ms:03d}, filepos: {pos:09x}")
        sub += ps_packet(spu(0, int((stop - start) * 100)), int(start * 90000))
    with open(base + ".sub", "wb") as handle:
        handle.write(bytes(sub))
    with open(base + ".idx", "w", encoding="ascii") as handle:
        handle.write("\n".join(idx) + "\n")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: make-vobsub.py <base path>")
    main(sys.argv[1])
