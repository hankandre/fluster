#!/usr/bin/env bash
# Generates the synthetic sample media under tests/samples with ffmpeg.
# Only ffmpeg lavfi sources are used, so no third-party media is involved.
# Safe to re-run: existing samples are skipped. Use --force to regenerate.
#
# Layout follows the Jellyfin naming docs:
#   https://jellyfin.org/docs/general/server/media/movies/
#   https://jellyfin.org/docs/general/server/media/shows/
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
samples_dir="$script_dir/../tests/samples"
movies_dir="$samples_dir/movies"
shows_dir="$samples_dir/shows"

force=0
case "${1:-}" in
  "") ;;
  --force) force=1 ;;
  *) echo "usage: $0 [--force]" >&2; exit 2 ;;
esac

for tool in ffmpeg ffprobe; do
  command -v "$tool" > /dev/null || { echo "$tool is required" >&2; exit 1; }
done

duration=10
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

# Every ffmpeg call is quiet and bit-exact where possible.
ff() {
  local out="${*: -1}"
  ffmpeg -hide_banner -loglevel error -y -nostdin "${@:1:$#-1}" \
    -fflags +bitexact -flags:v +bitexact -flags:a +bitexact "$out"
}

# Video sources. The test pattern moves, so the picture is never static.
pattern() { echo "testsrc2=size=${1:-640x360}:rate=24:duration=$duration"; }
bars() { echo "smptehdbars=size=${1:-640x360}:rate=24:duration=$duration"; }
tone() { echo "sine=frequency=${1:-440}:sample_rate=48000:duration=$duration"; }

# Returns success when the sample must be built.
needs() {
  [ "$force" -eq 1 ] || [ ! -e "$1" ]
}

# Builds one sample. Arguments: output path, then ffmpeg arguments.
# The file is written to a temporary name first so a failed run leaves no partial sample.
build() {
  local out="$1"
  shift
  if ! needs "$out"; then
    echo "skip   ${out#"$samples_dir"/}"
    return 0
  fi
  mkdir -p "$(dirname "$out")"
  local tmp="$work_dir/$(basename "$out")"
  if ! ff "$@" "$tmp" 2> "$work_dir/ffmpeg.log"; then
    cat "$work_dir/ffmpeg.log" >&2
    echo "ffmpeg failed for $out" >&2
    exit 1
  fi
  mv "$tmp" "$out"
  echo "made   ${out#"$samples_dir"/}"
}

h264_args=(-c:v libx264 -preset veryfast -crf 28 -pix_fmt yuv420p -profile:v high)
aac_stereo=(-c:a aac -b:a 64k -ac 2)

# ---- Movies -----------------------------------------------------------------

h264="$movies_dir/Synthetic H264 (2024)/Synthetic H264 (2024).mkv"
build "$h264" \
  -f lavfi -i "$(pattern)" -f lavfi -i "$(tone 440)" \
  "${h264_args[@]}" "${aac_stereo[@]}" -metadata:s:a:0 language=eng -shortest

# HDR10: BT.2020 primaries, PQ transfer, mastering display and content light level.
hevc="$movies_dir/Synthetic HEVC HDR10 (2024)/Synthetic HEVC HDR10 (2024).mkv"
build "$hevc" \
  -f lavfi -i "$(bars 1280x720)" -f lavfi -i "$(tone 440)" \
  -vf "setparams=color_primaries=bt2020:color_trc=smpte2084:colorspace=bt2020nc:range=tv" \
  -c:v libx265 -preset veryfast -crf 28 -pix_fmt yuv420p10le -profile:v main10 \
  -x265-params "log-level=error:hdr10=1:repeat-headers=1:colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc:range=limited:master-display=G(13250,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L(10000000,1):max-cll=1000,400" \
  "${aac_stereo[@]}" -metadata:s:a:0 language=eng -shortest

