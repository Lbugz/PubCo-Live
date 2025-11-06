export interface TrackData {
  playlistName: string;
  label: string | null;
  publisher?: string | null;
  writer?: string | null;
}

const RUBRIC = {
  freshFinds: 3,
  drokit: 2,
  missingPublisher: 3,
  missingWriter: 2,
  majorLabel: -3,
};

export function calculateUnsignedScore(track: TrackData): number {
  let score = 0;

  if (track.playlistName.toLowerCase().includes("fresh finds")) {
    score += RUBRIC.freshFinds;
  }

  if (track.label && /\b(DK|DIY|indie|independent)\b/i.test(track.label)) {
    score += RUBRIC.drokit;
  }

  if (!track.publisher) {
    score += RUBRIC.missingPublisher;
  }

  if (!track.writer) {
    score += RUBRIC.missingWriter;
  }

  if (track.label && /(Sony|Warner|Universal|Columbia|Atlantic|Capitol|RCA|Def Jam|Interscope)/i.test(track.label)) {
    score += RUBRIC.majorLabel;
  }

  return Math.max(0, Math.min(10, score));
}
