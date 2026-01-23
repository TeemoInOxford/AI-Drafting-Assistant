#!/usr/bin/env python3
"""
GRID Static Data API - 获取 LOL (League of Legends) 数据
建立完整的关系链：选手 -> 战队 -> 联赛
"""

import requests
import json
import time
import os
from datetime import datetime

# API 配置 - 使用 Open Access URL
API_URL = "https://api-op.grid.gg/central-data/graphql"
API_KEY = "DAnUJqbh0Hf5RMo6KlE22eYih9OTsEVjKsvSKXlX"

# LOL 的 titleId
LOL_TITLE_ID = "3"

# 输出目录
OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(OUTPUT_DIR, "data")

# 确保数据目录存在
os.makedirs(DATA_DIR, exist_ok=True)

# 速率限制配置
REQUEST_DELAY = 0.3  # 每次请求之间的延迟（秒）
RATE_LIMIT_DELAY = 60  # 遇到速率限制时的等待时间（秒）
MAX_RETRIES = 3  # 最大重试次数


def make_request(query, variables=None, retry_count=0):
    """发送 GraphQL 请求，带重试逻辑"""
    headers = {
        "x-api-key": API_KEY,
        "Content-Type": "application/json"
    }

    payload = {"query": query}
    if variables:
        payload["variables"] = variables

    try:
        response = requests.post(API_URL, headers=headers, json=payload, timeout=30)

        if response.status_code != 200:
            print(f"HTTP Error: {response.status_code}")
            print(response.text[:500])
            return None

        result = response.json()

        # 检查是否有错误
        if "errors" in result:
            error_msg = result['errors'][0].get('message', 'Unknown error')

            # 检查是否是速率限制错误
            if "rate limit" in error_msg.lower():
                if retry_count < MAX_RETRIES:
                    print(f"遇到速率限制，等待 {RATE_LIMIT_DELAY} 秒后重试...")
                    time.sleep(RATE_LIMIT_DELAY)
                    return make_request(query, variables, retry_count + 1)
                else:
                    print(f"达到最大重试次数，跳过此请求")
                    return None

            print(f"GraphQL Error: {error_msg}")
            # 如果有部分数据，仍然返回
            if "data" in result and result["data"]:
                return result
            return None

        return result
    except Exception as e:
        print(f"Request error: {e}")
        if retry_count < MAX_RETRIES:
            print(f"等待后重试...")
            time.sleep(5)
            return make_request(query, variables, retry_count + 1)
        return None


def fetch_lol_players():
    """获取所有 LOL 选手数据"""
    print("\n" + "=" * 60)
    print("开始获取 LOL 选手数据...")
    print("=" * 60)

    all_players = []
    has_next_page = True
    cursor = None
    page = 0

    query = """
    query GetPlayers($first: Int!, $after: String, $titleId: ID!) {
        players(first: $first, after: $after, filter: { titleId: $titleId }) {
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
                        logoUrl
                    }
                    title {
                        id
                        name
                    }
                }
            }
        }
    }
    """

    total_count = 0
    consecutive_errors = 0

    while has_next_page:
        page += 1
        variables = {"first": 50, "after": cursor, "titleId": LOL_TITLE_ID}

        result = make_request(query, variables)

        if not result or "data" not in result or not result["data"] or not result["data"].get("players"):
            consecutive_errors += 1
            print(f"Error fetching page {page} (连续错误: {consecutive_errors})")

            if consecutive_errors >= 5:
                print("连续错误过多，停止获取")
                break

            time.sleep(RATE_LIMIT_DELAY)
            continue

        consecutive_errors = 0
        data = result["data"]["players"]
        total_count = data["totalCount"]

        for edge in data["edges"]:
            player = edge["node"]
            all_players.append(player)

        has_next_page = data["pageInfo"]["hasNextPage"]
        cursor = data["pageInfo"]["endCursor"]

        # 每20页打印一次进度
        if page % 20 == 0:
            pct = len(all_players) * 100 // total_count if total_count > 0 else 0
            print(f"Page {page}: 已获取 {len(all_players)}/{total_count} 选手 ({pct}%)")

        # 每100页保存一次中间结果
        if page % 100 == 0:
            temp_file = os.path.join(DATA_DIR, "lol_players_temp.json")
            with open(temp_file, "w", encoding="utf-8") as f:
                json.dump(all_players, f, ensure_ascii=False)
            print(f"  (已保存中间结果)")

        time.sleep(REQUEST_DELAY)

    print(f"\n总共获取 {len(all_players)} 名 LOL 选手 (API 报告总数: {total_count})")

    # 保存数据
    output_file = os.path.join(DATA_DIR, "lol_players.json")
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(all_players, f, ensure_ascii=False, indent=2)
    print(f"选手数据已保存到: {output_file}")

    return all_players