av1="$movies_dir/Synthetic AV1 (2024)/Synthetic AV1 (2024).mkv"
build "$av1" \
  -f lavfi -i "$(pattern)" -f lavfi -i "$(tone 440)" \
  -c:v libsvtav1 -preset 10 -crf 38 -pix_fmt yuv420p10le \
  "${aac_stereo[@]}" -metadata:s:a:0 language=eng -shortest

# Styled ASS subtitle, embedded in the mkv.
ass_file="$work_dir/styled.ass"
cat > "$ass_file" <<'ASS'
[Script Info]
ScriptType: v4.00+
PlayResX: 640
PlayResY: 360

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,DejaVu Sans,28,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,10,10,20,1
Style: Sign,DejaVu Sans,36,&H0000FFFF,&H000000FF,&H00000000,&H80000000,-1,1,0,0,100,100,0,0,1,3,0,8,10,10,20,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,Styled {\i1}ASS{\i0} line one
Dialogue: 0,0:00:05.00,0:00:09.00,Sign,,0,0,0,,{\an8\c&H00FFFF&}Positioned sign text
ASS
ass="$movies_dir/Synthetic ASS (2024)/Synthetic ASS (2024).mkv"
build "$ass" \
  -f lavfi -i "$(pattern)" -f lavfi -i "$(tone 440)" -i "$ass_file" \
  -map 0:v -map 1:a -map 2:s "${h264_args[@]}" "${aac_stereo[@]}" -c:s ass \
  -metadata:s:a:0 language=eng -metadata:s:s:0 language=eng -metadata:s:s:0 title=Styled -t $duration

# External subtitle: Jellyfin reads <video name>.<language>.srt next to the video.
sidecar_dir="$movies_dir/Synthetic Sidecar (2024)"
build "$sidecar_dir/Synthetic Sidecar (2024).mkv" \
  -f lavfi -i "$(pattern)" -f lavfi -i "$(tone 440)" \
  "${h264_args[@]}" "${aac_stereo[@]}" -metadata:s:a:0 language=eng -shortest
srt="$sidecar_dir/Synthetic Sidecar (2024).en.srt"
if needs "$srt"; then
  cat > "$srt" <<'SRT'
1
00:00:01,000 --> 00:00:04,000
External subtitle line one

2
00:00:05,000 --> 00:00:09,000
External subtitle line two
SRT
  echo "made   ${srt#"$samples_dir"/}"
else
  echo "skip   ${srt#"$samples_dir"/}"
fi

# Two audio tracks: English stereo AAC and Spanish 5.1 AC-3.
multi="$movies_dir/Synthetic Multitrack (2024)/Synthetic Multitrack (2024).mkv"
build "$multi" \
  -f lavfi -i "$(pattern)" -f lavfi -i "$(tone 440)" -f lavfi -i "$(tone 880)" \
  -map 0:v -map 1:a -map 2:a "${h264_args[@]}" \
  -c:a:0 aac -b:a:0 64k -ac:a:0 2 -metadata:s:a:0 language=eng -metadata:s:a:0 title="English stereo" \
  -c:a:1 ac3 -b:a:1 192k -ac:a:1 6 -metadata:s:a:1 language=spa -metadata:s:a:1 title="Spanish 5.1" \
  -disposition:a:0 default -disposition:a:1 0 -shortest

# Multiple versions: two files in one movie folder, each starting with the folder
# name plus " - <label>" (Jellyfin movie naming docs, "Multiple Versions"; labels
# ending in p or i are sorted as resolutions).
versions_dir="$movies_dir/Synthetic Versions (2024)"
versions_1080="$versions_dir/Synthetic Versions (2024) - 1080p.mkv"
versions_720="$versions_dir/Synthetic Versions (2024) - 720p.mkv"
build "$versions_1080" \
  -f lavfi -i "$(pattern 1920x1080)" -f lavfi -i "$(tone 440)" \
  "${h264_args[@]}" "${aac_stereo[@]}" -metadata:s:a:0 language=eng -shortest
