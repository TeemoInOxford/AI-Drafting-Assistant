#!/usr/bin/env python3
"""
综合数据清洗脚本 - Comprehensive Data Cleaning Script
确保数据的唯一性和非空性 - Ensure data uniqueness and non-null values

功能 (Features):
1. 移除测试/虚拟数据 (Remove test/dummy data)
2. 确保选手ID唯一性 (Ensure player ID uniqueness)
3. 移除空值和无效数据 (Remove null/invalid data)
4. 标准化名称格式 (Normalize name formats)
5. 验证数据完整性 (Validate data integrity)
"""

import json
import os
import re
from datetime import datetime
from collections import defaultdict

# 配置
DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'lol')

# 测试数据模式 - Test data patterns to remove
TEST_PATTERNS = [
    r'^TEST\s*\d+',      # TEST 6, TEST7, etc.
    r'^Test\s*\d+',      # Test 07, Test08, etc.
    r'^OQ\d+',           # OQ01, OQ52, etc.
    r'^LOLTest\d+',      # LOLTest01, etc.
    r'^test\s*player',   # test player, etc.
    r'^dummy',           # dummy players
    r'^placeholder',     # placeholder players
]

def is_test_player(nickname):
    """检查是否为测试选手"""
    if not nickname or not isinstance(nickname, str):
        return True

    nickname = nickname.strip()
    if not nickname:
        return True

    # 检查测试模式
    for pattern in TEST_PATTERNS:
        if re.match(pattern, nickname, re.IGNORECASE):
            return True

    return False

def normalize_nickname(nickname):
    """标准化选手昵称"""
    if not nickname or not isinstance(nickname, str):
        return None

    # 移除首尾空格
    nickname = nickname.strip()

    if not nickname:
        return None

    return nickname

def clean_index_data(index_data):
    """清洗 index.json 数据"""
    stats = {
        'total_teams': len(index_data),
        'teams_removed': 0,
        'players_removed': 0,
        'test_players_removed': 0,
        'null_players_removed': 0,
        'duplicate_players_removed': 0,
        'names_normalized': 0,
    }

    cleaned_teams = []
    seen_player_ids = set()

    for team in index_data:
        if not isinstance(team, dict):
            stats['teams_removed'] += 1
            continue

        # 验证必需字段
        if not team.get('id') or not team.get('name'):
            stats['teams_removed'] += 1
            continue

        cleaned_team = {
            'id': str(team['id']),
            'name': team['name'],
            'nameShortened': team.get('nameShortened', team['name']),
            'logoUrl': team.get('logoUrl', ''),
            'organization': team.get('organization'),
            'region': team.get('region', 'Unknown'),
            'tournaments': team.get('tournaments', []),
            'players': []
        }

        # 清洗选手数据
        if 'players' in team and isinstance(team['players'], list):
            for player in team['players']:
                if not isinstance(player, dict):
                    stats['players_removed'] += 1
                    continue

                player_id = player.get('id')
                nickname = player.get('nickname')

                # 检查必需字段
                if not player_id or not nickname:
                    stats['null_players_removed'] += 1
                    stats['players_removed'] += 1
                    continue

                # 标准化昵称
                original_nickname = nickname
                nickname = normalize_nickname(nickname)

                if not nickname:
                    stats['null_players_removed'] += 1
                    stats['players_removed'] += 1
                    continue

                if nickname != original_nickname:
                    stats['names_normalized'] += 1

                # 检查是否为测试选手
                if is_test_player(nickname):
                    stats['test_players_removed'] += 1
                    stats['players_removed'] += 1
                    continue

                # 检查重复ID (在整个数据集中)
                player_id_str = str(player_id)
                if player_id_str in seen_player_ids:
                    stats['duplicate_players_removed'] += 1
                    stats['players_removed'] += 1
                    continue

                seen_player_ids.add(player_id_str)

                # 添加清洗后的选手
                cleaned_team['players'].append({
                    'id': player_id_str,
                    'nickname': nickname
                })

        # 更新选手数量
        cleaned_team['playerCount'] = len(cleaned_team['players'])

        # 只保留有选手的队伍
        if cleaned_team['players']:
            cleaned_teams.append(cleaned_team)
        else:
            stats['teams_removed'] += 1

    return cleaned_teams, stats

def clean_hierarchy_data(hierarchy_data):
    """清洗 hierarchy.json 数据"""
    stats = {
        'players_checked': 0,
        'test_players_removed': 0,
        'names_normalized': 0,
    }

    if not isinstance(hierarchy_data, dict):
        return hierarchy_data, stats

    cleaned = hierarchy_data.copy()

    # 清洗 regions 中的数据
    if 'regions' in cleaned:
        for region_key, region_data in cleaned['regions'].items():
            if not isinstance(region_data, dict) or 'leagues' not in region_data:
                continue

            for league_key, league_data in region_data['leagues'].items():
                if not isinstance(league_data, dict) or 'teams' not in league_data:
                    continue

                # teams 是 ID 列表，不需要清洗
                pass

    return cleaned, stats

def clean_series_data(series_data):
    """清洗 series.json 数据"""
    stats = {
        'total_series': len(series_data) if isinstance(series_data, list) else 0,
        'series_removed': 0,
    }

    if not isinstance(series_data, list):
        return series_data, stats

    cleaned_series = []

    for series in series_data:
        if not isinstance(series, dict):
            stats['series_removed'] += 1
            continue

        # 验证必需字段
        if not series.get('id'):
            stats['series_removed'] += 1
            continue

        cleaned_series.append(series)

    return cleaned_series, stats

