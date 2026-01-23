#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
基于比赛数据的清洗策略
- 只保留有比赛记录的选手
- 只保留有比赛的联赛
- 不过滤名字后缀、空白名字等
"""

import json
import os

DATA_DIR = os.path.dirname(os.path.abspath(__file__)) + "/data"
PROJECT_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "data", "lol")

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
    "Worlds": {"name": "Worlds", "fullName": "League of Legends World Championship", "country": "全球"},
    "MSI": {"name": "MSI", "fullName": "Mid-Season Invitational", "country": "全球"},
    "EMEA": {"name": "EMEA Masters", "fullName": "EMEA Masters", "country": "欧洲"},
    "NLC": {"name": "NLC", "fullName": "Northern League of Legends Championship", "country": "北欧"},
    "LFL": {"name": "LFL", "fullName": "La Ligue Française", "country": "法国"},
    "PRM": {"name": "Prime League", "fullName": "Prime League", "country": "德国"},
    "LVP": {"name": "LVP", "fullName": "SuperLiga", "country": "西班牙"},
}

def main():
    print("=" * 60)
    print("基于比赛数据的清洗策略")
    print("=" * 60)

    # 1. 加载原始数据
    print("\n[1/5] 加载原始数据...")

    with open(f"{DATA_DIR}/lol_hierarchy.json", "r", encoding="utf-8") as f:
        old_hierarchy = json.load(f)

    with open(f"{DATA_DIR}/lol_player_relationships.json", "r", encoding="utf-8") as f:
        player_relationships = json.load(f)

    with open(f"{PROJECT_DATA_DIR}/series.json", "r", encoding="utf-8") as f:
        series_data = json.load(f)

    print(f"  原始层级数据: {len(old_hierarchy)} 个赛区")
    print(f"  选手关系数据: {len(player_relationships)} 名选手")
    print(f"  比赛数据: {len(series_data)} 场比赛")

    # 2. 提取有比赛记录的选手ID
    print("\n[2/5] 提取有比赛记录的选手...")

    players_with_matches = set()
    for player in player_relationships:
        if player.get("tournaments"):  # 有比赛记录
            players_with_matches.add(str(player["id"]))

    print(f"  有比赛记录的选手: {len(players_with_matches)} 名")

    # 3. 提取有比赛的联赛ID
    print("\n[3/5] 提取有比赛的联赛...")

    tournaments_with_matches = set()
    for match in series_data:
        tournament = match.get("tournament", {})
        # 获取最顶层的tournament ID
        while tournament.get("parent"):
            tournament = tournament["parent"]
        tournament_name = tournament.get("name", "")
        if tournament_name:
            tournaments_with_matches.add(tournament_name)

    print(f"  有比赛的联赛: {len(tournaments_with_matches)} 个")

    # 4. 清洗层级数据
    print("\n[4/5] 清洗层级数据...")

    clean_hierarchy = []
    total_tournaments = 0
    total_teams = 0
    total_players = 0

    for region in old_hierarchy:
        clean_region = {
            "code": region["code"],
            "name": region["name"],
            "country": region["country"],
            "tournaments": [],
            "tournamentCount": 0,
            "teamCount": 0,
            "playerCount": 0
        }

        region_teams = set()
        region_players = set()

        for tournament in region.get("tournaments", []):
            tournament_name = tournament["name"]

            # 只保留有比赛的联赛
            if tournament_name not in tournaments_with_matches:
                continue

            clean_tournament = {
                "id": tournament["id"],
                "name": tournament["name"],
                "teams": []
            }

            for team in tournament.get("teams", []):
                clean_team = {
                    "id": team["id"],
                    "name": team["name"],
                    "players": []
                }

                team_has_players = False

                for player in team.get("players", []):
                    player_id = str(player["id"])

                    # 只保留有比赛记录的选手
                    if player_id in players_with_matches:
                        clean_team["players"].append(player)
                        region_players.add(player_id)
                        team_has_players = True

                # 只保留有选手的战队
                if team_has_players:
                    clean_tournament["teams"].append(clean_team)
                    region_teams.add(str(team["id"]))

            # 只保留有战队的联赛
            if clean_tournament["teams"]:
                clean_region["tournaments"].append(clean_tournament)

        # 更新赛区统计
        clean_region["tournamentCount"] = len(clean_region["tournaments"])
        clean_region["teamCount"] = len(region_teams)
        clean_region["playerCount"] = len(region_players)

        # 只保留有联赛的赛区
        if clean_region["tournaments"]:
            clean_hierarchy.append(clean_region)
            total_tournaments += clean_region["tournamentCount"]
            total_teams += clean_region["teamCount"]
            total_players += clean_region["playerCount"]

    print(f"  清洗后赛区: {len(clean_hierarchy)} 个")
    print(f"  清洗后联赛: {total_tournaments} 个")
    print(f"  清洗后战队: {total_teams} 支")
    print(f"  清洗后选手: {total_players} 名")

    # 5. 保存清洗后的数据
    print("\n[5/5] 保存清洗后的数据...")

    output_path = os.path.join(DATA_DIR, "lol_hierarchy_match_based.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(clean_hierarchy, f, ensure_ascii=False, indent=2)

    # 保存统计数据
    stats = {
        "totalTournaments": total_tournaments,
        "totalTeams": total_teams,
        "totalPlayers": total_players,
        "regionCount": len(clean_hierarchy),
        "totalPlayersWithMatches": len(players_with_matches),
        "totalTournamentsWithMatches": len(tournaments_with_matches),
        "totalMatches": len(series_data)
    }

    stats_path = os.path.join(DATA_DIR, "lol_stats_match_based.json")
    with open(stats_path, "w", encoding="utf-8") as f:
        json.dump(stats, f, ensure_ascii=False, indent=2)

    print(f"\n清洗完成!")
    print(f"  层级数据: {output_path}")
    print(f"  统计数据: {stats_path}")

    print("\n统计对比:")
    print(f"  原始数据: 18,804 名选手")
    print(f"  有比赛记录: {len(players_with_matches)} 名选手")
    print(f"  清洗后保留: {total_players} 名选手")

if __name__ == "__main__":
    main()
