// Classifies an ffmpeg command line seen in the Jellyscale container (T2-09 milestone 1 recorded two kinds).
// A command the rule does not recognise counts as a transcode, so an unknown ffmpeg fails the row: a false alarm,
// never a missed job.
//
// Recognised as other work: Jellyscale's subtitle conversion, which reads a subtitle file it staged under
// /tmp/subtitles-N/ and writes track files beside it (it runs when a film with a sidecar or embedded text subtitle
// plays, and adds no transcode_jobs row). Never HLS output, which is a transcode whatever it reads.
const SUBTITLE_CONVERSION = /^\S*ffmpeg\s(?:\S+\s)*?-i\s+\/tmp\/subtitles-\d+\/input\.\w+\s(?:-map\s+\S+\s+\/tmp\/subtitles-\d+\/\S+\s*)+$/;

export function classifyJellyscaleFfmpeg(commandLine: string): "transcode" | "other" {
  const line = commandLine.trim();
  if (/\s-f\s+hls\b|jellyscale-transcode/.test(line)) return "transcode";
  return SUBTITLE_CONVERSION.test(line) ? "other" : "transcode";
}
