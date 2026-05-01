import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const supabase   = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
const anthropic  = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

/* ── helpers ── */
function fmtPace(minKm: number): string {
  if (!minKm || minKm > 20) return '—';
  const m = Math.floor(minKm), s = Math.round((minKm - m) * 60);
  return `${m}:${String(s).padStart(2, '0')}/km`;
}
function fmtSec(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return s > 0 ? `${m}:${String(s).padStart(2, '0')} min` : `${m} min`;
}
function fmtTime(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}min` : `${m} min`;
}
function fmtDist(m: number): string {
  return m < 950 ? `${Math.round(m / 25) * 25}m` : `${(m / 1000).toFixed(1)}km`;
}

/* ── prompt builder ── */
function buildPrompt(body: Record<string, unknown>): string {
  const {
    activityName, sportType, startDate,
    totalDistKm, totalTimeSec, elevGain,
    avgHR, maxHR, avgWatts,
    hrZones, lapAnalysis, laps,
  } = body as {
    activityName:  string;
    sportType:     string;
    startDate:     string;
    totalDistKm:   number;
    totalTimeSec:  number;
    elevGain:      number;
    avgHR:         number | null;
    maxHR:         number | null;
    avgWatts:      number | null;
    hrZones:       Array<{min:number;max:number}> | null;
    lapAnalysis:   null | {
      trainingType: string;
      warmupKm:    number;
      cooldownKm:  number;
      sets:        number;
      intervals:   Array<{distM:number; paceMinKm:number; avgHR:number|null; restSec:number}>;
    };
    laps: Array<{lapIndex:number; distM:number; timeSec:number; velMs:number; avgHR:number|null}>;
  };

  const sportMap: Record<string, string> = {
    Run: 'Bieg', TrailRun: 'Bieg terenowy', VirtualRun: 'Bieg wirtualny',
    Ride: 'Jazda rowerowa', VirtualRide: 'Jazda wirtualna', EBikeRide: 'Jazda e-bike',
    Swim: 'Pływanie', OpenWaterSwim: 'Pływanie w wodach otwartych',
  };
  const sport = sportMap[sportType] ?? sportType;

  const zoneNames = ['Z1 Regeneracja','Z2 Aerobowa','Z3 Tempo','Z4 Próg mleczanowy','Z5 VO2max'];

  const lines: string[] = [
    `Przeanalizuj poniższy trening i napisz szczegółowe podsumowanie po polsku (300–450 słów).`,
    `Bądź konkretny — używaj liczb z danych. Pisz bezpośrednio do zawodnika.`,
    ``,
    `═══ TRENING ═══`,
    `Typ: ${sport}`,
    `Nazwa: "${activityName}"`,
    `Data: ${new Date(startDate).toLocaleDateString('pl-PL', {day:'numeric',month:'long',year:'numeric'})}`,
    `Dystans: ${totalDistKm} km | Czas: ${fmtTime(totalTimeSec as number)}`,
    elevGain > 0 ? `Przewyższenie: ${elevGain} m` : '',
    ``,
  ];

  // Lap analysis (most reliable)
  if (lapAnalysis) {
    lines.push(`═══ STRUKTURA (z okrążeń zegarka) ═══`);
    lines.push(`Typ treningu: ${lapAnalysis.trainingType}`);
    if (lapAnalysis.warmupKm > 0.1)   lines.push(`Rozgrzewka: ${lapAnalysis.warmupKm.toFixed(1)} km`);
    if (lapAnalysis.sets > 1) {
      lines.push(`${lapAnalysis.sets} serii:`);
      lapAnalysis.intervals.forEach(iv => {
        let part = `  • ${fmtDist(iv.distM)} @ ${fmtPace(iv.paceMinKm)}`;
        if (iv.avgHR) part += ` · śr. HR ${iv.avgHR} bpm`;
        if (iv.restSec > 5) part += ` · przerwa ${fmtSec(iv.restSec)}`;
        lines.push(part);
      });
    }
    if (lapAnalysis.cooldownKm > 0.1) lines.push(`Schłodzenie: ${lapAnalysis.cooldownKm.toFixed(1)} km`);
    lines.push('');
  } else if (laps?.length > 2) {
    // Raw laps fallback
    lines.push(`═══ OKRĄŻENIA (${laps.length} szt.) ═══`);
    laps.slice(0, 20).forEach(l => {
      const pace = l.velMs > 0.5 ? fmtPace((1000/l.velMs)/60) : '—';
      let lap = `  Lap ${l.lapIndex}: ${fmtDist(l.distM)}, ${fmtSec(l.timeSec)}, ${pace}`;
      if (l.avgHR) lap += `, HR ${l.avgHR} bpm`;
      lines.push(lap);
    });
    lines.push('');
  }

  // Physiological data
  lines.push(`═══ DANE FIZJOLOGICZNE ═══`);
  if (avgHR)   lines.push(`Śr. tętno: ${avgHR} bpm`);
  if (maxHR)   lines.push(`Max tętno: ${maxHR} bpm`);
  if (avgWatts) lines.push(`Śr. moc: ${avgWatts} W`);
  if (hrZones) {
    lines.push(`Strefy tętna (dla kontekstu):`);
    hrZones.slice(0, 5).forEach((z, i) => {
      const lo = z.min <= 0 ? '—'   : `${z.min}`;
      const hi = z.max <= 0 ? 'max' : `${z.max}`;
      lines.push(`  ${zoneNames[i]}: ${lo}–${hi} bpm`);
    });
  }

  lines.push('');
  lines.push(`═══ ZADANIE ═══`);
  lines.push(`Napisz DOKŁADNIE 10–12 zdań (nie więcej). Bądź konkretny i zwięzły.`);
  lines.push(`Uwzględnij: co się wydarzyło chronologicznie, ocenę stref tętna,`);
  lines.push(`czy założenia były właściwe, i 1–2 wskazówki na następny trening.`);
  lines.push(`Używaj liczb z danych. Pisz do zawodnika bezpośrednio.`);

  return lines.filter(l => l !== undefined).join('\n');
}

/* ── handler ── */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const jwt = (req.headers.authorization ?? '').replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(jwt);
  if (error || !user) return res.status(401).json({ error: 'Unauthorized' });

  const prompt = buildPrompt(req.body as Record<string, unknown>);

  // Stream response — text appears word by word in the browser
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Transfer-Encoding', 'chunked');

  const stream = anthropic.messages.stream({
    model:      'claude-sonnet-4-6',
    max_tokens: 500,
    messages:   [{ role: 'user', content: prompt }],
  });

  stream.on('text', (text: string) => res.write(text));

  const finalMsg = await stream.finalMessage();
  const { input_tokens, output_tokens } = finalMsg.usage;
  // Sonnet 4.6 pricing: $3/MTok input, $15/MTok output
  const costUsd = (input_tokens * 3 + output_tokens * 15) / 1_000_000;

  // Send usage as null-byte-separated JSON epilogue
  res.write(`\x00${JSON.stringify({ inputTokens: input_tokens, outputTokens: output_tokens, costUsd })}`);
  res.end();
}
