#!/usr/bin/env python3
"""
构建赛区->联赛->战队->选手的层级数据结构
"""

import json
import os
from datetime import datetime

# 数据目录
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")

# 赛区映射 - 从联赛名称前缀提取
REGION_MAP = {
    "LPL": {"name": "LPL", "fullName": "League of Legends Pro League", "country": "中国"},
    "LCK": {"name": "LCK", "fullName": "League of Legends Champions Korea", "country": "韩国"},
    "LEC": {"name": "LEC", "fullName": "League of Legends EMEA Championship", "country": "欧洲"},
    "LCS": {"name": "LCS", "fullName": "League of Legends Championship Series", "country": "北美"},
    "LTA North": {"name": "LTA North", "fullName": "League of Legends Americas North", "country": "北美"},
    "LTA South": {"name": "LTA South", "fullName": "League of Legends Americas South", "country": "南美"},
    "LTA Cross-Conference": {"name": "LTA Cross-Conference", "fullName": "LTA Cross-Conference", "country": "美洲"},
}


def load_data():
    """加载原始数据"""
    with open(os.path.join(DATA_DIR, "lol_players.json"), "r", encoding="utf-8") as f:
        players = json.load(f)

    with open(os.path.join(DATA_DIR, "lol_teams.json"), "r", encoding="utf-8") as f:
        teams = json.load(f)

    with open(os.path.join(DATA_DIR, "lol_tournaments.json"), "r", encoding="utf-8") as f:
        tournaments = json.load(f)

    return players, teams, tournaments


def extract_region(tournament_name):
    """从联赛名称提取赛区"""
    for prefix in REGION_MAP.keys():
        if tournament_name.startswith(prefix):
            return prefix
    return "Other"


def build_hierarchy(players, teams, tournaments):
    """构建层级数据结构"""

    # 创建索引
    team_index = {t["id"]: t for t in teams}

    # 按战队分组选手
    team_players = {}
    for player in players:
        if player.get("team"):
            team_id = player["team"]["id"]
            if team_id not in team_players:
                team_players[team_id] = []
            team_players[team_id].append({
                "id": player["id"],
                "nickname": player["nickname"]
            })

    # 按赛区分组联赛
    region_tournaments = {}
    for tournament in tournaments:
        region = extract_region(tournament["name"])
        if region not in region_tournaments:
            region_tournaments[region] = []

        # 获取联赛的战队及其选手
        tournament_teams = []
        for team_ref in tournament.get("teams", []):
            team_id = team_ref["id"]
            team_data = team_index.get(team_id, team_ref)

            tournament_teams.append({
                "id": team_id,
                "name": team_ref.get("name") or team_data.get("name"),
                "nameShortened": team_data.get("nameShortened"),
                "logoUrl": team_data.get("logoUrl"),
                "organization": team_data.get("organization"),
                "players": team_players.get(team_id, [])
            })

        region_tournaments[region].append({
            "id": tournament["id"],
            "name": tournament["name"],
            "nameShortened": tournament.get("nameShortened"),
            "startDate": tournament.get("startDate"),
            "endDate": tournament.get("endDate"),
            "teams": tournament_teams,
            "teamCount": len(tournament_teams)
        })

    # 构建最终的层级结构
    hierarchy = []
    for region_code, tournaments_list in region_tournaments.items():
        region_info = REGION_MAP.get(region_code, {
            "name": region_code,
            "fullName": region_code,
            "country": "其他"
        })

        # 按联赛名称排序，最新的在前
        tournaments_list.sort(key=lambda x: x.get("startDate") or "", reverse=True)

        # 统计
        total_teams = set()
        total_players = set()
        for t in tournaments_list:
            for team in t["teams"]:
                total_teams.add(team["id"])
                for p in team["players"]:
                    total_players.add(p["id"])

        hierarchy.append({
            "code": region_code,
            "name": region_info["name"],
            "fullName": region_info["fullName"],
            "country": region_info["country"],
            "tournamentCount": len(tournaments_list),
            "teamCount": len(total_teams),
            "playerCount": len(total_players),
            "tournaments": tournaments_list
        })

    # 按战队数排序
    hierarchy.sort(key=lambda x: x["teamCount"], reverse=True)

    return hierarchy


