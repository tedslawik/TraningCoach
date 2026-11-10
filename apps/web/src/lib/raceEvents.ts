import { useCallback, useEffect, useState } from 'react';
import type { SeasonRace } from '@tricoach/core';
import { supabase } from './supabase';
import { useAuth } from '../context/AuthContext';

/** A planned race stored in `race_events` (see supabase/migrations). */
export interface RaceEvent extends SeasonRace { id?: string }

const COLUMNS = 'id, date, priority, distance, name';

function friendly(err: { message: string; code?: string }): Error {
  if (err.code === '23505')
    return new Error('Taki start (ta sama data i dystans) jest już zapisany — usuń duplikat z listy.');
  if (err.code === '42P01' || err.code === 'PGRST205' || /race_events/.test(err.message) && /exist|find/i.test(err.message))
    return new Error('Brak tabeli race_events w bazie — uruchom migrację supabase/migrations/20261109120000_race_events.sql.');
  return new Error(err.message);
}

export async function fetchRaceEvents(userId: string): Promise<RaceEvent[]> {
  const { data, error } = await supabase.from('race_events').select(COLUMNS)
    .eq('user_id', userId).order('date', { ascending: true });
  if (error) throw friendly(error);
  return (data ?? []).map(r => ({ ...r, name: r.name ?? '' })) as RaceEvent[];
}

/** Replaces the user's event list with `rows`: deletes removed rows, updates kept ones, inserts new ones. */
export async function saveRaceEvents(userId: string, rows: RaceEvent[], previous: RaceEvent[]): Promise<RaceEvent[]> {
  const now  = new Date().toISOString();
  const keep = new Set(rows.map(r => r.id).filter(Boolean));
  const removed = previous.map(p => p.id).filter((id): id is string => !!id && !keep.has(id));
  const toRow = (r: RaceEvent) => ({
    user_id: userId, date: r.date, priority: r.priority, distance: r.distance,
    name: r.name?.trim() || null, updated_at: now,
  });

  if (removed.length) {
    const { error } = await supabase.from('race_events').delete().in('id', removed);
    if (error) throw friendly(error);
  }
  const updates = rows.filter(r => r.id).map(r => ({ id: r.id, ...toRow(r) }));
  if (updates.length) {
    const { error } = await supabase.from('race_events').upsert(updates, { onConflict: 'id' });
    if (error) throw friendly(error);
  }
  const inserts = rows.filter(r => !r.id).map(toRow);
  if (inserts.length) {
    const { error } = await supabase.from('race_events').insert(inserts);
    if (error) throw friendly(error);
  }
  return fetchRaceEvents(userId);
}

/** The signed-in user's planned races, sorted by date. */
export function useRaceEvents() {
  const { user } = useAuth();
  const [events, setEvents]   = useState<RaceEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!user) { setEvents([]); setLoading(false); return; }
    setLoading(true);
    try { setEvents(await fetchRaceEvents(user.id)); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Błąd wczytywania startów'); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { reload(); }, [reload]);

  const save = useCallback(async (rows: RaceEvent[]) => {
    if (!user) throw new Error('Zaloguj się, aby zapisać starty.');
    const saved = await saveRaceEvents(user.id, rows, events);
    setEvents(saved);
    return saved;
  }, [user, events]);

  return { events, loading, error, reload, save };
}
