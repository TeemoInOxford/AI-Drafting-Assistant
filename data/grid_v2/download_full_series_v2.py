#!/usr/bin/env python3
"""
Grid.gg 完整比赛数据下载器 v2
==============================
使用二分法检测版本，根据版本动态构建查询
包含所有新增字段：structures, nonPlayerCharacters, abilities, position, multikills, unitKills 等
"""

import requests
import json
import os
import time
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

STATE_API_URL = "https://api-op.grid.gg/live-data-feed/series-state/graphql"
API_KEY = "crM9kbj1QQVhzN6vm19DiYwJUl4lMoTdSHVBlMO8"
HEADERS = {"Content-Type": "application/json", "x-api-key": API_KEY}
OUTPUT_DIR = "/www/wwwroot/AI-Drafting-Assistant/data/grid_v2"

MAX_WORKERS = 10
REQUEST_DELAY = 0.2
RATE_LIMIT_WAIT = 35

# 版本检测查询（从高到低）
VERSION_TESTS = [
    ("v3.42", '''query($id:ID!){seriesState(id:$id){games{teams{...on GameTeamStateLol{forwardPercentage}}}}}'''),
    ("v3.41", '''query($id:ID!){seriesState(id:$id){games{teams{...on GameTeamStateLol{majorMoneyDeficit}}}}}'''),
    ("v3.40", '''query($id:ID!){seriesState(id:$id){games{teams{...on GameTeamStateLol{majorMoneyLead}}}}}'''),
    ("v3.38", '''query($id:ID!){seriesState(id:$id){games{teams{...on GameTeamStateLol{baronPowerPlays{id}}}}}}'''),
    ("v3.37", '''query($id:ID!){seriesState(id:$id){games{teams{players{...on GamePlayerStateLol{moneyPercentage}}}}}}'''),
    ("v3.36", '''query($id:ID!){seriesState(id:$id){games{teams{...on GameTeamStateLol{moneyPerMinute}}}}}'''),
    ("v3.35", '''query($id:ID!){seriesState(id:$id){games{teams{players{...on GamePlayerStateLol{killParticipation}}}}}}'''),
    ("v3.34", '''query($id:ID!){seriesState(id:$id){games{teams{...on GameTeamStateLol{killsAndAssists}}}}}'''),
    ("v3.33", '''query($id:ID!){seriesState(id:$id){games{teams{...on GameTeamStateLol{visionScorePerMinute}}}}}'''),
    ("v3.30", '''query($id:ID!){seriesState(id:$id){games{teams{...on GameTeamStateLol{visionScore}}}}}'''),
    ("v3.28", '''query($id:ID!){seriesState(id:$id){games{teams{...on GameTeamStateLol{moneyDifference}}}}}'''),
    ("v3.27", '''query($id:ID!){seriesState(id:$id){games{teams{...on GameTeamStateLol{kdaRatio}}}}}'''),
    ("v3.26", '''query($id:ID!){seriesState(id:$id){games{teams{...on GameTeamStateLol{damagePerMoney}}}}}'''),
    ("v3.25", '''query($id:ID!){seriesState(id:$id){games{teams{players{...on GamePlayerStateLol{damagePercentage}}}}}}'''),
    ("v3.24", '''query($id:ID!){seriesState(id:$id){games{teams{...on GameTeamStateLol{damagePerMinute}}}}}'''),
    ("v3.23", '''query($id:ID!){seriesState(id:$id){games{teams{...on GameTeamStateLol{damageDealt}}}}}'''),
    ("v3.15", '''query($id:ID!){seriesState(id:$id){games{duration}}}'''),
    ("v3.14", '''query($id:ID!){seriesState(id:$id){duration}}'''),
    ("v3.11", '''query($id:ID!){seriesState(id:$id){games{teams{objectives{completedFirst}}}}}'''),
    ("v3.10", '''query($id:ID!){seriesState(id:$id){games{teams{...on GameTeamStateLol{firstKill}}}}}'''),
    ("v3.7", '''query($id:ID!){seriesState(id:$id){games{startedAt}}}'''),
    ("v3.3", '''query($id:ID!){seriesState(id:$id){games{teams{players{...on GamePlayerStateLol{respawnClock{currentSeconds}}}}}}}'''),
    ("v3.2", '''query($id:ID!){seriesState(id:$id){games{teams{players{...on GamePlayerStateLol{totalMoneyEarned}}}}}}'''),
]

