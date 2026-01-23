#!/usr/bin/env python3
"""
分析有比赛数据但未出现在API数据中的选手
"""

import json
import os

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")

def main():
    print("=" * 60)
    print("分析缺失的选手")
    print("=" * 60)

    # 加载 player_relationships 数据（包含所有有比赛数据的选手）
    with open(os.path.join(DATA_DIR, "lol_player_relationships.json"), "r", encoding="utf-8") as f:
        all_players = json.load(f)

    # 加载 API 数据（当前包含的选手）
    with open(os.path.join(DATA_DIR, "lol_hierarchy_clean_api.json"), "r", encoding="utf-8") as f:
        api_data = json.load(f)

    # 加载清洗后的层级数据
    with open(os.path.join(DATA_DIR, "lol_hierarchy_clean.json"), "r", encoding="utf-8") as f:
        clean_hierarchy = json.load(f)

    # 找出所有有比赛数据的选手
    players_with_tournaments = [p for p in all_players if p.get("tournaments")]
    print(f"\n有比赛数据的选手总数: {len(players_with_tournaments)}")

    # 找出API数据中的选手
    api_player_ids = set(api_data["players"].keys())
    print(f"API数据中的选手数: {len(api_player_ids)}")

    # 找出缺失的选手
    missing_players = []
    for player in players_with_tournaments:
        player_id = str(player["id"])
        if player_id not in api_player_ids:
            missing_players.append(player)

    print(f"缺失的选手数: {len(missing_players)}")
    print("\n" + "=" * 60)

    # 分析缺失原因
    print("\n分析缺失原因:")
    print("-" * 60)

    # 统计缺失选手的特征
    no_team_count = 0
    team_not_in_hierarchy = 0
    has_number_suffix = 0
    other_reasons = 0

    # 收集层级数据中的所有战队ID
    hierarchy_team_ids = set()
    for region in clean_hierarchy:
        for tournament in region.get("tournaments", []):
            for team in tournament.get("teams", []):
                hierarchy_team_ids.add(str(team["id"]))

    print(f"\n清洗后层级数据中的战队数: {len(hierarchy_team_ids)}")

    # 分析每个缺失选手
    missing_details = []
    for player in missing_players:
        player_id = str(player["id"])
        nickname = player["nickname"]
        team = player.get("team")
        tournaments = player.get("tournaments", [])

        reason = []

        # 检查是否有战队
        if not team:
            no_team_count += 1
            reason.append("无战队")
        else:
            team_id = str(team["id"])
            team_name = team["name"]

            # 检查战队是否在层级数据中
            if team_id not in hierarchy_team_ids:
                team_not_in_hierarchy += 1
                reason.append(f"战队不在层级数据中 (Team ID: {team_id}, {team_name})")
            else:
                reason.append(f"战队在层级数据中但选手未被包含 (Team ID: {team_id}, {team_name})")

        # 检查是否有数字后缀
        import re
        match = re.match(r'^(.+?)(\d{1,2})$', nickname)
        if match:
            base_name = match.group(1)
            if not base_name.isdigit():
                has_number_suffix += 1
                reason.append("昵称有数字后缀")

        missing_details.append({
            "id": player_id,
            "nickname": nickname,
            "team": team["name"] if team else None,
            "team_id": str(team["id"]) if team else None,
            "tournament_count": len(tournaments),
            "reasons": reason
        })

        if not reason:
            other_reasons += 1

    # 输出统计
    print(f"\n缺失原因统计:")
    print(f"  - 无战队: {no_team_count}")
    print(f"  - 战队不在层级数据中: {team_not_in_hierarchy}")
    print(f"  - 昵称有数字后缀: {has_number_suffix}")
    print(f"  - 其他原因: {other_reasons}")

    # 输出详细信息
    print("\n" + "=" * 60)
    print("缺失选手详细信息:")
    print("-" * 60)

    for i, detail in enumerate(missing_details[:20], 1):  # 只显示前20个
        print(f"\n{i}. {detail['nickname']} (ID: {detail['id']})")
        print(f"   战队: {detail['team']} (ID: {detail['team_id']})")
        print(f"   比赛数: {detail['tournament_count']}")
        print(f"   原因: {', '.join(detail['reasons'])}")

    if len(missing_details) > 20:
        print(f"\n... 还有 {len(missing_details) - 20} 名选手未显示")

    # 保存完整报告
    report_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "docs", "missing-players-analysis.json")
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump({
            "summary": {
                "total_players_with_tournaments": len(players_with_tournaments),
                "players_in_api": len(api_player_ids),
                "missing_players": len(missing_players),
                "reasons": {
                    "no_team": no_team_count,
                    "team_not_in_hierarchy": team_not_in_hierarchy,
                    "has_number_suffix": has_number_suffix,
                    "other": other_reasons
                }
            },
            "missing_players": missing_details
        }, f, ensure_ascii=False, indent=2)

    print(f"\n\n完整报告已保存: {report_path}")

if __name__ == "__main__":
    main()