def fetch_lol_teams():
    """获取所有 LOL 战队数据"""
    print("\n" + "=" * 60)
    print("开始获取 LOL 战队数据...")
    print("=" * 60)

    all_teams = []
    has_next_page = True
    cursor = None
    page = 0

    query = """
    query GetTeams($first: Int!, $after: String, $titleId: ID!) {
        teams(first: $first, after: $after, filter: { titleId: $titleId }) {
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
                    logoUrl
                    organization {
                        id
                        name
                    }
                    titles {
                        id
                        name
                    }
                }
            }
        }
    }
    """

    total_count = 0
    consecutive_errors = 0

    while has_next_page:
        page += 1
        variables = {"first": 50, "after": cursor, "titleId": LOL_TITLE_ID}

        result = make_request(query, variables)

        if not result or "data" not in result or not result["data"] or not result["data"].get("teams"):
            consecutive_errors += 1
            print(f"Error fetching page {page} (连续错误: {consecutive_errors})")

            if consecutive_errors >= 5:
                print("连续错误过多，停止获取")
                break

            time.sleep(RATE_LIMIT_DELAY)
            continue

        consecutive_errors = 0
        data = result["data"]["teams"]
        total_count = data["totalCount"]

        for edge in data["edges"]:
            team = edge["node"]
            all_teams.append(team)

        has_next_page = data["pageInfo"]["hasNextPage"]
        cursor = data["pageInfo"]["endCursor"]

        if page % 10 == 0:
            pct = len(all_teams) * 100 // total_count if total_count > 0 else 0
            print(f"Page {page}: 已获取 {len(all_teams)}/{total_count} 战队 ({pct}%)")

        time.sleep(REQUEST_DELAY)

    print(f"\n总共获取 {len(all_teams)} 支 LOL 战队 (API 报告总数: {total_count})")

    # 保存数据
    output_file = os.path.join(DATA_DIR, "lol_teams.json")
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(all_teams, f, ensure_ascii=False, indent=2)
    print(f"战队数据已保存到: {output_file}")

    return all_teams


def fetch_lol_tournaments():
    """获取所有 LOL 联赛/锦标赛数据"""
    print("\n" + "=" * 60)
    print("开始获取 LOL 联赛数据...")
    print("=" * 60)

    all_tournaments = []
    has_next_page = True
    cursor = None
    page = 0

    query = """
    query GetTournaments($first: Int!, $after: String, $titleId: ID!) {
        tournaments(first: $first, after: $after, filter: { titleId: $titleId }) {
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
                    logoUrl
                    startDate
                    endDate
                    titles {
                        id
                        name
                    }
                    teams {
                        id
                        name
                    }
                    parent {
                        id
                        name
                    }
                }
            }
        }
    }
    """

    total_count = 0
    consecutive_errors = 0

    while has_next_page:
        page += 1
        variables = {"first": 50, "after": cursor, "titleId": LOL_TITLE_ID}

        result = make_request(query, variables)

        if not result or "data" not in result or not result["data"] or not result["data"].get("tournaments"):
            consecutive_errors += 1
            print(f"Error fetching page {page} (连续错误: {consecutive_errors})")

            if consecutive_errors >= 5:
                print("连续错误过多，停止获取")
                break

            time.sleep(RATE_LIMIT_DELAY)
            continue

        consecutive_errors = 0
        data = result["data"]["tournaments"]
        total_count = data["totalCount"]

        for edge in data["edges"]:
            tournament = edge["node"]
            all_tournaments.append(tournament)

        has_next_page = data["pageInfo"]["hasNextPage"]
        cursor = data["pageInfo"]["endCursor"]

        if page % 5 == 0:
            print(f"Page {page}: 已获取 {len(all_tournaments)}/{total_count} 联赛")

        time.sleep(REQUEST_DELAY)

    print(f"\n总共获取 {len(all_tournaments)} 个 LOL 联赛 (API 报告总数: {total_count})")

    # 保存数据
    output_file = os.path.join(DATA_DIR, "lol_tournaments.json")
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(all_tournaments, f, ensure_ascii=False, indent=2)
    print(f"联赛数据已保存到: {output_file}")

    return all_tournaments