build "$versions_720" \
  -f lavfi -i "$(pattern 1280x720)" -f lavfi -i "$(tone 440)" \
  "${h264_args[@]}" "${aac_stereo[@]}" -metadata:s:a:0 language=eng -shortest

# BluRay folder. Jellyfin only checks that the movie folder holds a directory named
# BDMV (BaseVideoResolver.IsBluRayDirectory). The index files are placeholders; the
# stream is real H.264 in MPEG-TS so ffprobe can still read it.
bd_dir="$movies_dir/Synthetic BluRay (2024)/BDMV"
bd_stream="$bd_dir/STREAM/00000.m2ts"
build "$bd_stream" \
  -f lavfi -i "$(pattern 1280x720)" -f lavfi -i "$(tone 440)" \
  "${h264_args[@]}" -c:a ac3 -b:a 192k -ac 2 -metadata:s:a:0 language=eng -shortest -f mpegts
mkdir -p "$bd_dir/PLAYLIST" "$bd_dir/CLIPINF"
[ -e "$bd_dir/index.bdmv" ] && [ "$force" -eq 0 ] || printf 'INDX0200' > "$bd_dir/index.bdmv"
[ -e "$bd_dir/MovieObject.bdmv" ] && [ "$force" -eq 0 ] || printf 'MOBJ0200' > "$bd_dir/MovieObject.bdmv"

# DVD subtitle (graphical, S_VOBSUB). ffmpeg cannot encode text to bitmap, so
# scripts/make-vobsub.py writes a synthetic VobSub pair that ffmpeg copies into the mkv.
vobsub_base="$work_dir/synthetic-vobsub"
python3 -I "$script_dir/make-vobsub.py" "$vobsub_base"
dvdsub="$movies_dir/Synthetic DVDSub (2024)/Synthetic DVDSub (2024).mkv"
build "$dvdsub" \
  -f lavfi -i "$(pattern)" -f lavfi -i "$(tone 440)" -i "$vobsub_base.idx" \
  -map 0:v -map 1:a -map 2:s "${h264_args[@]}" "${aac_stereo[@]}" -c:s copy \
  -metadata:s:a:0 language=eng -metadata:s:s:0 language=eng -t $duration

# ISO image holding a synthetic BDMV tree (the BluRay folder's stream). Jellyfin treats any
# .iso as VideoType Iso. Needs xorriso, genisoimage, or mkisofs locally; otherwise an Alpine
# container with xorriso is used (docker is already required by pnpm fixture:up). If neither
# works the ISO is skipped with a message, and the plan records why.
iso="$movies_dir/Synthetic ISO (2024)/Synthetic ISO (2024).iso"
make_iso() {
  local out="$1" tree="$work_dir/iso-tree"
  rm -rf "$tree" && mkdir -p "$tree" "$(dirname "$out")"
  cp -r "$bd_dir" "$tree/BDMV"
  if command -v xorriso > /dev/null; then
    xorriso -as mkisofs -quiet -V SYNTHETIC_ISO -o "$out" "$tree"
  elif command -v genisoimage > /dev/null; then
    genisoimage -quiet -V SYNTHETIC_ISO -o "$out" "$tree"
  elif command -v mkisofs > /dev/null; then
    mkisofs -quiet -V SYNTHETIC_ISO -o "$out" "$tree"
  elif command -v docker > /dev/null; then
    docker run --rm -v "$work_dir:/work:ro" -v "$(dirname "$out"):/out" alpine:3 sh -c \
      'apk add -q --no-cache xorriso > /dev/null && xorriso -as mkisofs -quiet -V SYNTHETIC_ISO -o "/out/$1" /work/iso-tree && chown "$2" "/out/$1"' \
      _ "$(basename "$out")" "$(id -u):$(id -g)"
  else
    return 1
  fi
}
if needs "$iso"; then
  if make_iso "$iso"; then
    echo "made   ${iso#"$samples_dir"/}"
  else
    echo "skip   ${iso#"$samples_dir"/} (no ISO tool: install xorriso, genisoimage, or mkisofs, or docker)" >&2
  fi
