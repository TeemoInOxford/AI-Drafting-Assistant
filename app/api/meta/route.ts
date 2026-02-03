import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';

interface HeroData {
  hero: string;
  value: number;
  support_weight: number;
}

interface TodayData {
  target_patch: string;
  target_patch_index: number;
  beta_used: number;
  gamma_used: number;
  generated_at_utc?: string;
  total_games_used: number;
  total_weight_sum: number;
  definition?: string;
  heroes: HeroData[];
}

interface LeagueData {
  total_games_used?: number;
  total_actions_used?: number;
  total_weight_sum: number;
  heroes: HeroData[];
}

interface ByLeagueData {
  target_patch: string;
  target_patch_index: number;
  beta_used: number;
  gamma_used: number;
  leagues: Record<string, LeagueData>;
}

const VALID_LEAGUES = ['LCK', 'LPL', 'LEC', 'LCS', 'LTA_N', 'LTA_S'];

// League name normalization map
const LEAGUE_ALIASES: Record<string, string> = {
  'lck': 'LCK',
  'lpl': 'LPL',
  'lec': 'LEC',
  'lcs': 'LCS',
  'lta_n': 'LTA_N',
  'lta_s': 'LTA_S',
  'kr': 'LCK',
  'cn': 'LPL',
  'eu': 'LEC',
  'na': 'LCS',
  'global': 'global',
  'GLOBAL': 'global',
};

function normalizeLeague(input: string | null): string {
  if (!input) return 'global';
  const lower = input.toLowerCase();
  // Check aliases first
  if (LEAGUE_ALIASES[lower]) return LEAGUE_ALIASES[lower];
  if (LEAGUE_ALIASES[input]) return LEAGUE_ALIASES[input];
  // Check if it's already a valid league (case-insensitive)
  const upper = input.toUpperCase();
  if (VALID_LEAGUES.includes(upper)) return upper;
  // Unknown league -> fallback to global
  console.log(`[meta] Unknown league "${input}", falling back to global`);
  return 'global';
}

