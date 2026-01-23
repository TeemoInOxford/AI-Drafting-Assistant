#!/usr/bin/env python3
"""
提取清洗后数据中的所有ID信息并生成汇总文档
"""

import json
import os
from datetime import datetime

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "docs")

def extract_ids():
    """提取所有ID信息"""

    # 加载清洗后的数据
    with open(os.path.join(DATA_DIR, "lol_hierarchy_clean_api.json"), "r", encoding="utf-8") as f:
        data = json.load(f)

    # 提取赛区信息
    regions = []
    for region_code, region_data in data["regions"].items():
        regions.append({
            "code": region_code,
            "name": region_data["name"],
            "shortName": region_data["shortName"],
            "stats": region_data["stats"]
        })

    # 提取联赛信息
    leagues = []
    for region_code, region_data in data["regions"].items():
        for league_name, league_data in region_data["leagues"].items():
            leagues.append({
                "name": league_name,
                "split": league_data["split"],
                "region": region_code,
                "teamCount": len(league_data["teams"]),
                "teams": league_data["teams"]
            })

    # 提取战队信息
    teams = []
    for team_id, team_data in data["teams"].items():
        teams.append({
            "id": team_id,
            "name": team_data["name"],
            "playerCount": len(team_data["players"]),
            "leagueCount": len(team_data["leagues"]),
            "leagues": team_data["leagues"]
        })

    # 提取选手信息
    players = []
    for player_id, player_data in data["players"].items():
        players.append({
            "id": player_id,
            "name": player_data["name"],
            "teamCount": len(player_data["teams"]),
            "teams": player_data["teams"]
        })

    return {
        "updatedAt": data["updatedAt"],
        "stats": data["stats"],
        "regions": sorted(regions, key=lambda x: x["code"]),
        "leagues": sorted(leagues, key=lambda x: (x["region"], x["name"])),
        "teams": sorted(teams, key=lambda x: int(x["id"])),
        "players": sorted(players, key=lambda x: int(x["id"]))
    }