def parse_version(version):
    if version == "basic":
        return (0, 0)
    parts = version.replace("v", "").split(".")
    return tuple(int(p) for p in parts)

def build_query(version):
    """根据版本动态构建查询 - 包含所有新增字段"""
    ver = parse_version(version)

    # 基础字段
    series_extra = ["valid", "version", "updatedAt", "title { nameShortened }"]
    series_extra.append("draftActions { id type sequenceNumber drafter { id type } draftable { id type name } }")

    # Series.teams 新增字段
    series_team_extra = [
        "killAssistsGiven", "killAssistsReceived",
        "killAssistsReceivedFromPlayer { id playerId killAssistsReceived }",
        "multikills { id numberOfKills count }",
        "objectives { id type completionCount }",
        "structuresDestroyed"
    ]

    # Series.teams.players 新增字段
    series_player_extra = [
        "kills", "deaths",
        "killAssistsGiven", "killAssistsReceived",
        "multikills { id numberOfKills count }",
        "objectives { id type completionCount }",
        "structuresDestroyed",
        "participationStatus"
    ]

    # v3.10: firstKill
    if ver >= (3, 10):
        series_team_extra.insert(0, "firstKill")
        series_player_extra.insert(2, "firstKill")

    # v3.11: completedFirst in objectives
    if ver >= (3, 11):
        # 替换 objectives 字段，添加 completedFirst
        for i, f in enumerate(series_team_extra):
            if f.startswith("objectives"):
                series_team_extra[i] = "objectives { id type completionCount completedFirst }"
                break
        for i, f in enumerate(series_player_extra):
            if f.startswith("objectives"):
                series_player_extra[i] = "objectives { id type completionCount completedFirst }"
                break

    # Games 新增字段 (这些字段在所有版本都存在)
    games_extra = ["paused"]
    games_extra.append("clock { id type ticking ticksBackwards currentSeconds }")
    games_extra.append("externalLinks { dataProvider { name } externalEntity { id } }")
    games_extra.append("structures { id type side teamId destroyed currentHealth maxHealth position { x y } }")
    games_extra.append("nonPlayerCharacters { id type side alive position { x y } respawnClock { currentSeconds } }")

    # v3.14: map, titleVersion
    if ver >= (3, 14):
        games_extra.append("map { id name bounds { min { x y } max { x y } } }")
        games_extra.append("titleVersion { name }")

    # Games.teams 新增字段
    game_team_extra = [
        "score",
        "killAssistsGiven", "killAssistsReceived",
        "killAssistsReceivedFromPlayer { id playerId killAssistsReceived }",
        "loadoutValue", "money",
        "multikills { id numberOfKills count }",
        "unitKills { id unitName count }",
        "structuresDestroyed"
    ]

    # Games.teams.players 新增字段
    game_player_extra = [
        "killAssistsReceived",
        "killAssistsReceivedFromPlayer { id playerId killAssistsReceived }",
        "loadoutValue", "money",
        "participationStatus",
        "position { x y }",
        "multikills { id numberOfKills count }",
        "unitKills { id unitName count }",
        "structuresDestroyed",
        "abilities { id name ready }"
    ]

    # v3.10: firstKill for game players
    if ver >= (3, 10):
        game_player_extra.insert(2, "firstKill")

    # v3.42: roles
    if ver >= (3, 42):
        game_player_extra.append("roles { id }")

    # LOL 特定字段 - 根据版本添加
    team_lol = ["experiencePoints"]
    player_lol = ["experiencePoints", "alive", "currentHealth", "maxHealth", "currentArmor"]
    obj_fields = ["id", "type", "completionCount"]

    # v3.2: totalMoneyEarned
    if ver >= (3, 2):
        team_lol.append("totalMoneyEarned")
        player_lol.append("totalMoneyEarned")
    # v3.3: respawnClock
    if ver >= (3, 3):
        player_lol.append("respawnClock { currentSeconds }")
    # v3.7: games.startedAt
    if ver >= (3, 7):
        games_extra.append("startedAt")
    # v3.10: firstKill
    if ver >= (3, 10):
        team_lol.append("firstKill")
    # v3.11: completedFirst
    if ver >= (3, 11):
        obj_fields.append("completedFirst")
    # v3.14: series.duration
    if ver >= (3, 14):
        series_extra.append("duration")
    # v3.15: games.duration
    if ver >= (3, 15):
        games_extra.append("duration")
    # v3.23: damageDealt, damageTaken
    if ver >= (3, 23):
        team_lol.extend(["damageDealt", "damageTaken"])
        player_lol.extend(["damageDealt", "damageTaken"])
    # v3.24: damagePerMinute
    if ver >= (3, 24):
        team_lol.append("damagePerMinute")
        player_lol.append("damagePerMinute")
    # v3.25: damagePercentage
    if ver >= (3, 25):
        player_lol.append("damagePercentage")
    # v3.26: damagePerMoney
    if ver >= (3, 26):
        team_lol.append("damagePerMoney")
        player_lol.append("damagePerMoney")
    # v3.27: kdaRatio
    if ver >= (3, 27):
        team_lol.append("kdaRatio")
        player_lol.append("kdaRatio")
    # v3.28: moneyDifference
    if ver >= (3, 28):
        team_lol.append("moneyDifference")
    # v3.30: visionScore
    if ver >= (3, 30):
        team_lol.append("visionScore")
        player_lol.append("visionScore")
    # v3.33: visionScorePerMinute
    if ver >= (3, 33):
        team_lol.append("visionScorePerMinute")
        player_lol.append("visionScorePerMinute")
    # v3.34: killsAndAssists
    if ver >= (3, 34):
        team_lol.append("killsAndAssists")
        player_lol.append("killsAndAssists")
    # v3.35: killParticipation
    if ver >= (3, 35):
        player_lol.append("killParticipation")
    # v3.36: moneyPerMinute
    if ver >= (3, 36):
        team_lol.append("moneyPerMinute")
        player_lol.append("moneyPerMinute")
    # v3.37: moneyPercentage
    if ver >= (3, 37):
        player_lol.append("moneyPercentage")
    # v3.38: baronPowerPlays
    if ver >= (3, 38):
        team_lol.append("baronPowerPlays { id }")
    # v3.40: majorMoneyLead
    if ver >= (3, 40):
        team_lol.append("majorMoneyLead")
    # v3.41: majorMoneyDeficit
    if ver >= (3, 41):
        team_lol.append("majorMoneyDeficit")
    # v3.42: forwardPercentage
    if ver >= (3, 42):
        team_lol.append("forwardPercentage")
        player_lol.append("forwardPercentage")

    return f"""
query GetSeriesState($id: ID!) {{
    seriesState(id: $id) {{
        id format started finished startedAt {' '.join(series_extra)}
        teams {{
            id name score won kills deaths
            {' '.join(series_team_extra)}
            players {{
                id name
                {' '.join(series_player_extra)}
            }}
        }}
        games {{
            id sequenceNumber started finished {' '.join(games_extra)}
            draftActions {{ id type sequenceNumber drafter {{ id type }} draftable {{ id type name }} }}
            teams {{
                id name side won kills deaths netWorth
                {' '.join(game_team_extra)}
                ... on GameTeamStateLol {{ {' '.join(team_lol)} }}
                objectives {{ {' '.join(obj_fields)} }}
                players {{
                    id name character {{ id name }} kills deaths killAssistsGiven netWorth
                    {' '.join(game_player_extra)}
                    ... on GamePlayerStateLol {{ {' '.join(player_lol)} }}
                    inventory {{ items {{ id name quantity }} }}
                    objectives {{ {' '.join(obj_fields)} }}
                }}
            }}
        }}
    }}
}}
"""

