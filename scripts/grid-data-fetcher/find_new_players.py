#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
找出新增的选手
比较旧数据和当前API数据
"""

import json
import requests
import time

API_URL = "https://api-op.grid.gg/central-data/graphql"
API_KEY = "crM9kbj1QQVhzN6vm19DiYwJUl4lMoTdSHVBlMO8"
LOL_TITLE_ID = "3"

OLD_DATA_FILE = "/www/wwwroot/AI-Drafting-Assistant/scripts/grid-data-fetcher/data/lol_players.json"

headers = {
    "Content-Type": "application/json",
    "x-api-key": API_KEY
}

def fetch_all_current_player_ids():
    """获取当前所有LOL选手ID"""
    query = """
    query GetPlayers($first: Int!, $after: String, $filter: PlayerFilter) {
        players(first: $first, after: $after, filter: $filter) {
            totalCount
            pageInfo {
                hasNextPage
                endCursor
            }
            edges {
                node {
                    id
                    nickname
                    team {
                        id
                        name
                        nameShortened
                    }
                }
            }
        }
    }
    """

    all_players = {}
    has_next = True
    cursor = None
    page = 0

    while has_next:
        page += 1
        variables = {
            "first": 100,
            "filter": {"titleId": LOL_TITLE_ID}
        }
        if cursor:
            variables["after"] = cursor

        response = requests.post(
            API_URL,
            headers=headers,
            json={"query": query, "variables": variables},
            timeout=30
        )

        if response.status_code == 429:
            print("Rate limited, waiting 60s...")
            time.sleep(60)
            continue

        data = response.json()
        players_data = data.get("data", {}).get("players", {})

        for edge in players_data.get("edges", []):
            node = edge["node"]
            all_players[node["id"]] = node

        page_info = players_data.get("pageInfo", {})
        has_next = page_info.get("hasNextPage", False)
        cursor = page_info.get("endCursor")

        if page % 50 == 0:
            print(f"Page {page}, fetched {len(all_players)} players...")

        time.sleep(0.3)  # Rate limiting

    return all_players

def main():
    print("加载旧数据...")
    with open(OLD_DATA_FILE, 'r', encoding='utf-8') as f:
        old_players = json.load(f)

    old_ids = set(p["id"] for p in old_players)
    print(f"旧数据: {len(old_ids)} 个选手")

    print("\n获取当前API数据...")
    current_players = fetch_all_current_player_ids()
    current_ids = set(current_players.keys())
    print(f"当前数据: {len(current_ids)} 个选手")

    # 找出新增的选手
    new_ids = current_ids - old_ids
    print(f"\n新增选手: {len(new_ids)} 个")

    if new_ids:
        print("\n=== 新增选手列表 ===")
        for pid in sorted(new_ids, key=int):
            player = current_players[pid]
            team_info = ""
            if player.get("team"):
                team = player["team"]
                team_info = f" | 战队: {team['name']} ({team.get('nameShortened', '')})"
            print(f"ID: {pid} | 昵称: {player['nickname']}{team_info}")

    # 找出删除的选手
    removed_ids = old_ids - current_ids
    if removed_ids:
        print(f"\n删除的选手: {len(removed_ids)} 个")
        for pid in sorted(removed_ids, key=int):
            old_player = next((p for p in old_players if p["id"] == pid), None)
            if old_player:
                print(f"ID: {pid} | 昵称: {old_player.get('nickname', 'Unknown')}")

if __name__ == "__main__":
    main()