def build_relationships(players, teams, tournaments):
    """建立选手-战队-联赛的关系链"""
    print("\n" + "=" * 60)
    print("开始建立关系链...")
    print("=" * 60)

    # 创建索引
    team_index = {team["id"]: team for team in teams}

    # 战队参与的联赛 (从 tournament.teams 反向建立)
    team_tournaments = {}
    for tournament in tournaments:
        if tournament.get("teams"):
            for team in tournament["teams"]:
                team_id = team["id"]
                if team_id not in team_tournaments:
                    team_tournaments[team_id] = []
                team_tournaments[team_id].append({
                    "id": tournament["id"],
                    "name": tournament["name"],
                    "nameShortened": tournament.get("nameShortened"),
                    "startDate": tournament.get("startDate"),
                    "endDate": tournament.get("endDate")
                })

    # 构建完整的关系数据
    player_relationships = []

    for player in players:
        player_data = {
            "id": player["id"],
            "nickname": player.get("nickname"),
            "team": None,
            "tournaments": []
        }

        # 获取战队信息
        if player.get("team"):
            team = player["team"]
            team_id = team["id"]

            # 从 teams 数据中获取更完整的信息
            full_team = team_index.get(team_id, team)

            player_data["team"] = {
                "id": team_id,
                "name": team.get("name") or full_team.get("name"),
                "nameShortened": team.get("nameShortened") or full_team.get("nameShortened"),
                "logoUrl": team.get("logoUrl") or full_team.get("logoUrl"),
                "organization": full_team.get("organization")
            }

            # 获取战队参与的联赛
            if team_id in team_tournaments:
                player_data["tournaments"] = team_tournaments[team_id]

        player_relationships.append(player_data)

    # 保存关系数据
    output_file = os.path.join(DATA_DIR, "lol_player_relationships.json")
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(player_relationships, f, ensure_ascii=False, indent=2)
    print(f"关系数据已保存到: {output_file}")

    # 统计信息
    players_with_team = sum(1 for p in player_relationships if p["team"])
    players_with_tournaments = sum(1 for p in player_relationships if p["tournaments"])

    print(f"\n统计信息:")
    print(f"  - 总选手数: {len(player_relationships)}")
    print(f"  - 有当前战队的选手: {players_with_team}")
    print(f"  - 有联赛记录的选手: {players_with_tournaments}")

    return player_relationships


def create_summary(players, teams, tournaments, relationships):
    """创建数据摘要"""
    print("\n" + "=" * 60)
    print("创建数据摘要...")
    print("=" * 60)

    # 按组织统计
    org_stats = {}
    for team in teams:
        org = team.get("organization")
        if org:
            org_name = org.get("name", "Unknown")
            if org_name not in org_stats:
                org_stats[org_name] = {"teams": 0, "id": org.get("id")}
            org_stats[org_name]["teams"] += 1

    # 按联赛统计战队数
    tournament_stats = []
    for t in tournaments:
        team_count = len(t.get("teams", []))
        if team_count > 0:
            tournament_stats.append({
                "id": t["id"],
                "name": t["name"],
                "teams": team_count,
                "startDate": t.get("startDate"),
                "endDate": t.get("endDate")
            })

    # 按战队数排序
    tournament_stats.sort(key=lambda x: x["teams"], reverse=True)

    summary = {
        "generated_at": datetime.now().isoformat(),
        "game": "League of Legends",
        "total_players": len(players),
        "total_teams": len(teams),
        "total_tournaments": len(tournaments),
        "players_with_team": sum(1 for p in relationships if p["team"]),
        "players_without_team": sum(1 for p in relationships if not p["team"]),
        "top_organizations": dict(sorted(org_stats.items(), key=lambda x: x[1]["teams"], reverse=True)[:30]),
        "top_tournaments": tournament_stats[:30]
    }

    # 保存摘要
    output_file = os.path.join(DATA_DIR, "lol_summary.json")
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print(f"摘要已保存到: {output_file}")

    # 打印摘要
    print(f"\nLOL 数据摘要:")
    print(f"  - 总选手数: {summary['total_players']}")
    print(f"  - 总战队数: {summary['total_teams']}")
    print(f"  - 总联赛数: {summary['total_tournaments']}")
    print(f"  - 有战队的选手: {summary['players_with_team']}")
    print(f"  - 无战队的选手: {summary['players_without_team']}")

    print(f"\n前10大组织:")
    for org, stats in list(summary["top_organizations"].items())[:10]:
        print(f"    {org}: {stats['teams']} 战队")

    print(f"\n前10大联赛 (按参赛战队数):")
    for t in summary["top_tournaments"][:10]:
        print(f"    {t['name']}: {t['teams']} 战队")

    return summary


def main():
    """主函数"""
    print("=" * 60)
    print("GRID Static Data API - LOL 数据获取工具")
    print(f"开始时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"请求延迟: {REQUEST_DELAY}秒, 速率限制等待: {RATE_LIMIT_DELAY}秒")
    print("=" * 60)

    # 1. 获取所有 LOL 选手
    players = fetch_lol_players()

    # 2. 获取所有 LOL 战队
    teams = fetch_lol_teams()

    # 3. 获取所有 LOL 联赛
    tournaments = fetch_lol_tournaments()

    # 4. 建立关系链
    relationships = build_relationships(players, teams, tournaments)

    # 5. 创建摘要
    summary = create_summary(players, teams, tournaments, relationships)

    print("\n" + "=" * 60)
    print("LOL 数据获取完成!")
    print(f"结束时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"数据保存在: {DATA_DIR}")
    print("=" * 60)


if __name__ == "__main__":
    main()
