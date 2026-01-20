#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
使用现有数据文件重建干净的层级结构
- 只统计有战队的选手
- 只统计有比赛的联赛（有战队参与的）
- 移除名字后缀带数字的重复选手（如 Junhao01, naiyou01）
"""

import json
import os
import re
from collections import defaultdict


def has_number_suffix(nickname: str) -> bool:
    """
    检查选手昵称是否有数字后缀（如01, 02等）
    返回True表示是重复选手，应该移除

    例如:
    - "Junhao01" -> True (重复)
    - "naiyou01" -> True (重复)
    - "369" -> False (真实昵称)
    - "Faker" -> False (正常昵称)
    """
    if not nickname:
        return False

    # 匹配: 字母/中文等 + 数字结尾
    # 但排除纯数字昵称（如 "369"）
    match = re.match(r'^(.+?)(\d{1,2})$', nickname)
    if match:
        base_name = match.group(1)
        suffix = match.group(2)

        # 如果基础名是纯数字，那这可能是真实昵称（如369）
        if base_name.isdigit():
            return False

        # 如果基础名有字母，且后缀是01-99这种，认为是重复
        if len(base_name) >= 2 and suffix in [f"{i:02d}" for i in range(1, 100)] + [str(i) for i in range(1, 10)]:
            return True

    return False

DATA_DIR = os.path.dirname(os.path.abspath(__file__)) + "/data"

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
    print("重建干净的层级结构")
    print("=" * 60)

    # 加载现有数据
    print("\n加载现有数据...")

    with open(f"{DATA_DIR}/lol_hierarchy.json", "r", encoding="utf-8") as f:
        old_hierarchy = json.load(f)

    with open(f"{DATA_DIR}/lol_players.json", "r", encoding="utf-8") as f:
        all_players = json.load(f)

    print(f"  旧层级: {len(old_hierarchy)} 个赛区")
    print(f"  选手: {len(all_players)} 个")

    # 统计有战队的选手
    players_with_teams = [p for p in all_players if p.get("team")]
    print(f"  有战队的选手: {len(players_with_teams)} 个")

    # 过滤掉名字带数字后缀的重复选手
    suffix_players = [p for p in players_with_teams if has_number_suffix(p.get("nickname", ""))]
    valid_players = [p for p in players_with_teams if not has_number_suffix(p.get("nickname", ""))]
    print(f"  名字带数字后缀的选手（将移除）: {len(suffix_players)} 个")
    print(f"  有效选手: {len(valid_players)} 个")

    # 打印部分被移除的选手示例
    if suffix_players:
        print(f"  示例被移除选手: {', '.join([p['nickname'] for p in suffix_players[:10]])}")

    # 建立战队ID到选手的映射（只包含有效选手）
    team_to_players = defaultdict(list)
    for player in valid_players:
        team_id = player["team"]["id"]
        team_to_players[team_id].append({
            "id": player["id"],
            "nickname": player["nickname"]
        })

    # 重建层级，只保留有战队的联赛
    print("\n重建层级...")

    new_hierarchy = []
    total_tournaments = 0
    total_teams = set()
    total_players = set()

    for region in old_hierarchy:
        region_tournaments = []
        region_team_ids = set()
        region_player_ids = set()

        for tournament in region.get("tournaments", []):
            # 只保留有战队的联赛
            if tournament.get("teams") and len(tournament["teams"]) > 0:
                # 更新战队信息
                updated_teams = []
                for team in tournament["teams"]:
                    team_id = team["id"]
                    team_players = team_to_players.get(team_id, [])

                    updated_teams.append({
                        "id": team_id,
                        "name": team["name"],
                        "nameShortened": team.get("nameShortened", ""),
                        "logoUrl": team.get("logoUrl", ""),
                        "playerCount": len(team_players),
                        "players": team_players
                    })

                    region_team_ids.add(team_id)
                    total_teams.add(team_id)

                    for player in team_players:
                        region_player_ids.add(player["id"])
                        total_players.add(player["id"])

                region_tournaments.append({
                    "id": tournament["id"],
                    "name": tournament["name"],
                    "nameShortened": tournament.get("nameShortened", ""),
                    "startDate": tournament.get("startDate"),
                    "endDate": tournament.get("endDate"),
                    "teamCount": len(updated_teams),
                    "teams": updated_teams
                })
                total_tournaments += 1

        if region_tournaments:
            # 按开始日期排序（最新的在前）
            region_tournaments.sort(
                key=lambda x: x.get("startDate") or "0000",
                reverse=True
            )

            region_info = REGION_MAP.get(region["code"], {
                "name": region["code"],
                "fullName": region.get("fullName", region["code"]),
                "country": region.get("country", "其他")
            })

            new_hierarchy.append({
                "code": region["code"],
                "name": region_info["name"],
                "fullName": region_info["fullName"],
                "country": region_info["country"],
                "tournamentCount": len(region_tournaments),
                "teamCount": len(region_team_ids),
                "playerCount": len(region_player_ids),
                "tournaments": region_tournaments
            })

    # 按选手数量排序
    new_hierarchy.sort(key=lambda x: x["playerCount"], reverse=True)

    # 保存新层级
    with open(f"{DATA_DIR}/lol_hierarchy_clean.json", "w", encoding="utf-8") as f:
        json.dump(new_hierarchy, f, ensure_ascii=False, indent=2)
    print(f"保存 lol_hierarchy_clean.json")

    # 保存统计信息
    stats = {
        "totalTournaments": total_tournaments,
        "totalTeams": len(total_teams),
        "totalPlayers": len(total_players),
        "regionCount": len(new_hierarchy),
        "totalPlayersWithTeams": len(valid_players),
        "totalPlayersAll": len(all_players),
        "removedSuffixPlayers": len(suffix_players)
    }

    with open(f"{DATA_DIR}/lol_stats.json", "w", encoding="utf-8") as f:
        json.dump(stats, f, ensure_ascii=False, indent=2)
    print(f"保存 lol_stats.json")

    # 打印统计
    print("\n" + "=" * 60)
    print("统计信息")
    print("=" * 60)
    print(f"赛区数: {len(new_hierarchy)}")
    print(f"有战队的联赛数: {total_tournaments}")
    print(f"有比赛的战队数: {len(total_teams)}")
    print(f"有战队的选手数: {len(total_players)}")
    print(f"移除的重复选手数: {len(suffix_players)}")

    print("\n各赛区统计:")
    for region in new_hierarchy:
        print(f"  {region['name']}: {region['playerCount']} 选手, {region['teamCount']} 战队, {region['tournamentCount']} 联赛")

if __name__ == "__main__":
    main()
