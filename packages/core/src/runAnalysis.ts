export interface RunAnalysis {
  trainingType: string;
  typeColor:    string;
  summary:      string;
  confidence:   'high' | 'medium' | 'low';
}

/* ── helpers ── */
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

function fmtPace(minKm: number): string {
  if (minKm <= 0 || minKm > 30) return '—';
  const m = Math.floor(minKm);
  const s = Math.round((minKm - m) * 60);
  return `${m}:${String(s).padStart(2, '0')}/km`;
}

function fmtDist(m: number): string {
  if (m < 950) return `${Math.round(m / 25) * 25}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

function fmtSec(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return s > 0 ? `${m}:${String(s).padStart(2, '0')}min` : `${m}min`;
}

type Cls = 'fast' | 'medium' | 'slow' | 'stop';

interface Seg {
  cls:        Cls;
  distM:      number;
  timeSec:    number;
  startDistM: number;
  velMs:      number;
}

/* ── main ── */
export function analyzeRunStream(
  time:     number[],
  distance: number[],
  velocity: number[],
): RunAnalysis | null {
  const n = Math.min(time.length, distance.length, velocity.length);
  if (n < 30) return null;

  const totalM = distance[n - 1] ?? 0;
  if (totalM < 500) return null;

  // Gentle smoothing — velocity_smooth is already pre-smoothed by Strava
  const sm = smooth(velocity.slice(0, n), 5);

  // Build pace percentile thresholds from moving parts only
  const moving = sm.filter(v => v > 1.2); // > ~4.3 km/h
  if (moving.length < 20) return null;

  const sortedV = [...moving].sort((a, b) => a - b);
  const p  = (pct: number) => sortedV[Math.max(0, Math.floor(sortedV.length * pct) - 1)];
  const v15 = p(0.15);  // slowest 15% → stop/rest threshold
  const v40 = p(0.40);  // 15-40%      → slow/recovery
  const v75 = p(0.75);  // top 25%     → fast / work interval

  const classify = (v: number): Cls => {
    if (v < 1.0)  return 'stop';
    if (v < v15)  return 'stop';
    if (v < v40)  return 'slow';
    if (v >= v75) return 'fast';
    return 'medium';
  };

  // Segment
  const rawSegs: Array<{ cls: Cls; from: number; to: number }> = [];
  let cur = classify(sm[0]);
  let from = 0;
  for (let i = 1; i < n; i++) {
    const c = classify(sm[i]);
    if (c !== cur) { rawSegs.push({ cls: cur, from, to: i - 1 }); cur = c; from = i; }
  }
  rawSegs.push({ cls: cur, from, to: n - 1 });

  // Build seg objects
  const segs: Seg[] = rawSegs.map(r => {
    const distM   = (distance[r.to] ?? 0) - (distance[r.from] ?? 0);
    const timeSec = (time[r.to]     ?? 0) - (time[r.from]     ?? 0);
    return {
      cls: r.cls, distM, timeSec,
      startDistM: distance[r.from] ?? 0,
      velMs: distM > 0 && timeSec > 0 ? distM / timeSec : 0,
    };
  });

  // Merge very short segments — but keep anything > 25s or > 100m
  // (critical: 45s rests must NOT be merged away!)
  const MERGE_M = 80;
  const MERGE_S = 25;
  const merged: Seg[] = [];
  for (const seg of segs) {
    if (seg.distM < MERGE_M && seg.timeSec < MERGE_S && merged.length > 0) {
      const prev = merged[merged.length - 1];
      prev.distM   += seg.distM;
      prev.timeSec += seg.timeSec;
      prev.velMs    = prev.distM > 0 ? prev.distM / prev.timeSec : 0;
    } else {
      merged.push({ ...seg });
    }
  }

  // ── Identify warm-up, cool-down, core ──
  let wuEnd = 0;
  while (wuEnd < merged.length - 1 && merged[wuEnd].cls !== 'fast') wuEnd++;
  let cdStart = merged.length - 1;
  while (cdStart > 0 && merged[cdStart].cls !== 'fast') cdStart--;
  cdStart++;

  const warmupM    = merged.slice(0, wuEnd).reduce((s, g) => s + g.distM, 0);
  const cooldownM  = merged.slice(cdStart).reduce((s, g) => s + g.distM, 0);
  const core       = merged.slice(wuEnd, cdStart);

  const fastSegs   = core.filter(s => s.cls === 'fast');
  const totalDistKm = totalM / 1000;

  // ─────────────────────────────────────────────────────────────────
  // STEADY / EASY RUN — no fast segments in core
  // ─────────────────────────────────────────────────────────────────
  if (fastSegs.length < 2) {
    const totalSec  = merged.reduce((s, g) => s + g.timeSec, 0);
    const avgVelMs  = totalSec > 0 ? totalM / totalSec : 0;
    const avgPaceMin = avgVelMs > 0 ? (1000 / avgVelMs) / 60 : 0;

    let type: string, color: string;
    if (totalDistKm >= 15)         { type = 'Długi bieg';              color = '#16a34a'; }
    else if (avgPaceMin < 4.8)     { type = 'Bieg ciągły szybki';      color = '#dc2626'; }
    else if (avgPaceMin > 6.2)     { type = 'Bieg regeneracyjny';      color = '#60a5fa'; }
    else                           { type = 'Bieg ciągły';             color = '#34d399'; }

    return { trainingType: type, typeColor: color,
      summary: `${totalDistKm.toFixed(1)} km · śr. tempo ${fmtPace(avgPaceMin)}`, confidence: 'high' };
  }

  // ─────────────────────────────────────────────────────────────────
  // CLUSTER fast segments by DISTANCE (key fix vs v1)
  // Treats 400m and 800m as distinct interval types
  // ─────────────────────────────────────────────────────────────────
  const sortedFast = [...fastSegs].sort((a, b) => a.distM - b.distM);
  const clusters: Seg[][] = [[sortedFast[0]]];
  for (let i = 1; i < sortedFast.length; i++) {
    const ratio = sortedFast[i].distM / sortedFast[i - 1].distM;
    if (ratio > 1.30) clusters.push([]); // >30% distance gap → new type
    clusters[clusters.length - 1].push(sortedFast[i]);
  }

  // Assign cluster index to each fast segment
  const clusterOf = new Map<Seg, number>();
  clusters.forEach((cl, idx) => cl.forEach(s => clusterOf.set(s, idx)));

  // Ordered fast segments (by start position in run)
  const orderedFast = [...fastSegs].sort((a, b) => a.startDistM - b.startDistM);
  const pattern     = orderedFast.map(s => clusterOf.get(s) ?? 0);

  // Core ordered by start distance (work + rests together)
  const orderedCore = [...core].sort((a, b) => a.startDistM - b.startDistM);

  // For each fast segment, find the rest period that immediately follows
  const restAfter = (seg: Seg): number => {
    const idx = orderedCore.findIndex(s => s === seg);
    if (idx < 0 || idx + 1 >= orderedCore.length) return 0;
    const next = orderedCore[idx + 1];
    return (next.cls === 'stop' || next.cls === 'slow') ? next.timeSec : 0;
  };

  // Build per-cluster stats: median distance, median pace, median rest after
  const clusterStats = clusters.map((cl, idx) => {
    const dists = cl.map(s => s.distM);
    const vels  = cl.map(s => s.velMs);

    // Get fast segs of this cluster in order
    const inOrder = orderedFast.filter(s => clusterOf.get(s) === idx);
    const rests   = inOrder.map(s => restAfter(s)).filter(r => r > 5);

    return {
      count:       cl.length,
      medDistM:    median(dists),
      medVelMs:    median(vels),
      medPaceMin:  median(vels) > 0 ? (1000 / median(vels)) / 60 : 0,
      medRestSec:  rests.length > 0 ? median(rests) : 0,
    };
  });

  // ─────────────────────────────────────────────────────────────────
  // FIND REPEATING PATTERN in cluster sequence
  // e.g. [0,1,0,1,0,1] → period=2, reps=3
  // ─────────────────────────────────────────────────────────────────
  let bestPeriod = pattern.length;
  for (let p = 1; p <= Math.floor(pattern.length / 2); p++) {
    let ok = true;
    for (let i = p; i < pattern.length; i++) {
      if (pattern[i] !== pattern[i % p]) { ok = false; break; }
    }
    if (ok) { bestPeriod = p; break; }
  }

  const reps = Math.round(pattern.length / bestPeriod);

  // Build the "one set" description
  const unitParts: string[] = [];
  for (let p = 0; p < bestPeriod; p++) {
    const cIdx   = pattern[p];
    const cs     = clusterStats[cIdx];
    let part = `${fmtDist(cs.medDistM)} @ ${fmtPace(cs.medPaceMin)}`;
    if (cs.medRestSec > 10) part += ` (przerwa ${fmtSec(cs.medRestSec)})`;
    unitParts.push(part);
  }

  const parts: string[] = [];
  if (warmupM > 300)   parts.push(`rozgrzewka ${fmtDist(warmupM)}`);

  if (reps > 1 && bestPeriod > 1) {
    parts.push(`${reps}×(${unitParts.join(' + ')})`);
  } else if (reps > 1 && bestPeriod === 1) {
    const cs = clusterStats[0];
    let intStr = `${reps}×${fmtDist(cs.medDistM)} @ ${fmtPace(cs.medPaceMin)}`;
    if (cs.medRestSec > 10) intStr += ` · ~${fmtSec(cs.medRestSec)} przerwy`;
    parts.push(intStr);
  } else {
    parts.push(unitParts.join(' + '));
  }

  if (cooldownM > 300) parts.push(`schłodzenie ${fmtDist(cooldownM)}`);

  const trainingType = clusters.length > 1
    ? 'Trening interwałowy mieszany'
    : reps >= 3 ? 'Trening interwałowy'
    : 'Bieg tempo';

  const colors: Record<string, string> = {
    'Trening interwałowy mieszany': '#7c3aed',
    'Trening interwałowy':          '#7c3aed',
    'Bieg tempo':                   '#fb923c',
  };

  return {
    trainingType,
    typeColor:  colors[trainingType] ?? '#7c3aed',
    summary:    parts.join(' · '),
    confidence: reps >= 4 ? 'high' : reps >= 2 ? 'medium' : 'low',
  };
}
