#!/usr/bin/env python3
"""
GRID In-Game Data Fetcher
=========================
正确获取 LOL 比赛 in-game 数据的完整示例

[!] 常见错误：
1. 只用 Central Data API → 只能拿外层数据（比赛名、时间）
2. 没用 Series State API → 拿不到 BP、KDA、伤害等内层数据
3. 没用 LOL Fragment → 拿不到 LOL 专属字段（visionScore、kdaRatio）

[OK] 正确做法：
1. Central Data API 获取比赛列表 → 拿到 series_id
2. Series State API + LOL Fragment 获取完整 in-game 数据
"""

import requests
import json
from datetime import datetime

# ============================================================
# API 配置
# ============================================================
CENTRAL_API_URL = "https://api-op.grid.gg/central-data/graphql"  # 比赛列表
STATE_API_URL = "https://api-op.grid.gg/live-data-feed/series-state/graphql"  # In-Game 数据
API_KEY = "crM9kbj1QQVhzN6vm19DiYwJUl4lMoTdSHVBlMO8"  # Open Access Key

HEADERS = {
    "Content-Type": "application/json",
    "x-api-key": API_KEY
}


def fetch_recent_series(count=5):
    """
    Step 1: 获取最近的比赛列表（外层数据）
    这只能拿到比赛名、时间、战队名等基础信息
    """
    query = """
    query GetRecentSeries($first: Int!) {
        allSeries(
            first: $first
            filter: { titleId: "3" }
            orderBy: StartTimeScheduled
            orderDirection: DESC
        ) {
            edges {
                node {
                    id
                    startTimeScheduled
                    format { name }
                    tournament { name }
                    teams {
                        baseInfo { id name }
                    }
                }
            }
        }
    }
    """

    response = requests.post(
        CENTRAL_API_URL,
        headers=HEADERS,
        json={"query": query, "variables": {"first": count}},
        timeout=30
    )

    data = response.json()

    if "errors" in data:
        print(f"[ERROR] 错误: {data['errors']}")
        return []

    series_list = []
    for edge in data["data"]["allSeries"]["edges"]:
        node = edge["node"]
        series_list.append({
            "id": node["id"],
            "time": node["startTimeScheduled"],
            "format": node["format"]["name"] if node.get("format") else "?",
            "tournament": node["tournament"]["name"] if node.get("tournament") else "?",
            "teams": [t["baseInfo"]["name"] for t in node.get("teams", [])]
        })

    return series_list


def fetch_ingame_data(series_id):
    """
    Step 2: 获取完整的 In-Game 数据（内层数据）

    [*] 关键点：
    1. 使用 Series State API（不是 Central Data API）
    2. 使用 ... on GameTeamStateLol 获取战队扩展字段
    3. 使用 ... on GamePlayerStateLol 获取选手扩展字段
    """
    query = """
    query GetSeriesState($id: ID!) {
        seriesState(id: $id) {
            # ===== 系列赛基础信息 =====
            id
            format
            started
            finished
            startedAt
            duration

            # ===== 系列赛战队统计 =====
            teams {
                id
                name
                score
                won
                kills
                deaths
                players {
                    id
                    name
                }
            }

            # ===== 单局游戏数据 =====
            games {
                id
                sequenceNumber
                started
                finished
                startedAt
                duration

                # ===== BP 数据 =====
                draftActions {
                    type           # ban 或 pick
                    sequenceNumber # 顺序
                    drafter {
                        id         # 战队 ID
                        type       # team
                    }
                    draftable {
                        id         # 英雄 ID
                        type       # character
                        name       # 英雄名称
                    }
                }

                # ===== 战队单局统计 =====
                teams {
                    id
                    name
                    side           # blue 或 red
                    won
                    kills
                    deaths
                    netWorth

                    # [*] LOL 专属扩展字段（必须用 Fragment）
                    ... on GameTeamStateLol {
                        damageDealt
                        damageTaken
                        damagePerMinute
                        damagePerMoney
                        visionScore
                        visionScorePerMinute
                        experiencePoints
                        moneyDifference
                        moneyPerMinute
                        totalMoneyEarned
                        majorMoneyLead
                        majorMoneyDeficit
                        forwardPercentage
                        kdaRatio
                        killsAndAssists
                        firstKill
                        baronPowerPlays { id value }
                    }

                    # ===== 目标统计 =====
                    objectives {
                        id
                        type           # dragon, baron, tower 等
                        completedFirst
                        completionCount
                    }

                    # ===== 选手单局统计 =====
                    players {
                        id
                        name
                        character {
                            id
                            name       # 英雄名称
                        }
                        kills
                        deaths

                        # [*] LOL 选手专属扩展字段
                        ... on GamePlayerStateLol {
                            damageDealt
                            damageTaken
                            damagePercentage
                            damagePerMinute
                            damagePerMoney
                            visionScore
                            visionScorePerMinute
                            kdaRatio
                            killParticipation
                            killsAndAssists
                            experiencePoints
                            moneyPercentage
                            moneyPerMinute
                            totalMoneyEarned
                            forwardPercentage
                            alive
                            currentHealth
                            maxHealth
                            currentArmor
                            respawnClock { currentSeconds }
                        }

                        # ===== 装备 =====
                        inventory {
                            items {
                                id
                                name
                                quantity
                            }
                        }

                        # ===== 目标 =====
                        objectives {
                            id
                            type
                            completedFirst
                            completionCount
                        }
                    }
                }
            }
        }
    }
    """

    response = requests.post(
        STATE_API_URL,  # [!] 注意：这里用的是 Series State API
        headers=HEADERS,
        json={"query": query, "variables": {"id": series_id}},
        timeout=60
    )

    data = response.json()

    if "errors" in data:
        print(f"[ERROR] 错误: {data['errors']}")
        return None

    return data.get("data", {}).get("seriesState")