export async function GET(request: NextRequest) {
  try {
    const dataDir = path.join(process.cwd(), 'data', 'grid_v2');

    const searchParams = request.nextUrl.searchParams;
    const mode = searchParams.get('mode') || 'union';
    const rawLeague = searchParams.get('league');
    const league = normalizeLeague(rawLeague);

    let presenceHeroes: HeroData[];
    let pickRateHeroes: HeroData[];
    let banRateHeroes: HeroData[];
    let targetPatch: string;
    let totalCount: number;
    let totalWeight: number;
    let countLabel: string;

    if (league === 'global') {
      // Global mode - use global files
      const presenceFile = mode === 'action-share'
        ? path.join(dataDir, 'today_presence_global_teamweighted.json')
        : path.join(dataDir, 'today_presence_union_global_teamweighted.json');
      const pickRateFile = path.join(dataDir, 'today_pick_rate_global_teamweighted.json');
      const banRateFile = path.join(dataDir, 'today_ban_rate_global_teamweighted.json');

      const presenceData: TodayData = JSON.parse(fs.readFileSync(presenceFile, 'utf-8'));
      const pickRateData: TodayData = JSON.parse(fs.readFileSync(pickRateFile, 'utf-8'));
      const banRateData: TodayData = JSON.parse(fs.readFileSync(banRateFile, 'utf-8'));

      presenceHeroes = presenceData.heroes;
      pickRateHeroes = pickRateData.heroes;
      banRateHeroes = banRateData.heroes;
      targetPatch = presenceData.target_patch;
      totalWeight = presenceData.total_weight_sum;
      countLabel = mode === 'action-share' ? 'actions' : 'games';
      totalCount = mode === 'action-share'
        ? (presenceData as any).total_actions_used
        : presenceData.total_games_used;
    } else if (VALID_LEAGUES.includes(league)) {
      // League-specific mode - use by_league files
      const presenceFile = mode === 'action-share'
        ? path.join(dataDir, 'today_presence_by_league_teamweighted.json')
        : path.join(dataDir, 'today_presence_union_by_league_teamweighted.json');
      const pickRateFile = path.join(dataDir, 'today_pick_rate_by_league_teamweighted.json');
      const banRateFile = path.join(dataDir, 'today_ban_rate_by_league_teamweighted.json');

      const presenceData: ByLeagueData = JSON.parse(fs.readFileSync(presenceFile, 'utf-8'));
      const pickRateData: ByLeagueData = JSON.parse(fs.readFileSync(pickRateFile, 'utf-8'));
      const banRateData: ByLeagueData = JSON.parse(fs.readFileSync(banRateFile, 'utf-8'));

      const leaguePresence = presenceData.leagues[league];
      const leaguePick = pickRateData.leagues[league];
      const leagueBan = banRateData.leagues[league];

      if (!leaguePresence) {
        return NextResponse.json({ success: false, error: `League ${league} not found` }, { status: 404 });
      }

      presenceHeroes = leaguePresence.heroes;
      pickRateHeroes = leaguePick?.heroes || [];
      banRateHeroes = leagueBan?.heroes || [];
      targetPatch = presenceData.target_patch;
      totalWeight = leaguePresence.total_weight_sum;
      countLabel = mode === 'action-share' ? 'actions' : 'games';
      totalCount = mode === 'action-share'
        ? (leaguePresence as any).total_actions_used
        : leaguePresence.total_games_used || 0;
    } else {
      // This shouldn't happen since normalizeLeague falls back to 'global'
      // But handle it gracefully just in case
      console.error(`[meta] Unexpected league value: ${league}`);
      // Fallback to global
      const presenceFile = mode === 'action-share'
        ? path.join(dataDir, 'today_presence_global_teamweighted.json')
        : path.join(dataDir, 'today_presence_union_global_teamweighted.json');
      const pickRateFile = path.join(dataDir, 'today_pick_rate_global_teamweighted.json');
      const banRateFile = path.join(dataDir, 'today_ban_rate_global_teamweighted.json');

      const presenceData: TodayData = JSON.parse(fs.readFileSync(presenceFile, 'utf-8'));
      const pickRateData: TodayData = JSON.parse(fs.readFileSync(pickRateFile, 'utf-8'));
      const banRateData: TodayData = JSON.parse(fs.readFileSync(banRateFile, 'utf-8'));

      presenceHeroes = presenceData.heroes;
      pickRateHeroes = pickRateData.heroes;
      banRateHeroes = banRateData.heroes;
      targetPatch = presenceData.target_patch;
      totalWeight = presenceData.total_weight_sum;
      countLabel = mode === 'action-share' ? 'actions' : 'games';
      totalCount = mode === 'action-share'
        ? (presenceData as any).total_actions_used
        : presenceData.total_games_used;
    }

    // Build lookup maps
    const pickRateMap: Record<string, number> = {};
    for (const h of pickRateHeroes) {
      pickRateMap[h.hero] = h.value;
    }

    const banRateMap: Record<string, number> = {};
    for (const h of banRateHeroes) {
      banRateMap[h.hero] = h.value;
    }

    // Build champions array
    const champions = presenceHeroes.map(h => ({
      name: h.hero,
      presence: h.value * 100,
      pickRate: (pickRateMap[h.hero] ?? 0) * 100,
      banRate: (banRateMap[h.hero] ?? 0) * 100,
    }));

    return NextResponse.json({
      success: true,
      data: {
        champions,
        targetPatch,
        totalGames: totalCount,
        totalWeight,
        presenceMode: mode,
        countLabel,
        league,
      },
    });
  } catch (error) {
    console.error('Error loading meta data:', error);
    return NextResponse.json({ success: false, error: 'Failed to load meta data' }, { status: 500 });
  }
}
