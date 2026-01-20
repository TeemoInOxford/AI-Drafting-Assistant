#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
获取有比赛记录的LOL数据
- 只统计有参赛记录的选手/战队/联赛
- 构建干净的层级结构
"""

import json
import requests
import time
import os
from collections import defaultdict

API_URL = "https://api-op.grid.gg/central-data/graphql"
API_KEY = "crM9kbj1QQVhzN6vm19DiYwJUl4lMoTdSHVBlMO8"
LOL_TITLE_ID = "3"

DATA_DIR = os.path.dirname(os.path.abspath(__file__)) + "/data"

headers = {
    "Content-Type": "application/json",
    "x-api-key": API_KEY
}

# 赛区映射
REGION_MAP = {
    "LPL": {"name": "LPL", "fullName": "League of Legends Pro League", "country": "中国"},
    "LCK": {"name": "LCK", "fullName": "League of Legends Champions Korea", "country": "韩国"},
    "LEC": {"name": "LEC", "fullName": "League of Legends EMEA Championship", "country": "欧洲"},
    "LCS": {"name": "LCS", "fullName": "League of Legends Championship Series", "country": "北美"},
    "LTA": {"name": "LTA", "fullName": "League of Legends Americas", "country": "美洲"},
    "PCS": {"name": "PCS", "fullName": "Pacific Championship Series", "country": "太平洋"},
    "VCS": {"name": "VCS", "fullName": "Vietnam Championship Series", "country": "越南"},
    "LJL": {"name": "LJL", "fullName": "League of Legends Japan League", "country": "日本"},
    "LCO": {"name": "LCO", "fullName": "League of Legends Circuit Oceania", "country": "大洋洲"},
    "CBLOL": {"name": "CBLOL", "fullName": "Campeonato Brasileiro de League of Legends", "country": "巴西"},
    "LLA": {"name": "LLA", "fullName": "Liga Latinoamérica", "country": "拉丁美洲"},
    "TCL": {"name": "TCL", "fullName": "Turkish Championship League", "country": "土耳其"},
    "LCL": {"name": "LCL", "fullName": "League of Legends Continental League", "country": "独联体"},
    "Worlds": {"name": "Worlds", "fullName": "League of Legends World Championship", "country": "全球"},
    "MSI": {"name": "MSI", "fullName": "Mid-Season Invitational", "country": "全球"},
    "All-Star": {"name": "All-Star", "fullName": "League of Legends All-Star Event", "country": "全球"},
    "EMEA": {"name": "EMEA Masters", "fullName": "EMEA Masters", "country": "欧洲"},
    "NLC": {"name": "NLC", "fullName": "Northern League of Legends Championship", "country": "北欧"},
    "EBL": {"name": "EBL", "fullName": "Esports Balkan League", "country": "巴尔干"},
    "LFL": {"name": "LFL", "fullName": "La Ligue Française", "country": "法国"},
    "PRM": {"name": "Prime League", "fullName": "Prime League", "country": "德国"},
    "LVP": {"name": "LVP", "fullName": "Liga de Videojuegos Profesional", "country": "西班牙"},
    "PG": {"name": "PG Nationals", "fullName": "PG Nationals", "country": "意大利"},
    "HLL": {"name": "HLL", "fullName": "Hitpoint Masters", "country": "捷克"},
    "EL": {"name": "Elite Series", "fullName": "Elite Series", "country": "荷兰/比利时"},
    "LRN": {"name": "LRN", "fullName": "Liga Regional Norte", "country": "墨西哥"},
    "LRS": {"name": "LRS", "fullName": "Liga Regional Sur", "country": "南美"},
}

def make_request(query, variables=None, max_retries=5):
    """发送GraphQL请求，带重试"""
    for attempt in range(max_retries):
        try:
            payload = {"query": query}
            if variables:
                payload["variables"] = variables

            response = requests.post(API_URL, headers=headers, json=payload, timeout=30)

            if response.status_code == 429:
                wait_time = 60 * (attempt + 1)
                print(f"  Rate limited, waiting {wait_time}s...")
                time.sleep(wait_time)
                continue

            data = response.json()
            if "errors" in data:
                error_msg = str(data['errors'])
                if "rate limit" in error_msg.lower() or "ENHANCE_YOUR_CALM" in error_msg:
                    wait_time = 60 * (attempt + 1)
                    print(f"  Rate limited (GraphQL), waiting {wait_time}s...")
                    time.sleep(wait_time)
                    continue
                print(f"  GraphQL error: {data['errors']}")
                return None

            return data.get("data")
        except Exception as e:
            print(f"  Request error: {e}")
            time.sleep(5)
    return None

def extract_region(tournament_name):
    """从联赛名称提取赛区"""
    name_upper = tournament_name.upper()

    # 先检查全球赛事
    if "WORLD" in name_upper or "WORLDS" in name_upper:
        return "Worlds"
    if "MSI" in name_upper or "MID-SEASON" in name_upper:
        return "MSI"
    if "ALL-STAR" in name_upper or "ALLSTAR" in name_upper:
        return "All-Star"
    if "EMEA MASTERS" in name_upper or "EMEA_MASTERS" in name_upper:
        return "EMEA"

    # 检查具体赛区 - 精确匹配
    region_patterns = [
        ("LPL", "LPL"),
        ("LCK", "LCK"),
        ("LEC", "LEC"),
        ("LCS", "LCS"),
        ("LTA NORTH", "LTA"),
        ("LTA SOUTH", "LTA"),
        ("LTA ", "LTA"),
        ("PCS", "PCS"),
        ("VCS", "VCS"),
        ("LJL", "LJL"),
        ("LCO", "LCO"),
        ("CBLOL", "CBLOL"),
        ("LLA", "LLA"),
        ("TCL", "TCL"),
        ("LCL", "LCL"),
        ("NLC", "NLC"),
        ("EBL", "EBL"),
        ("LFL", "LFL"),
        ("PRIME LEAGUE", "PRM"),
        ("SUPERLIGA", "LVP"),
        ("PG NATIONALS", "PG"),
        ("HITPOINT", "HLL"),
        ("ELITE SERIES", "EL"),
    ]

    for pattern, region in region_patterns:
        if pattern in name_upper:
            return region

    return "Other"

def fetch_tournaments_with_teams():
    """获取有战队的联赛"""
    print("获取联赛数据...")

    query = """
    query GetTournaments($first: Int!, $after: String, $filter: TournamentFilter) {
        tournaments(first: $first, after: $after, filter: $filter) {
            totalCount
            pageInfo {
                hasNextPage
                endCursor
            }
            edges {
                node {
                    id
                    name
                    nameShortened
                    startDate
                    endDate
                    parent {
                        id
                    }
                    teams {
                        id
                        name
                        nameShortened
                        logoUrl
                    }
                }
            }
        }
    }
    """

    all_tournaments = []
    has_next = True
    cursor = None
    page = 0

    while has_next:
        page += 1
        variables = {
            "first": 50,
            "filter": {"titleId": LOL_TITLE_ID}
        }
        if cursor:
            variables["after"] = cursor

        data = make_request(query, variables)
        if not data:
            break

        tournaments_data = data.get("tournaments", {})

        for edge in tournaments_data.get("edges", []):
            node = edge["node"]
            # 只保留有战队的联赛
            if node.get("teams") and len(node["teams"]) > 0:
                all_tournaments.append(node)

        page_info = tournaments_data.get("pageInfo", {})
        has_next = page_info.get("hasNextPage", False)
        cursor = page_info.get("endCursor")

        if page % 10 == 0:
            print(f"  Page {page}, 已获取 {len(all_tournaments)} 个有战队的联赛")

        time.sleep(0.5)

    print(f"  共 {len(all_tournaments)} 个有战队的联赛")
    return all_tournaments

def fetch_players_with_teams():
    """获取有战队的选手"""
    print("\n获取选手数据...")

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
            "first": 50,
            "filter": {"titleId": LOL_TITLE_ID}
        }
        if cursor:
            variables["after"] = cursor

        data = make_request(query, variables)
        if not data:
            break

        players_data = data.get("players", {})

        for edge in players_data.get("edges", []):
            node = edge["node"]
            # 只保留有战队的选手
            if node.get("team"):
                all_players[node["id"]] = node

        page_info = players_data.get("pageInfo", {})
        has_next = page_info.get("hasNextPage", False)
        cursor = page_info.get("endCursor")

        if page % 50 == 0:
            print(f"  Page {page}, 已获取 {len(all_players)} 个有战队的选手")

        time.sleep(0.5)  # Increased delay to avoid rate limits

    print(f"  共 {len(all_players)} 个有战队的选手")
    return all_players

def build_clean_hierarchy(tournaments, players_with_teams):
    """构建干净的层级结构"""
    print("\n构建层级结构...")

    # 建立战队ID到选手的映射
    team_to_players = defaultdict(list)
    for player_id, player in players_with_teams.items():
        if player.get("team"):
            team_id = player["team"]["id"]
            team_to_players[team_id].append({
                "id": player_id,
                "nickname": player["nickname"]
            })

    # 统计
    all_teams = {}  # team_id -> team_info
    all_players = {}  # player_id -> player_info
    regions = defaultdict(lambda: {
        "tournaments": [],
        "team_ids": set(),
        "player_ids": set()
    })

    for tournament in tournaments:
        region_code = extract_region(tournament["name"])

        # 处理战队和选手
        tournament_teams = []
        for team in tournament.get("teams", []):
            team_id = team["id"]

            # 获取该战队的选手
            team_players = team_to_players.get(team_id, [])

            # 收集战队信息
            if team_id not in all_teams:
                all_teams[team_id] = {
                    "id": team_id,
                    "name": team["name"],
                    "nameShortened": team.get("nameShortened", ""),
                    "logoUrl": team.get("logoUrl", ""),
                    "players": team_players
                }

            # 收集选手信息
            for player in team_players:
                player_id = player["id"]
                if player_id not in all_players:
                    all_players[player_id] = {
                        "id": player_id,
                        "nickname": player["nickname"],
                        "teamId": team_id
                    }
                regions[region_code]["player_ids"].add(player_id)

            tournament_teams.append({
                "id": team_id,
                "name": team["name"],
                "nameShortened": team.get("nameShortened", ""),
                "logoUrl": team.get("logoUrl", ""),
                "playerCount": len(team_players)
            })

            regions[region_code]["team_ids"].add(team_id)

        # 添加联赛
        regions[region_code]["tournaments"].append({
            "id": tournament["id"],
            "name": tournament["name"],
            "nameShortened": tournament.get("nameShortened", ""),
            "startDate": tournament.get("startDate"),
            "endDate": tournament.get("endDate"),
            "teamCount": len(tournament_teams),
            "teams": tournament_teams
        })

    # 构建最终结构
    hierarchy = []
    for region_code, region_data in sorted(regions.items()):
        if region_code == "Other":
            continue  # 跳过无法识别的赛区

        region_info = REGION_MAP.get(region_code, {
            "name": region_code,
            "fullName": region_code,
            "country": "其他"
        })

        # 按开始日期排序联赛（最新的在前）
        sorted_tournaments = sorted(
            region_data["tournaments"],
            key=lambda x: x.get("startDate") or "0000",
            reverse=True
        )

        hierarchy.append({
            "code": region_code,
            "name": region_info["name"],
            "fullName": region_info["fullName"],
            "country": region_info["country"],
            "tournamentCount": len(region_data["tournaments"]),
            "teamCount": len(region_data["team_ids"]),
            "playerCount": len(region_data["player_ids"]),
            "tournaments": sorted_tournaments
        })

    # 按选手数量排序
    hierarchy.sort(key=lambda x: x["playerCount"], reverse=True)

    # 统计总数
    stats = {
        "totalTournaments": len(tournaments),
        "totalTeams": len(all_teams),
        "totalPlayers": len(all_players),
        "regionCount": len(hierarchy)
    }

    return hierarchy, all_teams, all_players, stats

def main():
    print("=" * 60)
    print("获取有比赛记录的LOL数据")
    print("=" * 60)

    # 获取联赛数据
    tournaments = fetch_tournaments_with_teams()

    # 获取有战队的选手
    players_with_teams = fetch_players_with_teams()

    # 构建层级
    hierarchy, teams, players, stats = build_clean_hierarchy(tournaments, players_with_teams)

    # 保存数据
    os.makedirs(DATA_DIR, exist_ok=True)

    with open(f"{DATA_DIR}/lol_hierarchy_clean.json", "w", encoding="utf-8") as f:
        json.dump(hierarchy, f, ensure_ascii=False, indent=2)
    print(f"\n保存 lol_hierarchy_clean.json")

    with open(f"{DATA_DIR}/lol_teams_clean.json", "w", encoding="utf-8") as f:
        json.dump(list(teams.values()), f, ensure_ascii=False, indent=2)
    print(f"保存 lol_teams_clean.json")

    with open(f"{DATA_DIR}/lol_players_clean.json", "w", encoding="utf-8") as f:
        json.dump(list(players.values()), f, ensure_ascii=False, indent=2)
    print(f"保存 lol_players_clean.json")

    with open(f"{DATA_DIR}/lol_stats.json", "w", encoding="utf-8") as f:
        json.dump(stats, f, ensure_ascii=False, indent=2)
    print(f"保存 lol_stats.json")

    # 打印统计
    print("\n" + "=" * 60)
    print("统计信息（仅有比赛记录的数据）")
    print("=" * 60)
    print(f"赛区数: {stats['regionCount']}")
    print(f"联赛数: {stats['totalTournaments']}")
    print(f"战队数: {stats['totalTeams']}")
    print(f"选手数: {stats['totalPlayers']}")

    print("\n各赛区统计:")
    for region in hierarchy:
        print(f"  {region['name']}: {region['playerCount']} 选手, {region['teamCount']} 战队, {region['tournamentCount']} 联赛")

if __name__ == "__main__":
    main()
