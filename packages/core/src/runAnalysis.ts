export interface RunInterval {
  distM:     number;
  paceMinKm: number;
  avgHR:     number | null;
  restSec:   number;  // rest after this interval type
}

export interface RunAnalysis {
  trainingType: string;
  typeColor:    string;
  confidence:   'high' | 'medium' | 'low';
  warmupKm:     number;
  cooldownKm:   number;
  sets:         number;       // repetitions of the block
  intervals:    RunInterval[]; // distinct interval types in one set
  avgHR:        number | null; // overall avg HR
  totalKm:      number;
  avgPaceMinKm: number | null;
}

/* ── internal ── */
type Cls = 'fast' | 'medium' | 'slow' | 'stop';

interface Seg {
  cls:        Cls;
  distM:      number;
  timeSec:    number;
  startDistM: number;
  velMs:      number;
  fromIdx:    number;
  toIdx:      number;
}

function smooth(arr: number[], w = 5): number[] {
  return arr.map((_, i) => {
    const sl = arr.slice(Math.max(0, i - w), Math.min(arr.length, i + w + 1));
    return sl.reduce((s, v) => s + v, 0) / sl.length;
  });
}

function median(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function avgHRForSeg(seg: Seg, hr: number[]): number | null {
  if (!hr.length) return null;
  const slice = hr.slice(seg.fromIdx, seg.toIdx + 1).filter(v => v > 40);
  if (!slice.length) return null;
  return Math.round(slice.reduce((s, v) => s + v, 0) / slice.length);
}

/* ── Main export ── */
export function analyzeRunStream(
  time:      number[],
  distance:  number[],
  velocity:  number[],
  heartrate?: number[],
): RunAnalysis | null {
  const n = Math.min(time.length, distance.length, velocity.length);
  if (n < 30) return null;

  const totalM    = distance[n - 1] ?? 0;
  const totalKm   = totalM / 1000;
  const hr        = heartrate ?? [];
  if (totalM < 500) return null;

  // Gentle smoothing on velocity stream (already pre-smoothed by Strava)
  const sm = smooth(velocity.slice(0, n), 5);

  // Velocity percentiles from moving segments only
  const moving = sm.filter(v => v > 1.2);
  if (moving.length < 20) return null;

  const sortedV = [...moving].sort((a, b) => a - b);
  const pct = (p: number) => sortedV[Math.max(0, Math.floor(sortedV.length * p) - 1)];
  const v15 = pct(0.15);
  const v40 = pct(0.40);
  const v75 = pct(0.75);

  // 10 sec/km tolerance converted to velocity at median pace
  // v_median ≈ pct(0.5); 10s/km ≈ 0.15-0.20 m/s depending on speed
  const v50        = pct(0.50);
  const TEN_SEC_MS = v50 > 0 ? (10 / 60) * (v50 * v50) / (1000 / 60) : 0.17;

  const classify = (v: number): Cls => {
    if (v < 1.0)  return 'stop';
    if (v < v15)  return 'stop';
    if (v < v40)  return 'slow';
    if (v >= v75 - TEN_SEC_MS) return 'fast';  // extended by 10 sec/km
    return 'medium';
  };

  // Build segments
  const rawSegs: Array<{ cls: Cls; from: number; to: number }> = [];
  let cur = classify(sm[0]);
  let from = 0;
  for (let i = 1; i < n; i++) {
    const c = classify(sm[i]);
    if (c !== cur) { rawSegs.push({ cls: cur, from, to: i - 1 }); cur = c; from = i; }
  }
  rawSegs.push({ cls: cur, from, to: n - 1 });

  const segs: Seg[] = rawSegs.map(r => {
    const distM   = (distance[r.to] ?? 0) - (distance[r.from] ?? 0);
    const timeSec = (time[r.to]     ?? 0) - (time[r.from]     ?? 0);
    return {
      cls: r.cls, distM, timeSec,
      startDistM: distance[r.from] ?? 0,
      velMs: distM > 0 && timeSec > 0 ? distM / timeSec : 0,
      fromIdx: r.from, toIdx: r.to,
    };
  });

  // Merge micro-segments (< 80m AND < 25s)
  const merged: Seg[] = [];
  for (const seg of segs) {
    if (seg.distM < 80 && seg.timeSec < 25 && merged.length > 0) {
      const prev = merged[merged.length - 1];
      prev.distM    += seg.distM;
      prev.timeSec  += seg.timeSec;
      prev.toIdx     = seg.toIdx;
      prev.velMs     = prev.distM > 0 ? prev.distM / prev.timeSec : 0;
    } else {
      merged.push({ ...seg });
    }
  }

  // Overall avg HR
  const allHR   = hr.filter(v => v > 40);
  const overallHR = allHR.length ? Math.round(allHR.reduce((s, v) => s + v, 0) / allHR.length) : null;

  // Identify warmup/cooldown bounds
  let wuEnd = 0;
  while (wuEnd < merged.length - 1 && merged[wuEnd].cls !== 'fast') wuEnd++;
  let cdStart = merged.length - 1;
  while (cdStart > 0 && merged[cdStart].cls !== 'fast') cdStart--;
  cdStart++;

  const warmupKm   = merged.slice(0, wuEnd).reduce((s, g) => s + g.distM, 0) / 1000;
  const cooldownKm = merged.slice(cdStart).reduce((s, g) => s + g.distM, 0) / 1000;
  const core       = merged.slice(wuEnd, cdStart);
  const fastSegs   = core.filter(s => s.cls === 'fast');

  // ── Steady / easy run ──
  if (fastSegs.length < 2) {
    const totalSec   = merged.reduce((s, g) => s + g.timeSec, 0);
    const avgVelMs   = totalSec > 0 ? totalM / totalSec : 0;
    const avgPaceMin = avgVelMs > 0 ? (1000 / avgVelMs) / 60 : null;

    let type: string, color: string;
    if (totalKm >= 15)                   { type = 'Długi bieg';             color = '#16a34a'; }
    else if (avgPaceMin && avgPaceMin < 4.8) { type = 'Bieg ciągły szybki'; color = '#dc2626'; }
    else if (avgPaceMin && avgPaceMin > 6.2) { type = 'Bieg regeneracyjny'; color = '#60a5fa'; }
    else                                  { type = 'Bieg ciągły';           color = '#34d399'; }

    return {
      trainingType: type, typeColor: color, confidence: 'high',
      warmupKm: 0, cooldownKm: 0, sets: 1,
      intervals: avgPaceMin ? [{ distM: totalM, paceMinKm: avgPaceMin, avgHR: overallHR, restSec: 0 }] : [],
      avgHR: overallHR, totalKm, avgPaceMinKm: avgPaceMin,
    };
  }

  // ── Cluster fast segments by DISTANCE ──
  const sortedFast = [...fastSegs].sort((a, b) => a.distM - b.distM);
  const distClusters: Seg[][] = [[sortedFast[0]]];
  for (let i = 1; i < sortedFast.length; i++) {
    const ratio = sortedFast[i].distM / sortedFast[i - 1].distM;
    if (ratio > 1.30) distClusters.push([]);
    distClusters[distClusters.length - 1].push(sortedFast[i]);
  }

  // Merge distance clusters whose PACE is within 10 sec/km
  // (e.g. 400m@3:45 and 420m@3:48 should be the same cluster)
  const TEN_S_PER_KM = 10 / 60;
  const clusters: Seg[][] = [];
  for (const cl of distClusters) {
    const clPace = median(cl.map(s => s.velMs > 0 ? (1000 / s.velMs) / 60 : 99));
    const existing = clusters.find(ec => {
      const ecPace = median(ec.map(s => s.velMs > 0 ? (1000 / s.velMs) / 60 : 99));
      return Math.abs(clPace - ecPace) < TEN_S_PER_KM;
    });
    if (existing) existing.push(...cl);
    else clusters.push([...cl]);
  }

  // Assign cluster indices
  const clusterOf = new Map<Seg, number>();
  clusters.forEach((cl, idx) => cl.forEach(s => clusterOf.set(s, idx)));

  const orderedFast = [...fastSegs].sort((a, b) => a.startDistM - b.startDistM);
  const pattern     = orderedFast.map(s => clusterOf.get(s) ?? 0);
  const orderedCore = [...core].sort((a, b) => a.startDistM - b.startDistM);

  // Rest after each segment
  const restAfter = (seg: Seg): number => {
    const idx = orderedCore.findIndex(s => s === seg);
    if (idx < 0 || idx + 1 >= orderedCore.length) return 0;
    const nxt = orderedCore[idx + 1];
    return (nxt.cls === 'stop' || nxt.cls === 'slow') ? nxt.timeSec : 0;
  };

  // Find repeating period
  let period = pattern.length;
  for (let p = 1; p <= Math.floor(pattern.length / 2); p++) {
    let ok = true;
    for (let i = p; i < pattern.length; i++) {
      if (pattern[i] !== pattern[i % p]) { ok = false; break; }
    }
    if (ok) { period = p; break; }
  }
  const sets = Math.round(pattern.length / period);

  // Build intervals array (one entry per distinct type in one set)
  const intervals: RunInterval[] = [];
  for (let p = 0; p < period; p++) {
    const cIdx = pattern[p];
    const cl   = clusters[cIdx];
    const distMs = cl.map(s => s.distM);
    const vels   = cl.map(s => s.velMs);

    const inOrder = orderedFast.filter(s => clusterOf.get(s) === cIdx);
    const rests   = inOrder.map(s => restAfter(s)).filter(r => r > 5);
    const hrVals  = inOrder.map(s => avgHRForSeg(s, hr)).filter((v): v is number => v !== null);

    intervals.push({
      distM:     Math.round(median(distMs) / 25) * 25, // round to 25m
      paceMinKm: median(vels) > 0 ? (1000 / median(vels)) / 60 : 0,
      avgHR:     hrVals.length ? Math.round(hrVals.reduce((s, v) => s + v, 0) / hrVals.length) : null,
      restSec:   rests.length ? Math.round(median(rests)) : 0,
    });
  }

  const trainingType = clusters.length > 1 ? 'Trening interwałowy mieszany'
    : sets >= 3 ? 'Trening interwałowy'
    : 'Bieg tempo';

  return {
    trainingType,
    typeColor:    '#7c3aed',
    confidence:   sets >= 4 ? 'high' : sets >= 2 ? 'medium' : 'low',
    warmupKm:     Math.round(warmupKm * 100) / 100,
    cooldownKm:   Math.round(cooldownKm * 100) / 100,
    sets,
    intervals,
    avgHR:        overallHR,
    totalKm:      Math.round(totalKm * 10) / 10,
    avgPaceMinKm: null,
  };
}
