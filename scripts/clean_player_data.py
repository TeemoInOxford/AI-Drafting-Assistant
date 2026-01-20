#!/usr/bin/env python3
"""
LOL数据清洗脚本
处理选手名称重复、前缀、空格、大小写不一致等问题
"""

import json
import os
from collections import defaultdict

# 配置
DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'lol')

# 选手名称合并规则
PLAYER_MERGE_RULES = {
    # LGD前缀选手 - 移除前缀，合并到无前缀版本
    'LGDBurdol': 'Burdol',
    'LGDMeteor': 'Meteor',
    'LGDhaichao': 'haichao',
    'LGDShaoye': 'Shaoye',
    'LGDJinjiao': 'Jinjiao',

    # Cryin重复 (带空格的版本)
    'Cryin ': 'Cryin',

    # 其他带空格的选手
    'Ganks ': 'Ganks',
    'Loki ': 'Loki',
    'Quantum ': 'Quantum',
}

# 大小写统一规则 (以右边为准)
CASE_NORMALIZE_RULES = {
    'ISMA': 'Isma',
    'jiaqi': 'JiaQi',
    'Jiaqi': 'JiaQi',
    'jiejie': 'JieJie',
    'Jiejie': 'JieJie',
    'jojopyun': 'Jojopyun',
    'knight': 'Knight',
    'shad0w': 'Shad0w',
    'VULCAN': 'Vulcan',
    'XUN': 'Xun',
}

# ID合并规则 (将左边ID的数据合并到右边ID)
ID_MERGE_RULES = {
    # LGD选手ID合并
    '35440': '21821',  # LGDBurdol -> Burdol
    '35442': '26234',  # LGDMeteor -> Meteor
    '35444': '21651',  # LGDhaichao -> haichao
    '35446': '29445',  # LGDShaoye -> Shaoye
    '35448': '26301',  # LGDJinjiao -> Jinjiao

    # Cryin ID合并 (旧ID -> 新ID)
    '24902': '112970',
}


def normalize_player_name(name):
    """标准化选手名称"""
    # 先检查合并规则
    if name in PLAYER_MERGE_RULES:
        name = PLAYER_MERGE_RULES[name]

    # 移除首尾空格
    name = name.strip()

    # 检查大小写规则
    if name in CASE_NORMALIZE_RULES:
        name = CASE_NORMALIZE_RULES[name]

    return name


def normalize_player_id(player_id):
    """标准化选手ID"""
    player_id = str(player_id)
    return ID_MERGE_RULES.get(player_id, player_id)


def clean_states_data(states_data):
    """清洗states数据"""
    cleaned = {}
    stats = {
        'total_series': 0,
        'name_fixes': 0,
        'id_merges': 0,
    }

    for series_id, state in states_data.items():
        stats['total_series'] += 1
        cleaned_state = state.copy()

        # 清洗teams中的players
        if 'teams' in cleaned_state:
            cleaned_teams = []
            for team in cleaned_state['teams']:
                cleaned_team = team.copy()
                if 'players' in cleaned_team:
                    cleaned_players = []
                    for player in cleaned_team['players']:
                        cleaned_player = player.copy()

                        # 标准化名称
                        original_name = player.get('name', '')
                        new_name = normalize_player_name(original_name)
                        if new_name != original_name:
                            cleaned_player['name'] = new_name
                            stats['name_fixes'] += 1

                        # 标准化ID
                        original_id = str(player.get('id', ''))
                        new_id = normalize_player_id(original_id)
                        if new_id != original_id:
                            cleaned_player['id'] = new_id
                            stats['id_merges'] += 1

                        cleaned_players.append(cleaned_player)
                    cleaned_team['players'] = cleaned_players
                cleaned_teams.append(cleaned_team)
            cleaned_state['teams'] = cleaned_teams

        # 清洗games中的players
        if 'games' in cleaned_state:
            cleaned_games = []
            for game in cleaned_state['games']:
                cleaned_game = game.copy()
                if 'teams' in cleaned_game:
                    cleaned_game_teams = []
                    for team in cleaned_game['teams']:
                        cleaned_team = team.copy()
                        if 'players' in cleaned_team:
                            cleaned_players = []
                            for player in cleaned_team['players']:
                                cleaned_player = player.copy()

                                original_name = player.get('name', '')
                                new_name = normalize_player_name(original_name)
                                if new_name != original_name:
                                    cleaned_player['name'] = new_name
                                    stats['name_fixes'] += 1

                                original_id = str(player.get('id', ''))
                                new_id = normalize_player_id(original_id)
                                if new_id != original_id:
                                    cleaned_player['id'] = new_id
                                    stats['id_merges'] += 1

                                cleaned_players.append(cleaned_player)
                            cleaned_team['players'] = cleaned_players
                        cleaned_game_teams.append(cleaned_team)
                    cleaned_game['teams'] = cleaned_game_teams
                cleaned_games.append(cleaned_game)
            cleaned_state['games'] = cleaned_games

        cleaned[series_id] = cleaned_state

    return cleaned, stats


