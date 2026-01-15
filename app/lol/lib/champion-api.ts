import { Champion, DDragonChampionData } from './types';
import { getChampionPositions } from './positions';

const DDRAGON_BASE = 'https://ddragon.leagueoflegends.com';

// 获取最新版本
export async function getLatestVersion(): Promise<string> {
  const res = await fetch(`${DDRAGON_BASE}/api/versions.json`);
  const versions: string[] = await res.json();
  return versions[0];
}

// 获取英雄数据（同时获取中英文）
export async function getChampions(version: string): Promise<Champion[]> {
  // 并行获取中英文数据
  const [enRes, zhRes] = await Promise.all([
    fetch(`${DDRAGON_BASE}/cdn/${version}/data/en_US/champion.json`),
    fetch(`${DDRAGON_BASE}/cdn/${version}/data/zh_CN/champion.json`),
  ]);

  const enData: DDragonChampionData = await enRes.json();
  const zhData: DDragonChampionData = await zhRes.json();

  // 合并数据
  return Object.values(enData.data).map((champ) => {
    const zhChamp = zhData.data[champ.id];
    return {
      id: champ.id,
      key: champ.key,
      name: champ.name, // 默认英文
      enName: champ.name,
      zhName: zhChamp?.name || champ.name,
      image: `${DDRAGON_BASE}/cdn/${version}/img/champion/${champ.id}.png`,
      positions: getChampionPositions(champ.id),
    };
  });
}

// 获取英雄头像URL
export function getChampionImageUrl(version: string, championId: string): string {
  return `${DDRAGON_BASE}/cdn/${version}/img/champion/${championId}.png`;
}
