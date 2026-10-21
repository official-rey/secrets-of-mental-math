import { createClient, type RealtimeChannel, type Session, type SupabaseClient } from '@supabase/supabase-js';

/**
 * The Supabase project. The anon key is meant to be public: what it can do is limited by the
 * row-level security and functions in supabase/schema.sql. Leave both empty to run offline.
 */
const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY: string = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const online = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let client: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (!online) throw new Error('Online play is not set up.');
  // PKCE puts the sign-in code in the query string, which leaves the hash router alone.
  client ??= createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true } });
  return client;
}

export interface Profile {
  id: string;
  username: string | null;
  rating: number;
  games: number;
  wins: number;
}

export interface Match {
  id: string;
  seed: number;
  starts_at: string;
  done: boolean;
  me_score: number | null;
  them_score: number | null;
  me_delta: number | null;
  them_name: string;
  them_rating: number;
  me_rating: number;
  server_now: string;
}

export interface ScoreRow {
  username: string;
  score: number;
  rating: number;
  played_at: string;
}

export interface RatingRow {
  username: string;
  rating: number;
  games: number;
  wins: number;
}

/** Turn a Supabase error into a short message for the screen. */
function check<R extends { error: { message: string } | null }>(res: R): R extends { data: infer D } ? D : void {
  if (res.error) throw new Error(res.error.message);
  return (res as unknown as { data: never }).data;
}

/** Where sign-in links come back to: this page, without any query or hash. */
const returnUrl = () => `${location.origin}${location.pathname}`;

export async function session(): Promise<Session | null> {
  if (!online) return null;
  return check(await db().auth.getSession())?.session ?? null;
}

export function onAuthChange(fn: () => void): () => void {
  if (!online) return () => {};
  const { data } = db().auth.onAuthStateChange(() => fn());
  return () => data.subscription.unsubscribe();
}

/** Whether Google sign-in is switched on in the project, so the button shows only when it works. */
export async function googleEnabled(): Promise<boolean> {
  if (!online) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_ANON_KEY } });
    return Boolean((await res.json())?.external?.google);
  } catch {
    return false;
  }
}

export async function signInWithGoogle(next = '#/play') {
  sessionStorageSet('after-sign-in', next);
  check(await db().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: returnUrl() } }));
}

export async function signInWithEmail(email: string, next = '#/play') {
  sessionStorageSet('after-sign-in', next);
  check(await db().auth.signInWithOtp({ email, options: { emailRedirectTo: returnUrl() } }));
}

export async function signOut() {
  check(await db().auth.signOut());
}

/** After a sign-in redirect: the page the player was going to, once. */
export function takeAfterSignIn(): string | null {
  try {
    const v = sessionStorage.getItem('after-sign-in');
    sessionStorage.removeItem('after-sign-in');
    return v;
  } catch {
    return null;
  }
}

function sessionStorageSet(k: string, v: string) {
  try {
    sessionStorage.setItem(k, v);
  } catch {
    /* private mode: the player lands on the home page instead */
  }
}

export async function myProfile(): Promise<Profile | null> {
  const s = await session();
  if (!s) return null;
  return check(await db().from('profiles').select('id, username, rating, games, wins').eq('id', s.user.id).maybeSingle()) as Profile | null;
}

export async function setUsername(name: string) {
  check(await db().rpc('set_username', { name }));
}

export async function beginTest() {
  check(await db().rpc('begin_test'));
}

export async function submitScore(score: number) {
  check(await db().rpc('submit_score', { score }));
}

export async function topScores(span: 'all' | 'week'): Promise<ScoreRow[]> {
  return check(await db().rpc('top_scores', { span, lim: 50 })) as ScoreRow[];
}

export async function topRatings(): Promise<RatingRow[]> {
  return check(await db().rpc('top_ratings', { lim: 50 })) as RatingRow[];
}

/** One step of the search: the match id once paired, or null to keep waiting. */
export async function findMatch(): Promise<string | null> {
  const m = check(await db().rpc('find_match')) as { id: string | null } | null;
  return m?.id ?? null;
}

export async function leaveQueue() {
  await db().rpc('leave_queue');
}

export async function matchView(id: string): Promise<Match | null> {
  const rows = check(await db().rpc('match_view', { match_id: id })) as Match[];
  return rows[0] ?? null;
}

export async function submitMatch(id: string, score: number | null) {
  check(await db().rpc('submit_match', { match_id: id, score }));
}

/**
 * The live part of a match: each player broadcasts their score as it changes, and hears the
 * other's. Nothing here is trusted for the result; only the submitted scores count.
 */
export function raceChannel(matchId: string, userId: string, onTheirs: (score: number) => void): { send(score: number): void; close(): void } {
  const ch: RealtimeChannel = db().channel(`match:${matchId}`, { config: { broadcast: { self: false } } });
  ch.on('broadcast', { event: 'score' }, ({ payload }) => {
    if (payload?.user !== userId && typeof payload?.score === 'number') onTheirs(payload.score);
  }).subscribe();
  return {
    send: (score) => void ch.send({ type: 'broadcast', event: 'score', payload: { user: userId, score } }),
    close: () => void db().removeChannel(ch),
  };
}
