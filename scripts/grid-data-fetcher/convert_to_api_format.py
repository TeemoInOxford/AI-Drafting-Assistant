#!/usr/bin/env python3
"""
将新的层级数据转换为 API 期望的格式
包含所有历史数据（所有选手和战队）
"""

import json
import os
from datetime import datetime

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")

def convert_hierarchy():
    """转换层级数据为 API 期望的格式，包含所有历史数据"""

    # 加载新生成的数据
    with open(os.path.join(DATA_DIR, "lol_hierarchy.json"), "r", encoding="utf-8") as f:
        regions_array = json.load(f)

    with open(os.path.join(DATA_DIR, "lol_all_teams.json"), "r", encoding="utf-8") as f:
        all_teams_array = json.load(f)

    # 加载原始数据以获取所有选手和战队
    with open(os.path.join(DATA_DIR, "lol_players.json"), "r", encoding="utf-8") as f:
        all_players = json.load(f)

    with open(os.path.join(DATA_DIR, "lol_teams.json"), "r", encoding="utf-8") as f:
        all_teams = json.load(f)

    # 初始化新格式
    api_format = {
        "updatedAt": datetime.now().isoformat(),
        "stats": {
            "totalPlayers": len(all_players),
            "totalTeams": len(all_teams),
            "totalLeagues": 0,
            "totalRegions": len(regions_array)
        },
        "regions": {},
        "teams": {},
        "players": {}
    }

    # 全局统计
    all_leagues_count = 0

    # 处理每个赛区
    for region in regions_array:
        region_code = region["code"]

        # 创建赛区对象
        api_format["regions"][region_code] = {
            "id": region_code,
            "name": region["name"],
            "shortName": region["country"],
            "leagues": {},
            "stats": {
                "players": region["playerCount"],
                "teams": region["teamCount"],
                "leagues": region["tournamentCount"]
            }
        }

        # 处理联赛
        for tournament in region["tournaments"]:
            league_name = tournament["name"]
            all_leagues_count += 1

            # 提取赛季信息 (如 "Split 1 2025")
            split_info = league_name.split(" - ")[-1] if " - " in league_name else league_name

            api_format["regions"][region_code]["leagues"][league_name] = {
                "name": league_name,
                "split": split_info,
                "teams": [],
                "tournaments": {}
            }

            # 处理战队
            for team in tournament["teams"]:
                team_id = str(team["id"])

                # 添加战队到联赛
                api_format["regions"][region_code]["leagues"][league_name]["teams"].append(team_id)

                # 创建或更新战队对象
                if team_id not in api_format["teams"]:
                    api_format["teams"][team_id] = {
                        "name": team["name"],
                        "players": {},
                        "leagues": [],
                        "seriesCount": 0
                    }

                # 添加联赛到战队
                if league_name not in api_format["teams"][team_id]["leagues"]:
                    api_format["teams"][team_id]["leagues"].append(league_name)

                # 处理选手
                for player in team["players"]:
                    player_id = str(player["id"])

                    # 添加选手到战队
                    api_format["teams"][team_id]["players"][player_id] = player["nickname"]

                    # 创建或更新选手对象
                    if player_id not in api_format["players"]:
                        api_format["players"][player_id] = {
                            "name": player["nickname"],
                            "teams": [],
                            "seriesCount": 0
                        }

                    # 添加战队到选手
                    if team_id not in api_format["players"][player_id]["teams"]:
                        api_format["players"][player_id]["teams"].append(team_id)

    # 添加所有战队（包括没有在联赛中的）
    for team in all_teams:
        team_id = str(team["id"])
        if team_id not in api_format["teams"]:
            api_format["teams"][team_id] = {
                "name": team["name"],
                "players": {},
                "leagues": [],
                "seriesCount": 0
            }

    # 添加所有选手（包括没有战队的）
    for player in all_players:
        player_id = str(player["id"])
        if player_id not in api_format["players"]:
            api_format["players"][player_id] = {
                "name": player["nickname"],
                "teams": [],
                "seriesCount": 0
            }

        # 如果选手有战队，确保关联
        if player.get("team"):
            team_id = str(player["team"]["id"])

            # 确保战队存在
            if team_id not in api_format["teams"]:
                api_format["teams"][team_id] = {
                    "name": player["team"].get("name", "Unknown"),
                    "players": {},
                    "leagues": [],
                    "seriesCount": 0
                }

            # 添加选手到战队
            if player_id not in api_format["teams"][team_id]["players"]:
                api_format["teams"][team_id]["players"][player_id] = player["nickname"]

            # 添加战队到选手
            if team_id not in api_format["players"][player_id]["teams"]:
                api_format["players"][player_id]["teams"].append(team_id)

    # 更新全局统计
    api_format["stats"]["totalLeagues"] = all_leagues_count

    return api_format

def main():
    print("=" * 60)
    print("转换层级数据为 API 格式（包含所有历史数据）")
    print("=" * 60)

    api_format = convert_hierarchy()

    # 保存转换后的数据
    output_path = os.path.join(DATA_DIR, "lol_hierarchy_api.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(api_format, f, ensure_ascii=False, indent=2)

    print(f"\n转换完成!")
    print(f"输出文件: {output_path}")
    print(f"\n统计:")
    print(f"  - 赛区: {api_format['stats']['totalRegions']}")
    print(f"  - 联赛: {api_format['stats']['totalLeagues']}")
    print(f"  - 战队: {api_format['stats']['totalTeams']}")
    print(f"  - 选手: {api_format['stats']['totalPlayers']}")

if __name__ == "__main__":
    main()
