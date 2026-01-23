#!/usr/bin/env python3
"""
生成所有选手、战队、联赛、比赛的完整列表
"""

import json
import os
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, "data")
PROJECT_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(SCRIPT_DIR)), "data", "lol")
DOCS_DIR = os.path.join(os.path.dirname(os.path.dirname(SCRIPT_DIR)), "docs")

def main():
    print("=" * 60)
    print("生成完整列表文档")
    print("=" * 60)

    # 加载数据
    print("\n[1/5] 加载数据...")

    with open(os.path.join(DATA_DIR, "lol_hierarchy_match_based_api.json"), "r", encoding="utf-8") as f:
        api_data = json.load(f)

    with open(os.path.join(PROJECT_DATA_DIR, "series.json"), "r", encoding="utf-8") as f:
        series_data = json.load(f)

    print(f"  选手: {len(api_data['players'])}")
    print(f"  战队: {len(api_data['teams'])}")
    print(f"  赛区: {len(api_data['regions'])}")
    print(f"  比赛: {len(series_data)}")

    # 提取数据
    print("\n[2/5] 提取选手列表...")
    players = []
    for player_id, player_data in api_data["players"].items():
        players.append({
            "id": player_id,
            "name": player_data["name"],
            "teams": player_data["teams"]
        })
    players.sort(key=lambda x: int(x["id"]))

    print("\n[3/5] 提取战队列表...")
    teams = []
    for team_id, team_data in api_data["teams"].items():
        teams.append({
            "id": team_id,
            "name": team_data["name"],
            "player_count": len(team_data["players"]),
            "league_count": len(team_data["leagues"])
        })
    teams.sort(key=lambda x: int(x["id"]))

    print("\n[4/5] 提取联赛列表...")
    leagues = []
    for region_code, region_data in api_data["regions"].items():
        for league_name, league_data in region_data["leagues"].items():
            leagues.append({
                "name": league_name,
                "region": region_code,
                "split": league_data["split"],
                "team_count": len(league_data["teams"])
            })
    leagues.sort(key=lambda x: (x["region"], x["name"]))

    print("\n[5/5] 提取比赛列表...")
    matches = []
    for match in series_data:
        tournament = match.get("tournament", {})
        while tournament.get("parent"):
            tournament = tournament["parent"]

        team1 = match.get("teams", [{}])[0].get("baseInfo", {})
        team2 = match.get("teams", [{}])[1].get("baseInfo", {}) if len(match.get("teams", [])) > 1 else {}

        matches.append({
            "id": match.get("id", ""),
            "date": match.get("startTimeScheduled", ""),
            "tournament": tournament.get("name", ""),
            "format": match.get("format", {}).get("nameShortened", ""),
            "team1": team1.get("name", ""),
            "team1_id": team1.get("id", ""),
            "team2": team2.get("name", ""),
            "team2_id": team2.get("id", "")
        })
    matches.sort(key=lambda x: x["date"], reverse=True)

    # 生成Markdown文档
    print("\n生成Markdown文档...")

    md_lines = []

    # 标题
    md_lines.append("# LOL Esports 完整数据列表")
    md_lines.append("")
    md_lines.append(f"**生成时间**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    md_lines.append(f"**数据更新时间**: {api_data['updatedAt']}")
    md_lines.append("")
    md_lines.append("---")
    md_lines.append("")

    # 目录
    md_lines.append("## 目录")
    md_lines.append("")
    md_lines.append("- [选手列表](#选手列表) (573名)")
    md_lines.append("- [战队列表](#战队列表) (54支)")
    md_lines.append("- [联赛列表](#联赛列表) (29个)")
    md_lines.append("- [比赛列表](#比赛列表) (1,632场)")
    md_lines.append("")
    md_lines.append("---")
    md_lines.append("")

    # 选手列表
    md_lines.append("## 选手列表")
    md_lines.append("")
    md_lines.append(f"共 {len(players)} 名选手")
    md_lines.append("")
    md_lines.append("| # | 选手ID | 选手昵称 | 所属战队数 |")
    md_lines.append("|---|--------|---------|-----------|")

    for i, player in enumerate(players, 1):
        md_lines.append(f"| {i} | {player['id']} | {player['name']} | {len(player['teams'])} |")

    md_lines.append("")
    md_lines.append("---")
    md_lines.append("")

    # 战队列表
    md_lines.append("## 战队列表")
    md_lines.append("")
    md_lines.append(f"共 {len(teams)} 支战队")
    md_lines.append("")
    md_lines.append("| # | 战队ID | 战队名称 | 选手数 | 参与联赛数 |")
    md_lines.append("|---|--------|---------|--------|-----------|")

    for i, team in enumerate(teams, 1):
        md_lines.append(f"| {i} | {team['id']} | {team['name']} | {team['player_count']} | {team['league_count']} |")

    md_lines.append("")
    md_lines.append("---")
    md_lines.append("")

    # 联赛列表
    md_lines.append("## 联赛列表")
    md_lines.append("")
    md_lines.append(f"共 {len(leagues)} 个联赛")
    md_lines.append("")

    current_region = None
    for league in leagues:
        if league["region"] != current_region:
            current_region = league["region"]
            md_lines.append(f"### {current_region}")
            md_lines.append("")

        md_lines.append(f"- **{league['name']}**")
        md_lines.append(f"  - 赛季: {league['split']}")
        md_lines.append(f"  - 战队数: {league['team_count']}")
        md_lines.append("")

    md_lines.append("---")
    md_lines.append("")

    # 比赛列表
    md_lines.append("## 比赛列表")
    md_lines.append("")
    md_lines.append(f"共 {len(matches)} 场比赛")
    md_lines.append("")
    md_lines.append("| # | 比赛ID | 日期 | 联赛 | 赛制 | 战队1 | 战队2 |")
    md_lines.append("|---|--------|------|------|------|-------|-------|")

    for i, match in enumerate(matches[:100], 1):  # 只显示前100场
        date = match['date'][:10] if match['date'] else "未知"
        md_lines.append(f"| {i} | {match['id']} | {date} | {match['tournament']} | {match['format']} | {match['team1']} | {match['team2']} |")

    if len(matches) > 100:
        md_lines.append("")
        md_lines.append(f"*注: 仅显示前100场比赛，共有 {len(matches)} 场比赛*")

    md_lines.append("")
    md_lines.append("---")
    md_lines.append("")

    # 保存文档
    output_path = os.path.join(DOCS_DIR, "complete-data-list.md")
    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(md_lines))

    print(f"\n完成!")
    print(f"文档已保存: {output_path}")

    # 同时保存JSON格式
    json_output = {
        "generated_at": datetime.now().isoformat(),
        "data_updated_at": api_data["updatedAt"],
        "players": players,
        "teams": teams,
        "leagues": leagues,
        "matches": matches
    }

    json_path = os.path.join(DOCS_DIR, "complete-data-list.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(json_output, f, ensure_ascii=False, indent=2)

    print(f"JSON已保存: {json_path}")

if __name__ == "__main__":
    main()
