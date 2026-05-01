export interface RunAnalysis {
  trainingType: string;   // "Trening interwałowy", "Bieg tempo", etc.
  typeColor:    string;   // CSS color for badge
  summary:      string;   // full description string
  confidence:   'high' | 'medium' | 'low';
}

type PaceClass = 'fast' | 'medium' | 'slow' | 'stop';

interface Seg {
  cls:        PaceClass;
  distM:      number;
  timeSec:    number;
  startDistM: number;
  avgVelMs:   number;
}

function smooth(arr: number[], w = 12): number[] {
  return arr.map((_, i) => {
    const sl = arr.slice(Math.max(0, i - w), Math.min(arr.length, i + w + 1));
    return sl.reduce((s, v) => s + v, 0) / sl.length;
  });
}

function fmtPace(minPerKm: number): string {
  const m = Math.floor(minPerKm);
  const s = Math.round((minPerKm - m) * 60);
  return `${m}:${String(s).padStart(2, '0')}/km`;
}

function fmtDist(m: number): string {
  return m < 950 ? `${Math.round(m / 10) * 10}m` : `${(m / 1000).toFixed(1)}km`;
}

function fmtTime(sec: number): string {
  const m = Math.round(sec / 60);
  return m > 0 ? `${m}min` : `${Math.round(sec)}s`;
}