def make_request(query, variables, retry_count=0):
    try:
        response = requests.post(STATE_API_URL, headers=HEADERS,
                                json={"query": query, "variables": variables}, timeout=60)
        if response.status_code == 429:
            if retry_count < 5:
                wait = RATE_LIMIT_WAIT + retry_count * 10
                time.sleep(wait)
                return make_request(query, variables, retry_count + 1)
            return None, "Rate limit"
        if response.status_code != 200:
            return None, f"HTTP {response.status_code}"
        result = response.json()
        if "errors" in result:
            error_msg = result['errors'][0].get('message', 'Unknown')
            if "rate limit" in error_msg.lower():
                if retry_count < 5:
                    time.sleep(RATE_LIMIT_WAIT + retry_count * 10)
                    return make_request(query, variables, retry_count + 1)
            if "version" in error_msg.lower():
                return None, "version_error"
            return None, error_msg
        return result, None
    except Exception as e:
        if retry_count < 3:
            time.sleep(5)
            return make_request(query, variables, retry_count + 1)
        return None, str(e)

def detect_version(series_id):
    """使用二分查找检测版本"""
    # 先测试最高版本
    result, error = make_request(VERSION_TESTS[0][1], {"id": series_id})
    if result and result.get("data", {}).get("seriesState"):
        return VERSION_TESTS[0][0], None

    # 二分查找
    left, right = 1, len(VERSION_TESTS) - 1
    best_version = "basic"

    while left <= right:
        mid = (left + right) // 2
        version, test_query = VERSION_TESTS[mid]
        result, error = make_request(test_query, {"id": series_id})
        time.sleep(REQUEST_DELAY)

        if result:
            state = result.get("data", {}).get("seriesState")
            if state:
                best_version = version
                right = mid - 1
            else:
                return None, "no_data"
        elif error and "version" in str(error).lower():
            left = mid + 1
        elif error:
            return None, error

    return best_version, None

