#!/usr/bin/env python3
"""
审计脚本：分析 team-games 从理论最大值到最终 4682 的收缩过程
"""

import json
import os
import glob
from datetime import datetime, timezone
from collections import defaultdict
import math

DATA_DIR = '/www/wwwroot/AI-Drafting-Assistant/data/grid_v2'

# 参数（与原始脚本一致）
BETA = 0.5
GAMMA = 2

# Team ID mapping (known aliases/renames)
TEAM_ID_MAPPING = {
    '48610': '47757',  # TBD-1 -> LEVIATÁN
}

# Patch start dates (ISO format) - extended to include all relevant patches
PATCH_START_DATES = {
    # 14.x patches (approximate dates based on typical bi-weekly schedule)
    1401: "2024-01-10",
    1402: "2024-01-24",
    1403: "2024-02-07",
    1404: "2024-02-21",
    1405: "2024-03-06",
    1406: "2024-03-20",
    1407: "2024-04-03",
    1408: "2024-04-17",
    1409: "2024-05-01",
    1410: "2024-05-15",
    1411: "2024-05-29",
    1412: "2024-06-12",
    1413: "2024-06-26",
    1414: "2024-07-17",
    1415: "2024-07-31",
    1416: "2024-08-14",
    1417: "2024-08-28",
    1418: "2024-09-11",
    1419: "2024-09-25",
    1420: "2024-10-09",
    1421: "2024-10-23",
    1422: "2024-11-06",
    1423: "2024-11-20",
    1424: "2024-12-04",
    # 15.x patches
    1501: "2025-01-08",
    1502: "2025-01-22",
    1503: "2025-02-05",
    1504: "2025-02-19",
    1505: "2025-03-05",
    1506: "2025-03-19",
    1507: "2025-04-02",
    1508: "2025-04-16",
    1509: "2025-04-30",
    1510: "2025-05-14",
    1511: "2025-05-28",
    1512: "2025-06-11",
    1513: "2025-06-25",
    1514: "2025-07-09",
    1515: "2025-07-23",
    1516: "2025-08-06",
    1517: "2025-08-20",
    1518: "2025-09-03",
}

def parse_patch_index(title_version):
    """Parse patch version to patch_index (e.g., '15.18' -> 1518)

    title_version can be:
    - A string like '15.18'
    - A dict like {'name': '15.17'}
    """
    if not title_version:
        return None

    # Handle dict format
    if isinstance(title_version, dict):
        title_version = title_version.get('name')
        if not title_version:
            return None

    try:
        parts = str(title_version).split('.')
        if len(parts) >= 2:
            major = int(parts[0])
            minor = int(parts[1])
            return major * 100 + minor
    except:
        pass
    return None

def load_team_power_scores():
    """Load team power scores from JSON"""
    with open(os.path.join(DATA_DIR, 'team_power_score.json'), 'r') as f:
        data = json.load(f)

    team_scores = {}
    for team in data:
        team_id = team['id']
        team_scores[team_id] = team.get('power_score', {})
    return team_scores

def get_team_score_and_datekey(team_id, game_date, team_scores):
    """Get team's power score for the closest available date

    First tries to find date <= game_date.
    If not found, falls back to the earliest available date (after game_date).
    """
    if team_id not in team_scores:
        return None, None

    scores = team_scores[team_id]
    if not scores:
        return None, None

    # First: try to find closest date <= game_date
    available_dates = sorted(scores.keys(), reverse=True)
    for date_key in available_dates:
        if date_key <= game_date:
            return scores[date_key], date_key

    # Fallback: use earliest available date (even if after game_date)
    earliest_date = sorted(scores.keys())[0]
    return scores[earliest_date], earliest_date

def load_all_games():
    """Load all games from series files"""
    series_files = glob.glob(os.path.join(DATA_DIR, 'series_*.json'))
    all_games = []

    for sf in series_files:
        with open(sf, 'r') as f:
            series = json.load(f)

        games = series.get('games', [])
        for game in games:
            game['_series_id'] = series.get('id')
            game['_series_teams'] = series.get('teams', [])
            game['_series_startedAt'] = series.get('startedAt')
            all_games.append(game)

    return all_games

