import { Champion, DDragonChampionData } from './types';
import { getChampionPositions } from './positions';
import { getChampionClass } from './classes';

const DDRAGON_BASE = 'https://ddragon.leagueoflegends.com';

// Get latest version
export async function getLatestVersion(): Promise<string> {
  // Hardcoded to 15.17 for stability
  return '15.17.1';
}

// Get champion data
export async function getChampions(version: string): Promise<Champion[]> {
  const res = await fetch(`${DDRAGON_BASE}/cdn/${version}/data/en_US/champion.json`);
  const data: DDragonChampionData = await res.json();

  return Object.values(data.data).map((champ) => ({
    id: champ.id,
    key: champ.key,
    name: champ.name,
    image: `${DDRAGON_BASE}/cdn/${version}/img/champion/${champ.id}.png`,
    positions: getChampionPositions(champ.id),
    class: getChampionClass(champ.id),
  }));
}

// Get champion image URL
export function getChampionImageUrl(version: string, championId: string): string {
  return `${DDRAGON_BASE}/cdn/${version}/img/champion/${championId}.png`;
}
