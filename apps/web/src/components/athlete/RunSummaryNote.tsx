import { useMemo } from 'react';
import { analyzeRunStream, type RunAnalysis } from '@tricoach/core';
import type { StreamData } from '../charts/ActivityCharts';

const RUN_TYPES = new Set(['Run', 'TrailRun', 'VirtualRun']);

interface Props { data: StreamData; }

export default function RunSummaryNote({ data }: Props) {
  if (!RUN_TYPES.has(data.sportType)) return null;

  const analysis: RunAnalysis | null = useMemo(
    () => analyzeRunStream(data.time, data.distance, data.velocity),
    [data.time, data.distance, data.velocity],
  );

  if (!analysis) return null;

  return (
    <div style={{
      background: `${analysis.typeColor}14`,
      border: `1px solid ${analysis.typeColor}44`,
      borderLeft: `4px solid ${analysis.typeColor}`,
      borderRadius: 'var(--radius-lg)',
      padding: '14px 18px',
    }}>
      {/* Type badge + confidence */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{
          fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.1em', color: analysis.typeColor,
        }}>
          🏃 {analysis.trainingType}
        </span>
        {analysis.confidence !== 'high' && (
          <span style={{ fontSize: 10, color: 'var(--text-secondary)', opacity: 0.7 }}>
            (szacunkowo)
          </span>
        )}
      </div>

      {/* Summary */}
      <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6, fontWeight: 500 }}>
        {analysis.summary}
      </div>
    </div>
  );
}