export function analyzeRunStream(
  time:     number[],
  distance: number[],
  velocity: number[],
): RunAnalysis | null {
  if (velocity.length < 20 || distance.length < 20) return null;

  const sm    = smooth(velocity, 15);
  const total = distance[distance.length - 1] ?? 0;
  if (total < 500) return null; // < 500m — skip

  // Pace percentiles (exclude stopped points)
  const runningVel = sm.filter(v => v > 0.8); // > ~3 km/h
  if (runningVel.length < 10) return null;

  const sorted = [...runningVel].sort((a, b) => b - a); // descending speed
  const p10  = sorted[Math.floor(sorted.length * 0.10)]; // fast (top 10%)
  const p50  = sorted[Math.floor(sorted.length * 0.50)]; // median
  const p80  = sorted[Math.floor(sorted.length * 0.80)]; // slow

  const fastThresh = (p10 + p50) / 2;   // faster than this = "fast"
  const slowThresh = (p50 + p80) / 2;   // slower than this = "slow"

  const classify = (v: number): PaceClass => {
    if (v < 0.6) return 'stop';
    if (v > fastThresh) return 'fast';
    if (v < slowThresh) return 'slow';
    return 'medium';
  };

  // Segment the run
  const rawSegs: Array<{ cls: PaceClass; from: number; to: number }> = [];
  let cls = classify(sm[0]);
  let from = 0;
  for (let i = 1; i < sm.length; i++) {
    const c = classify(sm[i]);
    if (c !== cls) { rawSegs.push({ cls, from, to: i - 1 }); cls = c; from = i; }
  }
  rawSegs.push({ cls, from, to: sm.length - 1 });

  // Build segments with distance/time
  const segs: Seg[] = rawSegs.map(r => {
    const distM   = (distance[r.to] ?? 0) - (distance[r.from] ?? 0);
    const timeSec = (time[r.to]     ?? 0) - (time[r.from]     ?? 0);
    const avgVel  = distM > 0 && timeSec > 0 ? distM / timeSec : 0;
    return { cls: r.cls, distM, timeSec, startDistM: distance[r.from] ?? 0, avgVelMs: avgVel };
  });

  // Merge tiny segments (< 150m and < 60s)
  const merged: Seg[] = [];
  for (const seg of segs) {
    if (seg.distM < 150 && seg.timeSec < 60 && merged.length > 0) {
      const prev = merged[merged.length - 1];
      prev.distM    += seg.distM;
      prev.timeSec  += seg.timeSec;
      prev.avgVelMs  = prev.distM > 0 ? prev.distM / prev.timeSec : 0;
    } else {
      merged.push({ ...seg });
    }
  }

  const fastSegs   = merged.filter(s => s.cls === 'fast');
  const slowSegs   = merged.filter(s => s.cls === 'slow' || s.cls === 'stop');
  const totalDistKm = total / 1000;

  // ── Training type detection ──

  // INTERVALS: ≥ 3 fast segments separated by slow/stop segments
  if (fastSegs.length >= 3) {
    const avgIntervalDistM = fastSegs.reduce((s, seg) => s + seg.distM, 0) / fastSegs.length;
    const avgIntervalVel   = fastSegs.reduce((s, seg) => s + seg.avgVelMs, 0) / fastSegs.length;
    const intervalPace     = avgIntervalVel > 0 ? (1000 / avgIntervalVel) / 60 : 0;

    // Rest periods = slow/stop between first and last fast
    const firstFastStart = fastSegs[0].startDistM;
    const lastFastEnd    = fastSegs[fastSegs.length - 1].startDistM + fastSegs[fastSegs.length - 1].distM;
    const innerSlowSegs  = slowSegs.filter(s =>
      s.startDistM >= firstFastStart && s.startDistM < lastFastEnd,
    );
    const avgRestSec = innerSlowSegs.length > 0
      ? innerSlowSegs.reduce((s, seg) => s + seg.timeSec, 0) / innerSlowSegs.length
      : 0;

    const warmupDistM   = merged[0].cls !== 'fast' ? merged[0].distM : 0;
    const cooldownDistM = merged[merged.length - 1].cls !== 'fast' ? merged[merged.length - 1].distM : 0;

    const parts: string[] = [];
    if (warmupDistM > 300)   parts.push(`rozgrzewka ${fmtDist(warmupDistM)}`);
    parts.push(`${fastSegs.length}×${fmtDist(avgIntervalDistM)} tempem ${fmtPace(intervalPace)}`);
    if (avgRestSec > 15)      parts.push(`~${fmtTime(avgRestSec)} przerwy`);
    if (cooldownDistM > 300)  parts.push(`schłodzenie ${fmtDist(cooldownDistM)}`);

    return {
      trainingType: 'Trening interwałowy',
      typeColor:    '#7c3aed',
      summary:      parts.join(' · '),
      confidence:   fastSegs.length >= 4 ? 'high' : 'medium',
    };
  }

  // TEMPO: 1–2 fast segments with warm-up/cool-down around them
  if (fastSegs.length >= 1 && merged.length >= 3) {
    const tempoVel   = fastSegs.reduce((s, seg) => s + seg.avgVelMs * seg.distM, 0)
                     / fastSegs.reduce((s, seg) => s + seg.distM, 0);
    const tempoPace  = (1000 / tempoVel) / 60;
    const tempoDistM = fastSegs.reduce((s, seg) => s + seg.distM, 0);

    const warmupDistM   = merged[0].cls !== 'fast' ? merged[0].distM : 0;
    const cooldownDistM = merged[merged.length - 1].cls !== 'fast' ? merged[merged.length - 1].distM : 0;

    const parts: string[] = [];
    if (warmupDistM > 300)   parts.push(`rozgrzewka ${fmtDist(warmupDistM)}`);
    parts.push(`${fmtDist(tempoDistM)} tempem ${fmtPace(tempoPace)}`);
    if (cooldownDistM > 300) parts.push(`schłodzenie ${fmtDist(cooldownDistM)}`);

    return {
      trainingType: 'Bieg tempo',
      typeColor:    '#fb923c',
      summary:      parts.join(' · '),
      confidence:   'medium',
    };
  }

  // EASY / LONG RUN: uniform pace throughout
  const totalTimeSec = merged.reduce((s, seg) => s + seg.timeSec, 0);
  const avgVelMs     = totalTimeSec > 0 ? total / totalTimeSec : 0;
  const avgPaceMin   = avgVelMs > 0 ? (1000 / avgVelMs) / 60 : 0;

  let trainingType: string;
  let typeColor: string;

  if (totalDistKm >= 14) {
    trainingType = 'Długi bieg';
    typeColor    = '#16a34a';
  } else if (avgPaceMin > 0 && avgPaceMin < 4.8) {
    trainingType = 'Bieg ciągły szybki';
    typeColor    = '#dc2626';
  } else if (avgPaceMin > 6.0) {
    trainingType = 'Bieg regeneracyjny';
    typeColor    = '#60a5fa';
  } else {
    trainingType = 'Bieg ciągły';
    typeColor    = '#34d399';
  }

  return {
    trainingType,
    typeColor,
    summary: `${totalDistKm.toFixed(1)} km · śr. tempo ${avgPaceMin > 0 ? fmtPace(avgPaceMin) : '—'}`,
    confidence: 'high',
  };
}
