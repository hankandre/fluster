#!/usr/bin/env bash
# Makes a synthetic HDR10 test clip for the mock server (nothing copyrighted): HEVC Main10,
# BT.2020 / SMPTE 2084 with mastering-display and content-light metadata, AAC stereo, in MKV.
#   scripts/make-sample.sh [seconds] [WxH]
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
secs="${1:-150}"
size="${2:-1920x1080}"
# BITS=8 makes an 8-bit HEVC Main clip (same tags) for emulators whose decoder lacks Main10.
bits="${BITS:-10}"
if [ "$bits" = 8 ]; then pix=yuv420p; prof=main; name=sample-hevc8; else pix=yuv420p10le; prof=main10; name=sample-hdr10; fi
mkdir -p "$here/media"
ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "testsrc2=size=${size}:rate=24,format=${pix},setparams=color_primaries=bt2020:color_trc=smpte2084:colorspace=bt2020nc:range=tv" \
  -f lavfi -i "sine=frequency=440:sample_rate=48000" \
  -t "$secs" \
  -c:v libx265 -preset fast -crf 24 -pix_fmt ${pix} -profile:v ${prof} -tag:v hvc1 \
  -color_primaries bt2020 -color_trc smpte2084 -colorspace bt2020nc -color_range tv \
  -x265-params "hdr10=1:repeat-headers=1:colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc:master-display=G(13250,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L(10000000,1):max-cll=1000,400:log-level=error" \
  -c:a aac -b:a 128k -ac 2 \
  "$here/media/${name}.mkv"
ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,profile,pix_fmt,color_transfer,color_primaries,width,height -of default=nw=1 "$here/media/${name}.mkv"