def generate_markdown(extracted_data):
    """生成Markdown文档"""

    md_lines = []

    # 标题和概述
    md_lines.append("# LOL Esports 清洗后数据 - ID 汇总")
    md_lines.append("")
    md_lines.append(f"**生成时间**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    md_lines.append(f"**数据更新时间**: {extracted_data['updatedAt']}")
    md_lines.append("")
    md_lines.append("---")
    md_lines.append("")

    # 统计概览
    md_lines.append("## 📊 数据统计概览")
    md_lines.append("")
    md_lines.append(f"- **赛区总数**: {extracted_data['stats']['totalRegions']}")
    md_lines.append(f"- **联赛总数**: {extracted_data['stats']['totalLeagues']}")
    md_lines.append(f"- **战队总数**: {extracted_data['stats']['totalTeams']}")
    md_lines.append(f"- **选手总数**: {extracted_data['stats']['totalPlayers']}")
    md_lines.append("")
    md_lines.append("---")
    md_lines.append("")

    # 赛区列表
    md_lines.append("## 🌍 赛区列表 (Regions)")
    md_lines.append("")
    md_lines.append(f"共 {len(extracted_data['regions'])} 个赛区")
    md_lines.append("")
    md_lines.append("| 赛区代码 | 赛区名称 | 国家/地区 | 联赛数 | 战队数 | 选手数 |")
    md_lines.append("|---------|---------|----------|--------|--------|--------|")

    for region in extracted_data["regions"]:
        md_lines.append(f"| {region['code']} | {region['name']} | {region['shortName']} | {region['stats']['leagues']} | {region['stats']['teams']} | {region['stats']['players']} |")

    md_lines.append("")
    md_lines.append("---")
    md_lines.append("")

    # 联赛列表
    md_lines.append("## 🏆 联赛列表 (Leagues)")
    md_lines.append("")
    md_lines.append(f"共 {len(extracted_data['leagues'])} 个联赛")
    md_lines.append("")

    current_region = None
    for league in extracted_data["leagues"]:
        if league["region"] != current_region:
            current_region = league["region"]
            md_lines.append(f"### {current_region}")
            md_lines.append("")

        md_lines.append(f"#### {league['name']}")
        md_lines.append(f"- **赛季**: {league['split']}")
        md_lines.append(f"- **战队数**: {league['teamCount']}")
        md_lines.append(f"- **战队ID列表**: {', '.join(league['teams'])}")
        md_lines.append("")

    md_lines.append("---")
    md_lines.append("")

    # 战队列表
    md_lines.append("## 🛡️ 战队列表 (Teams)")
    md_lines.append("")
    md_lines.append(f"共 {len(extracted_data['teams'])} 支战队")
    md_lines.append("")
    md_lines.append("| 战队ID | 战队名称 | 选手数 | 参与联赛数 |")
    md_lines.append("|--------|---------|--------|-----------|")

    for team in extracted_data["teams"]:
        md_lines.append(f"| {team['id']} | {team['name']} | {team['playerCount']} | {team['leagueCount']} |")

    md_lines.append("")
    md_lines.append("### 战队详细信息")
    md_lines.append("")

    for team in extracted_data["teams"]:
        md_lines.append(f"#### {team['name']} (ID: {team['id']})")
        md_lines.append(f"- **选手数**: {team['playerCount']}")
        md_lines.append(f"- **参与联赛数**: {team['leagueCount']}")
        if team['leagues']:
            md_lines.append(f"- **参与联赛**:")
            for league in team['leagues']:
                md_lines.append(f"  - {league}")
        md_lines.append("")

    md_lines.append("---")
    md_lines.append("")

    # 选手列表
    md_lines.append("## 👤 选手列表 (Players)")
    md_lines.append("")
    md_lines.append(f"共 {len(extracted_data['players'])} 名选手")
    md_lines.append("")
    md_lines.append("| 选手ID | 选手昵称 | 所属战队数 |")
    md_lines.append("|--------|---------|-----------|")

    for player in extracted_data["players"]:
        md_lines.append(f"| {player['id']} | {player['name']} | {player['teamCount']} |")

    md_lines.append("")
    md_lines.append("### 选手详细信息")
    md_lines.append("")

    for player in extracted_data["players"]:
        md_lines.append(f"#### {player['name']} (ID: {player['id']})")
        md_lines.append(f"- **所属战队数**: {player['teamCount']}")
        if player['teams']:
            md_lines.append(f"- **所属战队ID**: {', '.join(player['teams'])}")
        md_lines.append("")

    md_lines.append("---")
    md_lines.append("")
    md_lines.append("## 📝 说明")
    md_lines.append("")
    md_lines.append("- 本文档基于清洗后的数据生成")
    md_lines.append("- 已移除测试账号、重复账号和无效数据")
    md_lines.append("- 所有选手均有所属战队")
    md_lines.append("- 所有战队均有选手")
    md_lines.append("- 所有联赛均有战队")
    md_lines.append("")

    return "\n".join(md_lines)

def main():
    print("=" * 60)
    print("提取清洗后数据的所有ID信息")
    print("=" * 60)

    print("\n正在提取数据...")
    extracted_data = extract_ids()

    print(f"[OK] 赛区: {len(extracted_data['regions'])}")
    print(f"[OK] 联赛: {len(extracted_data['leagues'])}")
    print(f"[OK] 战队: {len(extracted_data['teams'])}")
    print(f"[OK] 选手: {len(extracted_data['players'])}")

    print("\n正在生成Markdown文档...")
    markdown_content = generate_markdown(extracted_data)

    # 保存Markdown文档
    output_path = os.path.join(OUTPUT_DIR, "data-ids-summary.md")
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(markdown_content)

    print(f"\n[OK] Markdown文档已生成: {output_path}")

    # 同时生成JSON格式
    json_output_path = os.path.join(OUTPUT_DIR, "data-ids-summary.json")
    with open(json_output_path, "w", encoding="utf-8") as f:
        json.dump(extracted_data, f, ensure_ascii=False, indent=2)

    print(f"[OK] JSON文档已生成: {json_output_path}")

    print("\n完成!")

if __name__ == "__main__":
    main()