def process_series(series_info):
    series_id = series_info["id"]
    output_file = os.path.join(OUTPUT_DIR, f"series_{series_id}.json")

    if os.path.exists(output_file):
        return series_id, "skipped", None

    # 检测版本
    detected_ver, error = detect_version(series_id)

    if error == "no_data":
        return series_id, "no_data", None
    if error:
        return series_id, "failed", error

    time.sleep(REQUEST_DELAY)

    # 根据版本构建查询
    query = build_query(detected_ver)
    result, error = make_request(query, {"id": series_id})

    if result:
        state = result.get("data", {}).get("seriesState")
        if state:
            state["_version"] = detected_ver
            state["_downloadedAt"] = datetime.utcnow().isoformat() + "Z"

            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(state, f, ensure_ascii=False, indent=2)

            return series_id, detected_ver, len(state.get("games", []))

    return series_id, "failed", error

def log(msg):
    timestamp = datetime.now().strftime('%H:%M:%S')
    print(f"[{timestamp}] {msg}", flush=True)

def download_all_series():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # 读取series列表
    series_file = "/www/wwwroot/AI-Drafting-Assistant/data/grid_v2/series.json"
    if not os.path.exists(series_file):
        log("找不到 series.json")
        return

    with open(series_file, 'r') as f:
        all_series = json.load(f)

    log(f"共 {len(all_series)} 场比赛，使用 {MAX_WORKERS} 个并行线程")

    stats = {}
    completed = 0
    start_time = time.time()

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(process_series, s): s for s in all_series}

        for future in as_completed(futures):
            series_id, status, extra = future.result()
            completed += 1
            stats[status] = stats.get(status, 0) + 1

            if status not in ["skipped", "no_data"]:
                if status == "failed":
                    log(f"[{completed}/{len(all_series)}] {series_id}: X {extra}")
                else:
                    log(f"[{completed}/{len(all_series)}] {series_id}: OK {status} ({extra}g)")

            if completed % 50 == 0:
                elapsed = time.time() - start_time
                rate = completed / elapsed * 60
                log(f"--- {completed}/{len(all_series)} ({rate:.1f}/min) ---")

    log("")
    log("=" * 60)
    log("下载完成!")
    for k, v in sorted(stats.items()):
        log(f"  {k}: {v}")

    elapsed = time.time() - start_time
    log(f"总耗时: {elapsed/60:.1f} 分钟")

if __name__ == "__main__":
    log("=" * 60)
    log("Grid.gg 完整数据下载器 v2")
    log("使用二分法版本检测 + 动态查询构建")
    log(f"输出目录: {OUTPUT_DIR}")
    log("=" * 60)
    download_all_series()
