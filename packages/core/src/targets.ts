import { RaceType, TrainingTarget } from './types';

export const RACE_TARGETS: Record<RaceType, TrainingTarget> = {
  sprint:  { swim: 15, bike: 45, run: 40 },
  olympic: { swim: 18, bike: 42, run: 40 },
  half:    { swim: 20, bike: 45, run: 35 },
  full:    { swim: 18, bike: 50, run: 32 },
};

export const RACE_LABELS: Record<RaceType, string> = {
  sprint:  'Sprint (0.75/20/5)',
  olympic: 'Olympic (1.5/40/10)',
  half:    'Half Ironman (1.9/90/21)',
  full:    'Full Ironman (3.8/180/42)',
};