def validate_data_integrity(index_data, hierarchy_data):
    """验证数据完整性"""
    issues = []

    # 收集所有选手ID
    player_ids = set()
    team_ids = set()

    for team in index_data:
        team_id = team.get('id')
        if team_id:
            team_ids.add(str(team_id))

        for player in team.get('players', []):
            player_id = player.get('id')
            if player_id:
                player_ids.add(str(player_id))

    # 检查 hierarchy 中引用的 team IDs 是否存在
    if isinstance(hierarchy_data, dict) and 'regions' in hierarchy_data:
        for region_key, region_data in hierarchy_data['regions'].items():
            if not isinstance(region_data, dict) or 'leagues' not in region_data:
                continue

            for league_key, league_data in region_data['leagues'].items():
                if not isinstance(league_data, dict) or 'teams' not in league_data:
                    continue

                for team_id in league_data.get('teams', []):
                    if str(team_id) not in team_ids:
                        issues.append(f"Team ID {team_id} in hierarchy not found in index")

    return issues

def main():
    print("=" * 60)
    print("Comprehensive Data Cleaning Script")
    print("=" * 60)
    print()

    # 读取数据文件
    index_path = os.path.join(DATA_DIR, 'index.json')
    hierarchy_path = os.path.join(DATA_DIR, 'hierarchy.json')
    series_path = os.path.join(DATA_DIR, 'series.json')

    print("[1/6] Loading data files...")

    with open(index_path, 'r', encoding='utf-8') as f:
        index_data = json.load(f)
    print(f"  - index.json: {len(index_data)} teams")

    with open(hierarchy_path, 'r', encoding='utf-8') as f:
        hierarchy_data = json.load(f)
    print(f"  - hierarchy.json loaded")

    with open(series_path, 'r', encoding='utf-8') as f:
        series_data = json.load(f)
    print(f"  - series.json: {len(series_data)} series")

    print()

    # 备份原始数据
    backup_dir = os.path.join(DATA_DIR, 'backup')
    os.makedirs(backup_dir, exist_ok=True)

    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')

    print("[2/6] Backing up original data...")
    import shutil
    shutil.copy(index_path, os.path.join(backup_dir, f'index_{timestamp}.json'))
    shutil.copy(hierarchy_path, os.path.join(backup_dir, f'hierarchy_{timestamp}.json'))
    shutil.copy(series_path, os.path.join(backup_dir, f'series_{timestamp}.json'))
    print(f"  - Backup saved to: {backup_dir}")
    print()

    # 清洗 index.json
    print("[3/6] Cleaning index.json...")
    cleaned_index, index_stats = clean_index_data(index_data)
    print(f"  - Original teams: {index_stats['total_teams']}")
    print(f"  - Teams removed: {index_stats['teams_removed']}")
    print(f"  - Teams after cleaning: {len(cleaned_index)}")
    print(f"  - Total players removed: {index_stats['players_removed']}")
    print(f"    * Test players: {index_stats['test_players_removed']}")
    print(f"    * Null players: {index_stats['null_players_removed']}")
    print(f"    * Duplicate players: {index_stats['duplicate_players_removed']}")
    print(f"  - Names normalized: {index_stats['names_normalized']}")
    print()

    # 清洗 hierarchy.json
    print("[4/6] Cleaning hierarchy.json...")
    cleaned_hierarchy, hierarchy_stats = clean_hierarchy_data(hierarchy_data)
    print(f"  - Data structure maintained")
    print()

    # 清洗 series.json
    print("[5/6] Cleaning series.json...")
    cleaned_series, series_stats = clean_series_data(series_data)
    print(f"  - Original series: {series_stats['total_series']}")
    print(f"  - Series removed: {series_stats['series_removed']}")
    print(f"  - Series after cleaning: {len(cleaned_series)}")
    print()

    # 验证数据完整性
    print("[6/6] Validating data integrity...")
    issues = validate_data_integrity(cleaned_index, cleaned_hierarchy)
    if issues:
        print(f"  - WARNING: Found {len(issues)} issues:")
        for issue in issues[:10]:  # 只显示前10个
            print(f"    * {issue}")
        if len(issues) > 10:
            print(f"    * ... and {len(issues) - 10} more issues")
    else:
        print("  - Data integrity validation passed")
    print()

    # 保存清洗后的数据
    print("Saving cleaned data...")

    with open(index_path, 'w', encoding='utf-8') as f:
        json.dump(cleaned_index, f, ensure_ascii=False, indent=2)
    print(f"  - index.json saved")

    with open(hierarchy_path, 'w', encoding='utf-8') as f:
        json.dump(cleaned_hierarchy, f, ensure_ascii=False, indent=2)
    print(f"  - hierarchy.json saved")

    with open(series_path, 'w', encoding='utf-8') as f:
        json.dump(cleaned_series, f, ensure_ascii=False, indent=2)
    print(f"  - series.json saved")

    print()
    print("=" * 60)
    print("Data Cleaning Completed Successfully!")
    print("=" * 60)
    print()
    print("Cleaning Summary:")
    print(f"  - Test players removed: {index_stats['test_players_removed']}")
    print(f"  - Null players removed: {index_stats['null_players_removed']}")
    print(f"  - Duplicate players removed: {index_stats['duplicate_players_removed']}")
    print(f"  - Names normalized: {index_stats['names_normalized']}")
    print(f"  - Teams removed: {index_stats['teams_removed']}")
    print(f"  - Final team count: {len(cleaned_index)}")

    # 统计清洗后的选手数
    total_players = sum(len(team.get('players', [])) for team in cleaned_index)
    print(f"  - Final player count: {total_players}")
    print()

if __name__ == '__main__':
    main()