def clean_index_data(index_data):
    """清洗index数据中的players"""
    cleaned = index_data.copy()
    stats = {
        'players_merged': 0,
        'names_fixed': 0,
    }

    if 'players' in cleaned:
        original_players = cleaned['players']
        merged_players = {}

        for player_id, player_data in original_players.items():
            # 标准化ID
            new_id = normalize_player_id(player_id)

            # 标准化名称
            original_name = player_data.get('name', '')
            new_name = normalize_player_name(original_name)

            if new_name != original_name:
                stats['names_fixed'] += 1

            # 合并数据
            if new_id in merged_players:
                # 合并seriesIds
                existing = merged_players[new_id]
                existing_series = set(existing.get('seriesIds', []))
                new_series = set(player_data.get('seriesIds', []))
                existing['seriesIds'] = list(existing_series | new_series)
                existing['count'] = len(existing['seriesIds'])
                stats['players_merged'] += 1
            else:
                merged_players[new_id] = {
                    'name': new_name,
                    'count': player_data.get('count', 0),
                    'seriesIds': player_data.get('seriesIds', []),
                }

        cleaned['players'] = merged_players

    return cleaned, stats


def main():
    print("=== LOL数据清洗脚本 ===\n")

    # 读取数据
    states_path = os.path.join(DATA_DIR, 'states.json')
    index_path = os.path.join(DATA_DIR, 'index.json')

    print("读取数据...")
    with open(states_path, 'r', encoding='utf-8') as f:
        states_data = json.load(f)

    with open(index_path, 'r', encoding='utf-8') as f:
        index_data = json.load(f)

    print(f"  - states.json: {len(states_data)} series")
    print(f"  - index.json: {len(index_data.get('players', {}))} players")

    # 清洗states数据
    print("\n清洗 states.json...")
    cleaned_states, states_stats = clean_states_data(states_data)
    print(f"  - 处理了 {states_stats['total_series']} 个series")
    print(f"  - 修复了 {states_stats['name_fixes']} 个名称")
    print(f"  - 合并了 {states_stats['id_merges']} 个ID")

    # 清洗index数据
    print("\n清洗 index.json...")
    cleaned_index, index_stats = clean_index_data(index_data)
    print(f"  - 修复了 {index_stats['names_fixed']} 个名称")
    print(f"  - 合并了 {index_stats['players_merged']} 个选手")
    print(f"  - 清洗后选手数: {len(cleaned_index.get('players', {}))}")

    # 备份原始数据
    backup_dir = os.path.join(DATA_DIR, 'backup')
    os.makedirs(backup_dir, exist_ok=True)

    import shutil
    from datetime import datetime
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')

    shutil.copy(states_path, os.path.join(backup_dir, f'states_{timestamp}.json'))
    shutil.copy(index_path, os.path.join(backup_dir, f'index_{timestamp}.json'))
    print(f"\n已备份原始数据到 {backup_dir}")

    # 保存清洗后的数据
    print("\n保存清洗后的数据...")
    with open(states_path, 'w', encoding='utf-8') as f:
        json.dump(cleaned_states, f, ensure_ascii=False, indent=2)

    with open(index_path, 'w', encoding='utf-8') as f:
        json.dump(cleaned_index, f, ensure_ascii=False, indent=2)

    print("\n=== 清洗完成 ===")
    print("\n合并规则:")
    print("  LGD选手:")
    for old, new in PLAYER_MERGE_RULES.items():
        if old.startswith('LGD'):
            print(f"    {old} -> {new}")
    print("  Cryin: 'Cryin ' -> 'Cryin'")
    print("  大小写统一: Isma, JiaQi, JieJie, Jojopyun, Knight, Shad0w, Vulcan, Xun")


if __name__ == '__main__':
    main()
