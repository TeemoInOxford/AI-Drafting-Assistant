#!/usr/bin/env python3
"""
分析 series_data 文件夹中的数据统计
"""

import json
import os
import glob

def analyze_series_data():
    data_dir = os.path.join(os.path.dirname(__file__), '..', 'data', 'lol', 'series_data')

    # 获取所有 JSON 文件
    json_files = glob.glob(os.path.join(data_dir, 'series_*.json'))

    print("=" * 60)
    print("Series Data Analysis")
    print("=" * 60)
    print()

    # 基本统计
    total_files = len(json_files)
    total_size = sum(os.path.getsize(f) for f in json_files)
    avg_size = total_size / total_files if total_files > 0 else 0

    print(f"Total series files: {total_files}")
    print(f"Total size: {total_size / (1024*1024):.2f} MB")
    print(f"Average file size: {avg_size / 1024:.2f} KB")
    print()

    # 分析前10个文件的详细信息
    print("Analyzing sample data (first 10 files)...")
    print()

    total_games = 0
    total_teams = 0
    total_players = 0
    total_draft_actions = 0
    formats = {}

    sample_size = min(10, total_files)

    for i, file_path in enumerate(json_files[:sample_size]):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)

                # 统计游戏数
                games = data.get('games', [])
                total_games += len(games)

                # 统计队伍和选手
                teams = data.get('teams', [])
                total_teams += len(teams)
                for team in teams:
                    total_players += len(team.get('players', []))

                # 统计选禁动作
                for game in games:
                    draft_actions = game.get('draftActions', [])
                    total_draft_actions += len(draft_actions)

                # 统计赛制
                format_name = data.get('format', 'unknown')
                formats[format_name] = formats.get(format_name, 0) + 1

        except Exception as e:
            print(f"Error reading {file_path}: {e}")

    print(f"Sample statistics (from {sample_size} files):")
    print(f"  - Total games: {total_games}")
    print(f"  - Average games per series: {total_games / sample_size:.1f}")
    print(f"  - Total teams: {total_teams}")
    print(f"  - Total players: {total_players}")
    print(f"  - Total draft actions: {total_draft_actions}")
    print(f"  - Average draft actions per game: {total_draft_actions / total_games:.1f}")
    print()

    print("Series formats:")
    for format_name, count in sorted(formats.items()):
        print(f"  - {format_name}: {count}")
    print()

    # 推算全部数据
    if sample_size > 0:
        estimated_total_games = int(total_games / sample_size * total_files)
        estimated_total_draft_actions = int(total_draft_actions / sample_size * total_files)

        print("Estimated totals (extrapolated from sample):")
        print(f"  - Total games across all series: ~{estimated_total_games}")
        print(f"  - Total draft actions: ~{estimated_total_draft_actions}")
        print(f"  - Total ban/pick decisions: ~{estimated_total_draft_actions}")

    print()
    print("=" * 60)

if __name__ == '__main__':
    analyze_series_data()