def audit_team_games():
    """Main audit function"""
    print("=" * 80)
    print("Team-Games 样本收缩审计报告")
    print("=" * 80)
    print()

    # Load data
    print("加载数据...")
    team_scores = load_team_power_scores()
    all_games = load_all_games()

    print(f"  - Team power scores: {len(team_scores)} teams")
    print(f"  - Total games loaded: {len(all_games)}")
    print()

    # =========================================================================
    # Step 0: Theoretical maximum
    # =========================================================================
    theoretical_team_games = len(all_games) * 2

    print("=" * 80)
    print("Step 0 | 理论上限")
    print("=" * 80)
    print(f"  Total games (from series files): {len(all_games)}")
    print(f"  Theoretical team-games (× 2): {theoretical_team_games}")
    print()

    # =========================================================================
    # Step 1: Patch / Time validity filtering (game-level)
    # =========================================================================
    print("=" * 80)
    print("Step 1 | Patch / 时间有效性过滤 (game-level)")
    print("=" * 80)

    step1_filters = {
        'missing_titleVersion': [],
        'missing_startedAt': [],
        'parse_patch_index_failed': [],
        'delta_patch_negative': [],
        'd_negative': [],
    }

    # Find target patch (max patch_index)
    target_patch_index = None
    for game in all_games:
        tv = game.get('titleVersion')
        if tv:
            pi = parse_patch_index(tv)
            if pi and (target_patch_index is None or pi > target_patch_index):
                target_patch_index = pi

    target_patch = f"{target_patch_index // 100}.{target_patch_index % 100}" if target_patch_index else "Unknown"
    print(f"  Target patch: {target_patch} (index: {target_patch_index})")
    print()

    games_after_step1 = []

    for game in all_games:
        game_id = game.get('id', 'unknown')

        # Check titleVersion
        title_version = game.get('titleVersion')
        if not title_version:
            step1_filters['missing_titleVersion'].append(game_id)
            continue

        # Check startedAt (use series startedAt as fallback)
        started_at = game.get('startedAt') or game.get('_series_startedAt')
        if not started_at:
            step1_filters['missing_startedAt'].append(game_id)
            continue

        # Parse patch index
        patch_index = parse_patch_index(title_version)
        if patch_index is None:
            step1_filters['parse_patch_index_failed'].append(game_id)
            continue

        # Check delta_patch
        delta_patch = target_patch_index - patch_index
        if delta_patch < 0:
            step1_filters['delta_patch_negative'].append(game_id)
            continue

        # Check d (days since patch start)
        if patch_index not in PATCH_START_DATES:
            # Skip patches not in our mapping (likely old patches)
            step1_filters['d_negative'].append(game_id)
            continue

        patch_start_str = PATCH_START_DATES[patch_index]
        patch_start = datetime.strptime(patch_start_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        game_dt = datetime.fromisoformat(started_at.replace('Z', '+00:00'))
        d = (game_dt - patch_start).days

        if d < 0:
            step1_filters['d_negative'].append(game_id)
            continue

        # Game passes Step 1
        game['_patch_index'] = patch_index
        game['_delta_patch'] = delta_patch
        game['_d'] = d
        game['_game_date'] = game_dt.strftime('%Y-%m-%d')
        games_after_step1.append(game)

    # Print Step 1 results
    total_removed_step1 = 0
    for reason, games_list in step1_filters.items():
        count = len(games_list)
        total_removed_step1 += count
        print(f"  {reason}: {count} games ({count * 2} team-games)")

    print()
    print(f"  Total games removed in Step 1: {total_removed_step1}")
    print(f"  Equivalent team-games removed: {total_removed_step1 * 2}")
    print(f"  Remaining games: {len(games_after_step1)}")
    print(f"  Remaining team-games (theoretical): {len(games_after_step1) * 2}")
    print()

    # =========================================================================
    # Step 2: Team Power Score availability filtering (team-game-level)
    # =========================================================================
    print("=" * 80)
    print("Step 2 | Team Power Score 可用性过滤 (team-game-level)")
    print("=" * 80)

    step2_filters = {
        'team_id_not_in_scores': 0,
        'no_valid_date_key': 0,
        'missing_team_info': 0,
    }

    team_games_after_step2 = []
    games_with_partial_teams = []  # Games where only 1 team-game survives

    for game in games_after_step1:
        game_date = game['_game_date']
        series_teams = game.get('_series_teams', [])

        # Get team IDs from game data
        teams_in_game = game.get('teams', [])
        if not teams_in_game:
            # Try to get from series teams
            teams_in_game = series_teams

        valid_team_games_for_this_game = []

        for team in teams_in_game:
            team_id = str(team.get('id', ''))
            if not team_id:
                step2_filters['missing_team_info'] += 1
                continue

            # Apply team ID mapping (e.g., TBD-1 -> LEVIATÁN)
            team_id = TEAM_ID_MAPPING.get(team_id, team_id)

            if team_id not in team_scores:
                step2_filters['team_id_not_in_scores'] += 1
                continue

            score, date_key = get_team_score_and_datekey(team_id, game_date, team_scores)
            if score is None or date_key is None:
                step2_filters['no_valid_date_key'] += 1
                continue

            # Team-game passes Step 2
            valid_team_games_for_this_game.append({
                'game_id': game.get('id'),
                'team_id': team_id,
                'team_name': team.get('name', 'Unknown'),
                'game_date': game_date,
                'score': score,
                'date_key': date_key,
                'patch_index': game['_patch_index'],
                'delta_patch': game['_delta_patch'],
                'd': game['_d'],
            })

        if len(valid_team_games_for_this_game) == 1:
            games_with_partial_teams.append(game.get('id'))

        team_games_after_step2.extend(valid_team_games_for_this_game)

    print(f"  team_id_not_in_scores: {step2_filters['team_id_not_in_scores']} team-games")
    print(f"  no_valid_date_key: {step2_filters['no_valid_date_key']} team-games")
    print(f"  missing_team_info: {step2_filters['missing_team_info']} team-games")

    total_removed_step2 = sum(step2_filters.values())
    print()
    print(f"  Total team-games removed in Step 2: {total_removed_step2}")
    print(f"  Games with only 1 valid team-game: {len(games_with_partial_teams)}")
    print(f"  Remaining team-games: {len(team_games_after_step2)}")
    print()

    # =========================================================================
    # Step 3: Final usable team-games
    # =========================================================================
    print("=" * 80)
    print("Step 3 | 最终有效 team-games")
    print("=" * 80)
    print(f"  Final usable team-games: {len(team_games_after_step2)}")
    print()

    # Verify against expected value
    expected = 4682
    if len(team_games_after_step2) == expected:
        print(f"  ✓ 验证通过：最终 team-games 数量 = {expected}")
    else:
        print(f"  ✗ 验证失败：期望 {expected}，实际 {len(team_games_after_step2)}")
        print(f"    差异: {len(team_games_after_step2) - expected}")
    print()

    # =========================================================================
    # Summary Table
    # =========================================================================
    print("=" * 80)
    print("审计汇总表")
    print("=" * 80)
    print()
    print(f"{'Step':<8} {'Filter Reason':<35} {'Games Removed':<15} {'Team-Games Removed':<20} {'Remaining Team-Games':<20}")
    print("-" * 98)
    print(f"{'0':<8} {'Theoretical max':<35} {'–':<15} {'–':<20} {theoretical_team_games:<20}")

    step1_team_games_removed = total_removed_step1 * 2
    remaining_after_step1 = theoretical_team_games - step1_team_games_removed
    print(f"{'1':<8} {'Patch / time filters':<35} {total_removed_step1:<15} {step1_team_games_removed:<20} {remaining_after_step1:<20}")

    print(f"{'2':<8} {'Missing team power score':<35} {'–':<15} {total_removed_step2:<20} {len(team_games_after_step2):<20}")
    print(f"{'3':<8} {'Final usable':<35} {'–':<15} {'–':<20} {len(team_games_after_step2):<20}")
    print()

    # =========================================================================
    # Detailed breakdown
    # =========================================================================
    print("=" * 80)
    print("Step 1 详细分类")
    print("=" * 80)
    for reason, games_list in step1_filters.items():
        count = len(games_list)
        pct = (count * 2 / theoretical_team_games * 100) if theoretical_team_games > 0 else 0
        print(f"  {reason:<30} {count:>6} games  ({count * 2:>6} team-games, {pct:.2f}%)")
    print()

    print("=" * 80)
    print("Step 2 详细分类")
    print("=" * 80)
    for reason, count in step2_filters.items():
        pct = (count / remaining_after_step1 * 100) if remaining_after_step1 > 0 else 0
        print(f"  {reason:<30} {count:>6} team-games ({pct:.2f}%)")
    print()

    # =========================================================================
    # Analysis Summary
    # =========================================================================
    print("=" * 80)
    print("分析总结")
    print("=" * 80)
    print()

    # Calculate percentages
    step1_pct = (step1_team_games_removed / theoretical_team_games * 100) if theoretical_team_games > 0 else 0
    step2_pct = (total_removed_step2 / remaining_after_step1 * 100) if remaining_after_step1 > 0 else 0
    total_removed = step1_team_games_removed + total_removed_step2
    total_pct = (total_removed / theoretical_team_games * 100) if theoretical_team_games > 0 else 0

    print(f"1. 主要过滤来源：")
    if step1_team_games_removed > total_removed_step2:
        print(f"   - Step 1 (Patch/时间过滤) 是主要过滤来源，移除了 {step1_team_games_removed} team-games ({step1_pct:.1f}%)")
    else:
        print(f"   - Step 2 (Team Power Score 过滤) 是主要过滤来源，移除了 {total_removed_step2} team-games ({step2_pct:.1f}%)")

    # Breakdown of Step 1 filters
    print()
    print(f"   Step 1 过滤细分：")
    missing_tv = len(step1_filters['missing_titleVersion'])
    missing_sa = len(step1_filters['missing_startedAt'])
    parse_fail = len(step1_filters['parse_patch_index_failed'])
    delta_neg = len(step1_filters['delta_patch_negative'])
    d_neg = len(step1_filters['d_negative'])

    print(f"     • 缺失 titleVersion: {missing_tv} games ({missing_tv * 2} team-games)")
    print(f"       - 这些 games 来自 series 文件中缺少 titleVersion 字段的记录")
    print(f"       - 通常是早期或不完整的数据导入")
    print(f"     • 缺失 startedAt: {missing_sa} games ({missing_sa * 2} team-games)")
    if parse_fail > 0:
        print(f"     • parse_patch_index 失败: {parse_fail} games ({parse_fail * 2} team-games)")
    if delta_neg > 0:
        print(f"     • delta_patch < 0: {delta_neg} games ({delta_neg * 2} team-games)")
    if d_neg > 0:
        print(f"     • d < 0 或 patch 不在映射中: {d_neg} games ({d_neg * 2} team-games)")

    print()
    print(f"2. 总体过滤统计：")
    print(f"   - 理论最大值: {theoretical_team_games} team-games")
    print(f"   - 最终有效值: {len(team_games_after_step2)} team-games")
    print(f"   - 总移除数量: {total_removed} team-games ({total_pct:.1f}%)")
    print()

    print(f"3. 边缘情况：")
    print(f"   - 单边 team-game 被保留的 games: {len(games_with_partial_teams)}")
    if games_with_partial_teams:
        print(f"     (这些 games 中只有一个队伍有有效的 power score)")
        if len(games_with_partial_teams) <= 10:
            print(f"     Game IDs: {games_with_partial_teams}")
    print()

    # Check for d_negative details
    d_negative_count = len(step1_filters['d_negative'])
    if d_negative_count > 0:
        print(f"4. 关于 'd < 0 或 patch 不在映射中' 的 {d_negative_count} 个 games：")
        print(f"   - 这些可能是旧版本 patch (如 14.x) 的比赛，不在当前 15.x 的 patch 日期映射中")
    print()

    # =========================================================================
    # Conclusion
    # =========================================================================
    print("=" * 80)
    print("结论")
    print("=" * 80)
    print()
    print(f"从 {theoretical_team_games} 个理论 team-games 收缩到 {len(team_games_after_step2)} 个最终有效 team-games 的过程：")
    print()
    print(f"  1. 主要过滤发生在 Step 1（game-level Patch/时间过滤）：")
    print(f"     - 移除了 {step1_team_games_removed} team-games（占理论总量的 {step1_pct:.1f}%）")
    print(f"     - 主要原因是 {missing_tv} 个 games 缺失 titleVersion 字段")
    print()
    print(f"  2. Step 2（team-game-level Power Score 过滤）影响很小：")
    print(f"     - 只移除了 {total_removed_step2} team-games（占 Step 1 后剩余量的 {step2_pct:.2f}%）")
    if total_removed_step2 == 0:
        print(f"     - 所有队伍都有可用的 power score（通过 team ID 映射和日期 fallback）")
    print()
    print(f"  3. 数据质量观察：")
    print(f"     - 约 {missing_tv / len(all_games) * 100:.1f}% 的 games 缺失版本信息")
    print(f"     - 建议检查数据导入流程，确保 titleVersion 字段完整")
    print()

    return {
        'theoretical_team_games': theoretical_team_games,
        'step1_removed': step1_team_games_removed,
        'step2_removed': total_removed_step2,
        'final_team_games': len(team_games_after_step2),
    }

if __name__ == '__main__':
    audit_team_games()