else
  echo "skip   ${iso#"$samples_dir"/}"
fi

# ---- Shows ------------------------------------------------------------------

show_dir="$shows_dir/Synthetic Show"
episode() {
  local out="$1" freq="$2"
  build "$out" \
    -f lavfi -i "$(pattern 320x180)" -f lavfi -i "$(tone "$freq")" \
    "${h264_args[@]}" "${aac_stereo[@]}" -metadata:s:a:0 language=eng -shortest
}
episode "$show_dir/Season 01/Synthetic Show S01E01.mkv" 330
episode "$show_dir/Season 01/Synthetic Show S01E02.mkv" 392
# Season 00 holds specials; the browse screen hides or defaults them (P3-06).
episode "$show_dir/Season 00/Synthetic Show S00E01.mkv" 262

# ---- Verify -----------------------------------------------------------------

echo
printf '%-34s %-6s %-8s %-12s %-10s %s\n' SAMPLE CODEC PROFILE PIX_FMT TRANSFER STREAMS
probe() {
  local file="$1" label="$2"
  local v codec profile pix transfer streams
  v="$(ffprobe -v error -select_streams v:0 \
    -show_entries stream=codec_name,profile,pix_fmt,color_transfer -of csv=p=0 "$file")"
  IFS=, read -r codec profile pix transfer <<< "$v"
  streams="$(ffprobe -v error -show_entries stream=codec_type,codec_name:stream_tags=language \
    -of compact "$file" | grep '^stream|' | sed -e 's/^stream|//' -e 's/codec_name=//' \
    -e 's/|codec_type=/:/' -e 's/|tag:language=/:/' | tr '\n' ' ')"
  printf '%-34s %-6s %-8s %-12s %-10s %s\n' "$label" "$codec" "$profile" "$pix" "${transfer:--}" "$streams"
}
probe "$h264" "h264"
probe "$hevc" "hevc-main10-hdr10"
probe "$av1" "av1"
probe "$ass" "ass"
probe "$sidecar_dir/Synthetic Sidecar (2024).mkv" "sidecar (+ .en.srt)"
probe "$multi" "multitrack"
probe "$versions_1080" "versions 1080p"
probe "$versions_720" "versions 720p"
probe "$bd_stream" "bluray m2ts"
probe "$dvdsub" "dvdsub"
probe "$show_dir/Season 01/Synthetic Show S01E01.mkv" "show S01E01"

# Fail loudly if the properties the samples exist for are missing.
fail() { echo "verification failed: $1" >&2; exit 1; }
probe_value() { ffprobe -v error -select_streams "$2" -show_entries "$3" -of csv=p=0 "$1"; }
[ "$(probe_value "$hevc" v:0 stream=profile)" = "Main 10" ] || fail "HEVC is not Main 10"
[ "$(probe_value "$hevc" v:0 stream=color_transfer)" = "smpte2084" ] || fail "HEVC transfer is not PQ"
[ "$(probe_value "$av1" v:0 stream=codec_name)" = "av1" ] || fail "AV1 codec missing"
[ "$(probe_value "$ass" s:0 stream=codec_name)" = "ass" ] || fail "ASS track missing"
[ "$(probe_value "$multi" a stream=codec_name | tr '\n' ' ')" = "aac ac3 " ] || fail "multitrack audio missing"
[ -f "$sidecar_dir/Synthetic Sidecar (2024).en.srt" ] || fail "srt sidecar missing"
[ -f "$versions_1080" ] && [ -f "$versions_720" ] || fail "multi-version files missing"
[ -f "$bd_dir/index.bdmv" ] || fail "BDMV index missing"
[ "$(probe_value "$dvdsub" s:0 stream=codec_name)" = "dvd_subtitle" ] || fail "dvdsub track missing"
echo
echo "All samples verified."
