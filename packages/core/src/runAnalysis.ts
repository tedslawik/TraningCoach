export interface LapSummary {
  lapIndex:   number;
  name:       string;
  distM:      number;
  timeSec:    number;
  elapsedSec: number;
  velMs:      number;
  avgHR:      number | null;
}

export interface RunInterval {
  distM:     number;
  paceMinKm: number;
  avgHR:     number | null;
  restSec:   number;
}

export interface RunAnalysis {
  trainingType: string;
  typeColor:    string;
  confidence:   'high' | 'medium' | 'low';
  warmupKm:     number;
  cooldownKm:   number;
  sets:         number;
  intervals:    RunInterval[];
  avgHR:        number | null;
  totalKm:      number;
  avgPaceMinKm: number | null;
}

/* ── utils ── */
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

function pct(sorted: number[], p: number): number {
  return sorted[Math.max(0, Math.floor(sorted.length * p) - 1)] ?? 0;
}

function medianOf(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function avgSlice(arr: number[], from: number, to: number): number | null {
  const sl = arr.slice(from, to + 1).filter(v => v > 40);
  return sl.length ? Math.round(sl.reduce((s, v) => s + v, 0) / sl.length) : null;
}

/** Round to nearest 100m; below 100m round to nearest 10m */
function roundDist(m: number): number {
  if (m < 100) return Math.round(m / 10) * 10;
  return Math.round(m / 100) * 100;
}

/* ── main ── */
export function analyzeRunStream(
  time:      number[],
  distance:  number[],
  velocity:  number[],
  heartrate?: number[],
): RunAnalysis | null {
  const n      = Math.min(time.length, distance.length, velocity.length);
  const hr     = heartrate ?? [];
  const totalM = distance[n - 1] ?? 0;
  const totalKm = totalM / 1000;
  if (n < 30 || totalM < 500) return null;

  // Smooth velocity (Strava's velocity_smooth is already semi-smooth)
  const sm = smooth(velocity.slice(0, n), 5);

  // ── velocity percentiles ──
  const runVels = sm.filter(v => v > 1.2).sort((a, b) => a - b);
  if (runVels.length < 20) return null;

  const v15 = pct(runVels, 0.15);
  const v40 = pct(runVels, 0.40);
  const v75 = pct(runVels, 0.75);

  // 10 sec/km tolerance widened on fast threshold
  const v50   = pct(runVels, 0.50);
  const tolMs = v50 > 0 ? (10 / 60) * (v50 * v50) / (1000 / 60) : 0.15;

  const vClassify = (v: number): Cls => {
    if (v < 1.0)           return 'stop';
    if (v < v15)           return 'stop';
    if (v < v40)           return 'slow';
    if (v >= v75 - tolMs)  return 'fast';
    return 'medium';
  };

  // ── HR percentiles (when available) ──
  const hrRunning = hr.filter(h => h > 60).sort((a, b) => a - b);
  const hrP75 = hrRunning.length > 20 ? pct(hrRunning, 0.72) : null; // threshold for "real work"
  const hrP50 = hrRunning.length > 20 ? pct(hrRunning, 0.50) : null;

  // ── Segment ──
  const rawSegs: Array<{ cls: Cls; from: number; to: number }> = [];
  let cur = vClassify(sm[0]);
  let from = 0;
  for (let i = 1; i < n; i++) {
    const c = vClassify(sm[i]);
    if (c !== cur) { rawSegs.push({ cls: cur, from, to: i - 1 }); cur = c; from = i; }
  }
  rawSegs.push({ cls: cur, from, to: n - 1 });

  let segs: Seg[] = rawSegs.map(r => {
    const dM  = (distance[r.to] ?? 0) - (distance[r.from] ?? 0);
    const tS  = (time[r.to]     ?? 0) - (time[r.from]     ?? 0);
    return { cls: r.cls, distM: dM, timeSec: tS,
      startDistM: distance[r.from] ?? 0,
      velMs: dM > 0 && tS > 0 ? dM / tS : 0,
      fromIdx: r.from, toIdx: r.to };
  });

  // ── HR validation: re-classify velocity-"fast" segments with low HR as "medium" ──
  // This eliminates jogging recovery that happens to be at interval-ish speed
  if (hrP75 && hrP50) {
    segs = segs.map(s => {
      if (s.cls !== 'fast') return s;
      const segHR = avgSlice(hr, s.fromIdx, s.toIdx);
      if (segHR && segHR < hrP75 * 0.92) return { ...s, cls: 'medium' as Cls };
      return s;
    });
  }

  // ── Merge tiny segments (< 80m AND < 25s) ──
  const merged: Seg[] = [];
  for (const seg of segs) {
    if (seg.distM < 80 && seg.timeSec < 25 && merged.length > 0) {
      const prev = merged[merged.length - 1];
      prev.distM   += seg.distM;
      prev.timeSec += seg.timeSec;
      prev.toIdx    = seg.toIdx;
      prev.velMs    = prev.distM > 0 ? prev.distM / prev.timeSec : 0;
    } else {
      merged.push({ ...seg });
    }
  }

  // ── Overall stats ──
  const allHR     = hr.filter(v => v > 40);
  const overallHR = allHR.length ? Math.round(allHR.reduce((s, v) => s + v, 0) / allHR.length) : null;
  const totalSec  = merged.reduce((s, g) => s + g.timeSec, 0);
  const avgVelMs  = totalSec > 0 ? totalM / totalSec : 0;
  const avgPaceMinKm = avgVelMs > 0 ? (1000 / avgVelMs) / 60 : null;

  // ── Warmup / cooldown bounds ──
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
    let type: string, color: string;
    if (totalKm >= 15)                          { type = 'Długi bieg';             color = '#16a34a'; }
    else if (avgPaceMinKm && avgPaceMinKm < 4.8) { type = 'Bieg ciągły szybki';   color = '#dc2626'; }
    else if (avgPaceMinKm && avgPaceMinKm > 6.2) { type = 'Bieg regeneracyjny';   color = '#60a5fa'; }
    else                                         { type = 'Bieg ciągły';           color = '#34d399'; }
    return { trainingType: type, typeColor: color, confidence: 'high',
      warmupKm: 0, cooldownKm: 0, sets: 1,
      intervals: avgPaceMinKm ? [{ distM: Math.round(totalM), paceMinKm: avgPaceMinKm, avgHR: overallHR, restSec: 0 }] : [],
      avgHR: overallHR, totalKm, avgPaceMinKm };
  }

  // ── Cluster fast segments by distance, then validate by pace ──
  const sortedFast = [...fastSegs].sort((a, b) => a.distM - b.distM);
  const distClusters: Seg[][] = [[sortedFast[0]]];
  for (let i = 1; i < sortedFast.length; i++) {
    if (sortedFast[i].distM / sortedFast[i - 1].distM > 1.30)
      distClusters.push([]);
    distClusters[distClusters.length - 1].push(sortedFast[i]);
  }

  // Merge clusters with pace within 10 sec/km
  const TEN_S = 10 / 60;
  const clusters: Seg[][] = [];
  for (const cl of distClusters) {
    const clPace = medianOf(cl.map(s => s.velMs > 0 ? (1000 / s.velMs) / 60 : 99));
    const match  = clusters.find(ec => {
      const ep = medianOf(ec.map(s => s.velMs > 0 ? (1000 / s.velMs) / 60 : 99));
      return Math.abs(clPace - ep) < TEN_S;
    });
    if (match) match.push(...cl);
    else clusters.push([...cl]);
  }

  const clusterOf = new Map<Seg, number>();
  clusters.forEach((cl, idx) => cl.forEach(s => clusterOf.set(s, idx)));

  const orderedFast = [...fastSegs].sort((a, b) => a.startDistM - b.startDistM);
  const pattern     = orderedFast.map(s => clusterOf.get(s) ?? 0);
  const orderedCore = [...core].sort((a, b) => a.startDistM - b.startDistM);

  // Rest after each fast segment
  const restAfter = (seg: Seg): number => {
    const idx = orderedCore.findIndex(s => s === seg);
    if (idx < 0 || idx + 1 >= orderedCore.length) return 0;
    const nxt = orderedCore[idx + 1];
    return (nxt.cls === 'stop' || nxt.cls === 'slow') ? nxt.timeSec : 0;
  };

  // ── Fuzzy period detection (≤ 20% mismatches allowed) ──
  let bestPeriod   = pattern.length;
  let bestMisses   = pattern.length;
  for (let p = 1; p <= Math.floor(pattern.length / 2); p++) {
    let misses = 0;
    for (let i = p; i < pattern.length; i++) {
      if (pattern[i] !== pattern[i % p]) misses++;
    }
    if (misses < bestMisses) { bestMisses = misses; bestPeriod = p; }
  }

  // Only accept period if mismatches < 20%
  const sets = bestMisses / pattern.length < 0.20
    ? Math.round(pattern.length / bestPeriod)
    : 1;
  const usePeriod = sets > 1 ? bestPeriod : pattern.length;

  // ── Build interval descriptors ──
  const intervals: RunInterval[] = [];
  const seenClusters = new Set<number>();

  for (let p = 0; p < usePeriod; p++) {
    const cIdx = pattern[p];
    if (seenClusters.has(cIdx)) continue;
    seenClusters.add(cIdx);

    const cl      = clusters[cIdx];
    const inOrder = orderedFast.filter(s => clusterOf.get(s) === cIdx);
    const rests   = inOrder.map(s => restAfter(s)).filter(r => r > 5);
    const hrVals  = inOrder.map(s => avgSlice(hr, s.fromIdx, s.toIdx)).filter((v): v is number => v !== null);

    intervals.push({
      distM:     roundDist(medianOf(cl.map(s => s.distM))),
      paceMinKm: medianOf(cl.map(s => s.velMs > 0 ? (1000 / s.velMs) / 60 : 99)),
      avgHR:     hrVals.length ? Math.round(hrVals.reduce((s, v) => s + v, 0) / hrVals.length) : null,
      restSec:   rests.length  ? Math.round(medianOf(rests)) : 0,
    });
  }

  const trainingType = clusters.length > 1 ? 'Trening interwałowy mieszany'
    : sets >= 3 ? 'Trening interwałowy'
    : 'Bieg tempo';

  return {
    trainingType, typeColor: '#7c3aed',
    confidence: sets >= 4 && bestMisses === 0 ? 'high'
              : sets >= 2 ? 'medium' : 'low',
    warmupKm:   Math.round(warmupKm * 100) / 100,
    cooldownKm: Math.round(cooldownKm * 100) / 100,
    sets, intervals, avgHR: overallHR, totalKm, avgPaceMinKm,
  };
}