def build_all_teams_with_players(players, teams, tournaments):
    """构建所有战队及其选手的数据（包括没有参加联赛的）"""

    # 按战队分组选手
    team_players = {}
    for player in players:
        if player.get("team"):
            team_id = player["team"]["id"]
            if team_id not in team_players:
                team_players[team_id] = []
            team_players[team_id].append({
                "id": player["id"],
                "nickname": player["nickname"]
            })

    # 战队参与的联赛
    team_tournaments = {}
    for tournament in tournaments:
        region = extract_region(tournament["name"])
        for team_ref in tournament.get("teams", []):
            team_id = team_ref["id"]
            if team_id not in team_tournaments:
                team_tournaments[team_id] = {"region": region, "tournaments": []}
            team_tournaments[team_id]["tournaments"].append({
                "id": tournament["id"],
                "name": tournament["name"],
                "startDate": tournament.get("startDate")
            })

    # 构建战队数据
    all_teams = []
    for team in teams:
        team_id = team["id"]
        team_info = team_tournaments.get(team_id, {"region": "Unknown", "tournaments": []})

        all_teams.append({
            "id": team_id,
            "name": team["name"],
            "nameShortened": team.get("nameShortened"),
            "logoUrl": team.get("logoUrl"),
            "organization": team.get("organization"),
            "region": team_info["region"],
            "tournaments": team_info["tournaments"],
            "players": team_players.get(team_id, []),
            "playerCount": len(team_players.get(team_id, []))
        })

    # 按选手数排序
    all_teams.sort(key=lambda x: x["playerCount"], reverse=True)

    return all_teams


def main():
    print("=" * 60)
    print("构建层级数据结构")
    print(f"时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    # 加载数据
    print("\n加载原始数据...")
    players, teams, tournaments = load_data()
    print(f"  - 选手: {len(players)}")
    print(f"  - 战队: {len(teams)}")
    print(f"  - 联赛: {len(tournaments)}")

    # 构建层级结构
    print("\n构建赛区->联赛->战队->选手层级结构...")
    hierarchy = build_hierarchy(players, teams, tournaments)

    # 保存层级数据
    output_file = os.path.join(DATA_DIR, "lol_hierarchy.json")
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(hierarchy, f, ensure_ascii=False, indent=2)
    print(f"层级数据已保存到: {output_file}")

    # 打印统计
    print("\n赛区统计:")
    for region in hierarchy:
        print(f"  {region['name']}: {region['tournamentCount']} 联赛, {region['teamCount']} 战队, {region['playerCount']} 选手")

    # 构建所有战队数据
    print("\n构建所有战队及选手数据...")
    all_teams = build_all_teams_with_players(players, teams, tournaments)

    # 保存所有战队数据
    output_file = os.path.join(DATA_DIR, "lol_all_teams.json")
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(all_teams, f, ensure_ascii=False, indent=2)
    print(f"所有战队数据已保存到: {output_file}")

    # 统计有选手的战队
    teams_with_players = sum(1 for t in all_teams if t["playerCount"] > 0)
    print(f"\n战队统计:")
    print(f"  - 总战队数: {len(all_teams)}")
    print(f"  - 有选手的战队: {teams_with_players}")

    # 创建摘要
    summary = {
        "generated_at": datetime.now().isoformat(),
        "total_players": len(players),
        "total_teams": len(teams),
        "total_tournaments": len(tournaments),
        "regions": [
            {
                "code": r["code"],
                "name": r["name"],
                "fullName": r["fullName"],
                "country": r["country"],
                "tournamentCount": r["tournamentCount"],
                "teamCount": r["teamCount"],
                "playerCount": r["playerCount"]
            }
            for r in hierarchy
        ]
    }

    output_file = os.path.join(DATA_DIR, "lol_hierarchy_summary.json")
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print(f"\n摘要已保存到: {output_file}")

    print("\n" + "=" * 60)
    print("完成!")
    print("=" * 60)


if __name__ == "__main__":
    main()