def print_series_data(state):
    """格式化输出比赛数据"""
    if not state:
        print("[ERROR] 没有数据")
        return

    print("\n" + "=" * 70)
    print(f"[Series] Series ID: {state['id']}")
    print(f"   赛制: {state['format']}")
    print(f"   状态: {'已结束' if state['finished'] else '进行中'}")
    print("=" * 70)

    # 总比分
    print("\n[Score] 系列赛比分:")
    for t in state.get("teams", []):
        win = "[WIN]" if t.get("won") else "  "
        print(f"   {win} {t['name']}: {t['score']} 局 (K/D: {t['kills']}/{t['deaths']})")

    # 各局详情
    for game in state.get("games", []):
        print(f"\n{'-' * 70}")
        print(f"[Game] Game {game['sequenceNumber']}")

        # BP
        bans = [a["draftable"]["name"] for a in game.get("draftActions", []) if a["type"] == "ban"]
        if bans:
            print(f"   Bans: {', '.join(bans[:10])}")

        # 战队
        for team in game.get("teams", []):
            side = "[BLUE]" if team["side"] == "blue" else "[RED]"
            win = "[WIN]" if team.get("won") else ""

            print(f"\n   {side} {team['name']} {win}")
            print(f"      K/D: {team['kills']}/{team['deaths']} | 经济: {team['netWorth']:,}")
            print(f"      伤害: {team.get('damageDealt', 'N/A'):,} | 视野: {team.get('visionScore', 0):.1f}")

            # 选手
            print(f"      选手:")
            for p in team.get("players", []):
                char = p.get("character", {}).get("name", "?")
                kd = f"{p['kills']}/{p['deaths']}"
                dmg = p.get("damageDealt", 0)
                kp = p.get("killParticipation", 0)
                print(f"         {p['name']:10} | {char:12} | {kd:5} | 伤害:{dmg:,} | 参战:{kp:.1f}%")


def main():
    print("=" * 70)
    print("GRID In-Game Data Fetcher")
    print("=" * 70)

    # Step 1: 获取最近比赛列表
    print("\n[API] Step 1: 获取最近比赛列表...")
    series_list = fetch_recent_series(10)  # 增加到10场比赛

    if not series_list:
        print("[ERROR] 无法获取比赛列表")
        return

    print(f"   找到 {len(series_list)} 场比赛:")
    for s in series_list:
        teams = " vs ".join(s["teams"][:2]) if s["teams"] else "TBD"
        print(f"   - [{s['id']}] {s['tournament'][:40]}...")
        print(f"     {teams} ({s['format']})")

    # Step 2: 获取所有比赛的 in-game 数据
    print(f"\n[API] Step 2: 获取所有比赛的 In-Game 数据...")

    success_count = 0
    for idx, series in enumerate(series_list, 1):
        target_id = series["id"]
        print(f"\n[{idx}/{len(series_list)}] 获取 Series ID: {target_id}...")

        state = fetch_ingame_data(target_id)

        if state:
            print("   [OK] 成功获取 In-Game 数据!")
            print_series_data(state)

            # 保存到文件
            filename = f"series_{target_id}_data.json"
            with open(filename, "w", encoding="utf-8") as f:
                json.dump(state, f, ensure_ascii=False, indent=2)
            print(f"\n[SAVE] 数据已保存到: {filename}")
            success_count += 1
        else:
            print("   [ERROR] 获取失败")

    print(f"\n[DONE] 成功获取 {success_count}/{len(series_list)} 场比赛数据")


if __name__ == "__main__":
    main()