/* ─────────────────────────────────────────────────────────────────
   LAP-BASED ANALYSIS
   Uses Strava laps (manually pressed by athlete) instead of
   stream segmentation — much more accurate for interval training.
   ───────────────────────────────────────────────────────────────── */
export function analyzeRunLaps(laps: LapSummary[]): RunAnalysis | null {
  if (laps.length < 4) return null;

  const totalM  = laps.reduce((s, l) => s + l.distM, 0);
  const totalKm = Math.round(totalM / 100) / 10;
  if (totalM < 500) return null;

  // Overall avg HR
  const hrVals    = laps.map(l => l.avgHR ?? 0).filter(h => h > 40);
  const overallHR = hrVals.length
    ? Math.round(hrVals.reduce((s, v) => s + v, 0) / hrVals.length) : null;

  // Classify each lap
  // Rest: elapsed > moving (stopped/walking) OR very slow OR very short
  type LapCls = 'work' | 'rest' | 'phase';
  const classify = (l: LapSummary): LapCls => {
    // Clearly a rest: very short or very slow
    if (l.timeSec < 90 && l.distM < 350)  return 'rest';
    if (l.velMs < 1.8)                     return 'rest';
    // High stop ratio → rest (stopped during lap)
    if (l.elapsedSec > 0 && l.timeSec / l.elapsedSec < 0.60) return 'rest';
    // Work or easy phase — decide below after thresholds
    return 'phase';
  };

  const tagged = laps.map(l => ({ ...l, cls: classify(l) }));

  // Velocity percentiles from non-rest laps
  const phaseLaps = tagged.filter(l => l.cls === 'phase');
  if (!phaseLaps.length) return null;

  const phaseVels = phaseLaps.map(l => l.velMs).sort((a, b) => a - b);
  const v50 = phaseVels[Math.floor(phaseVels.length * 0.50)];
  const v30 = phaseVels[Math.floor(phaseVels.length * 0.30)];

  // Re-classify phase laps: above 30th pct = work, below = warmup/cooldown
  const retagged = tagged.map(l => {
    if (l.cls !== 'phase') return l;
    return { ...l, cls: (l.velMs >= v30 ? 'work' : 'phase') as LapCls };
  });

  // Warmup = leading non-work laps
  let wuEnd = 0;
  while (wuEnd < retagged.length - 1 && retagged[wuEnd].cls !== 'work') wuEnd++;
  // Cooldown = trailing non-work laps
  let cdStart = retagged.length - 1;
  while (cdStart > 0 && retagged[cdStart].cls !== 'work') cdStart--;
  cdStart++;

  const warmupKm   = Math.round(retagged.slice(0, wuEnd).reduce((s, l) => s + l.distM, 0) / 100) / 10;
  const cooldownKm = Math.round(retagged.slice(cdStart).reduce((s, l) => s + l.distM, 0) / 100) / 10;
  const core       = retagged.slice(wuEnd, cdStart);
  const workLaps   = core.filter(l => l.cls === 'work');

  // Steady run
  if (workLaps.length < 2) {
    const totalSec    = laps.reduce((s, l) => s + l.timeSec, 0);
    const avgVelMs    = totalSec > 0 ? totalM / totalSec : 0;
    const avgPaceMin  = avgVelMs > 0 ? (1000 / avgVelMs) / 60 : null;
    let type: string, color: string;
    if (totalKm >= 15)                          { type = 'Długi bieg';            color = '#16a34a'; }
    else if (avgPaceMin && avgPaceMin < 4.8)    { type = 'Bieg ciągły szybki';   color = '#dc2626'; }
    else if (avgPaceMin && avgPaceMin > 6.2)    { type = 'Bieg regeneracyjny';   color = '#60a5fa'; }
    else                                         { type = 'Bieg ciągły';          color = '#34d399'; }
    return { trainingType: type, typeColor: color, confidence: 'high',
      warmupKm, cooldownKm, sets: 1,
      intervals: avgPaceMin ? [{ distM: Math.round(totalM), paceMinKm: avgPaceMin, avgHR: overallHR, restSec: 0 }] : [],
      avgHR: overallHR, totalKm, avgPaceMinKm: avgPaceMin };
  }

  // ── Cluster work laps by distance (rounded to 100m) ──
  // Important: use roundDist so 387m and 415m both → 400m same cluster
  const roundDist = (m: number) => m < 100 ? Math.round(m / 10) * 10 : Math.round(m / 100) * 100;

  type TaggedLap = typeof retagged[0];
  const sortedWork = [...workLaps].sort((a, b) => a.distM - b.distM);
  const clusters: TaggedLap[][] = [[sortedWork[0]]];
  for (let i = 1; i < sortedWork.length; i++) {
    // New cluster if distance ratio > 1.25 OR rounded distance differs
    const prev = sortedWork[i - 1];
    const curr = sortedWork[i];
    if (roundDist(curr.distM) !== roundDist(prev.distM) && curr.distM / prev.distM > 1.20) {
      clusters.push([]);
    }
    clusters[clusters.length - 1].push(curr);
  }

  // Merge clusters with pace within 10 sec/km
  const TEN_S = 10 / 60;
  const merged: TaggedLap[][] = [];
  for (const cl of clusters) {
    const clPace = medianOf(cl.map(l => l.velMs > 0 ? (1000 / l.velMs) / 60 : 99));
    const match  = merged.find(mc => {
      const mp = medianOf(mc.map(l => l.velMs > 0 ? (1000 / l.velMs) / 60 : 99));
      return Math.abs(clPace - mp) < TEN_S;
    });
    if (match) match.push(...cl);
    else merged.push([...cl]);
  }

  const clusterOf = new Map<TaggedLap, number>();
  merged.forEach((cl, idx) => cl.forEach(l => clusterOf.set(l, idx)));

  // Pattern from ordered work laps
  const orderedWork = [...workLaps].sort((a, b) => a.lapIndex - b.lapIndex);
  const pattern     = orderedWork.map(l => clusterOf.get(l) ?? 0);

  // Rest after each work lap = next rest lap duration
  const restAfter = (wl: TaggedLap): number => {
    const idx = core.findIndex(l => l === wl);
    if (idx < 0 || idx + 1 >= core.length) return 0;
    const nxt = core[idx + 1];
    return nxt.cls === 'rest' ? nxt.elapsedSec : 0; // use elapsed for rest (includes stopped time)
  };

  // Fuzzy period detection (≤ 20% mismatches)
  let bestPeriod = pattern.length, bestMisses = pattern.length;
  for (let p = 1; p <= Math.floor(pattern.length / 2); p++) {
    let m = 0;
    for (let i = p; i < pattern.length; i++) { if (pattern[i] !== pattern[i % p]) m++; }
    if (m < bestMisses) { bestMisses = m; bestPeriod = p; }
  }
  const sets      = bestMisses / pattern.length < 0.20 ? Math.round(pattern.length / bestPeriod) : 1;
  const usePeriod = sets > 1 ? bestPeriod : pattern.length;

  // Build intervals (one per distinct type in set order)
  const seenClusters = new Set<number>();
  const intervals: RunInterval[] = [];

  for (let p = 0; p < usePeriod; p++) {
    const cIdx = pattern[p];
    if (seenClusters.has(cIdx)) continue;
    seenClusters.add(cIdx);

    const cl     = merged[cIdx];
    const inOrder = orderedWork.filter(l => clusterOf.get(l) === cIdx);
    const rests   = inOrder.map(l => restAfter(l)).filter(r => r > 3);
    const hrVals2 = inOrder.map(l => l.avgHR).filter((h): h is number => h !== null && h > 0);

    intervals.push({
      distM:     roundDist(medianOf(cl.map(l => l.distM))),
      paceMinKm: medianOf(cl.map(l => l.velMs > 0 ? (1000 / l.velMs) / 60 : 99)),
      avgHR:     hrVals2.length ? Math.round(hrVals2.reduce((s, v) => s + v, 0) / hrVals2.length) : null,
      restSec:   rests.length   ? Math.round(medianOf(rests)) : 0,
    });
  }

  const trainingType = merged.length > 1 ? 'Trening interwałowy mieszany'
    : sets >= 3 ? 'Trening interwałowy'
    : 'Bieg tempo';

  return {
    trainingType, typeColor: '#7c3aed',
    confidence: sets >= 4 && bestMisses === 0 ? 'high' : sets >= 2 ? 'medium' : 'low',
    warmupKm, cooldownKm, sets, intervals,
    avgHR: overallHR, totalKm, avgPaceMinKm: v50 > 0 ? (1000 / v50) / 60 : null,
  };
}
