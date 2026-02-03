# Player Role Instance Migration Report

## Overview

This report documents the restructuring of player analysis entities from simple `player_id`
to role-aware `(player_id, team_id, role_epoch)` instances.

## Problem Statement

**Old Structure Assumption:**
- One player = One fixed role
- Role inferred from aggregate champion history across all teams/time periods
- Fails when players change roles (e.g., jungle → support)

**Example Failure Case:**
- Malrang historically played jungle (Sejuani, Xin Zhao, Vi, etc.)
- In 2025, joined NAVI as support
- Old system: Malrang plays Neeko → labeled as "jungle Neeko"
- Reality: Malrang plays Neeko as support

## Solution: Player-Role-Instance

**New Structure:**
- Analysis entity: `(player_id, team_id, role_epoch)`
- A new epoch starts when:
  1. Player changes team
  2. Player's dominant role changes for 3+ consecutive games
- Same player can have multiple instances (different roles/teams)

## Migration Statistics

| Metric | Old Structure | New Structure |
|--------|---------------|---------------|
| Total Players | 442 | 442 |
| Total Instances | 442 | 951 |
| Multi-Instance Players | 0 | 224 |
| Game Records | 33838 | 33417 |

## Players with Multiple Instances


### ON (54 instances)

- **Instance 1**: Team `356`, Role: `support`, Games: 42
- **Instance 2**: Team `52747`, Role: `jungle`, Games: 3
- **Instance 3**: Team `356`, Role: `support`, Games: 3
- **Instance 4**: Team `52747`, Role: `jungle`, Games: 4
- **Instance 5**: Team `356`, Role: `support`, Games: 3
- **Instance 6**: Team `52747`, Role: `jungle`, Games: 15
- **Instance 7**: Team `356`, Role: `support`, Games: 5
- **Instance 8**: Team `52747`, Role: `support`, Games: 4
- **Instance 9**: Team `52747`, Role: `jungle`, Games: 5
- **Instance 10**: Team `356`, Role: `support`, Games: 16
- **Instance 11**: Team `52747`, Role: `jungle`, Games: 3
- **Instance 12**: Team `356`, Role: `support`, Games: 7
- **Instance 13**: Team `52747`, Role: `mid`, Games: 2
- **Instance 14**: Team `356`, Role: `support`, Games: 2
- **Instance 15**: Team `52747`, Role: `jungle`, Games: 6
- **Instance 16**: Team `356`, Role: `support`, Games: 3
- **Instance 17**: Team `52747`, Role: `mid`, Games: 2
- **Instance 18**: Team `356`, Role: `mid`, Games: 3
- **Instance 19**: Team `356`, Role: `jungle`, Games: 4
- **Instance 20**: Team `356`, Role: `support`, Games: 4
- **Instance 21**: Team `52747`, Role: `jungle`, Games: 5
- **Instance 22**: Team `356`, Role: `support`, Games: 10
- **Instance 23**: Team `52747`, Role: `jungle`, Games: 2
- **Instance 24**: Team `356`, Role: `mid`, Games: 2
- **Instance 25**: Team `52747`, Role: `support`, Games: 3
- **Instance 26**: Team `356`, Role: `support`, Games: 3
- **Instance 27**: Team `52747`, Role: `support`, Games: 6
- **Instance 28**: Team `356`, Role: `support`, Games: 7
- **Instance 29**: Team `52747`, Role: `support`, Games: 1
- **Instance 30**: Team `52747`, Role: `jungle`, Games: 7
- **Instance 31**: Team `356`, Role: `mid`, Games: 3
- **Instance 32**: Team `52747`, Role: `jungle`, Games: 3
- **Instance 33**: Team `356`, Role: `support`, Games: 3
- **Instance 34**: Team `52747`, Role: `jungle`, Games: 3
- **Instance 35**: Team `356`, Role: `support`, Games: 13
- **Instance 36**: Team `356`, Role: `support`, Games: 5
- **Instance 37**: Team `52747`, Role: `jungle`, Games: 4
- **Instance 38**: Team `356`, Role: `support`, Games: 2
- **Instance 39**: Team `52747`, Role: `jungle`, Games: 2
- **Instance 40**: Team `356`, Role: `support`, Games: 2
- **Instance 41**: Team `356`, Role: `support`, Games: 6
- **Instance 42**: Team `52747`, Role: `jungle`, Games: 2
- **Instance 43**: Team `356`, Role: `support`, Games: 6
- **Instance 44**: Team `356`, Role: `support`, Games: 3
- **Instance 45**: Team `52747`, Role: `jungle`, Games: 3
- **Instance 46**: Team `356`, Role: `mid`, Games: 1
- **Instance 47**: Team `356`, Role: `support`, Games: 4
- **Instance 48**: Team `52747`, Role: `jungle`, Games: 2
- **Instance 49**: Team `356`, Role: `support`, Games: 3
- **Instance 50**: Team `52747`, Role: `jungle`, Games: 3
- **Instance 51**: Team `356`, Role: `mid`, Games: 1
- **Instance 52**: Team `356`, Role: `support`, Games: 3
- **Instance 53**: Team `52747`, Role: `jungle`, Games: 15
- **Instance 54**: Team `356`, Role: `support`, Games: 18

### DnDn (9 instances)

- **Instance 1**: Team `52747`, Role: `top`, Games: 1
- **Instance 2**: Team `52747`, Role: `jungle`, Games: 3
- **Instance 3**: Team `52747`, Role: `top`, Games: 15
- **Instance 4**: Team `52747`, Role: `jungle`, Games: 9
- **Instance 5**: Team `52747`, Role: `top`, Games: 11
- **Instance 6**: Team `52747`, Role: `jungle`, Games: 6
- **Instance 7**: Team `52747`, Role: `top`, Games: 3
- **Instance 8**: Team `52747`, Role: `jungle`, Games: 7
- **Instance 9**: Team `353`, Role: `top`, Games: 9

### Wei (8 instances)

- **Instance 1**: Team `47319`, Role: `jungle`, Games: 14
- **Instance 2**: Team `356`, Role: `support`, Games: 5
- **Instance 3**: Team `356`, Role: `jungle`, Games: 12
- **Instance 4**: Team `356`, Role: `support`, Games: 3
- **Instance 5**: Team `356`, Role: `jungle`, Games: 49
- **Instance 6**: Team `47472`, Role: `jungle`, Games: 8
- **Instance 7**: Team `47472`, Role: `support`, Games: 4
- **Instance 8**: Team `47472`, Role: `jungle`, Games: 37

### Razork (7 instances)

- **Instance 1**: Team `47376`, Role: `jungle`, Games: 11
- **Instance 2**: Team `47376`, Role: `support`, Games: 3
- **Instance 3**: Team `47376`, Role: `jungle`, Games: 50
- **Instance 4**: Team `47376`, Role: `support`, Games: 10
- **Instance 5**: Team `47376`, Role: `jungle`, Games: 41
- **Instance 6**: Team `47376`, Role: `support`, Games: 14
- **Instance 7**: Team `47376`, Role: `jungle`, Games: 33

### Xiaohu (7 instances)

- **Instance 1**: Team `52822`, Role: `mid`, Games: 20
- **Instance 2**: Team `52822`, Role: `bot`, Games: 5
- **Instance 3**: Team `52822`, Role: `mid`, Games: 10
- **Instance 4**: Team `52822`, Role: `bot`, Games: 16
- **Instance 5**: Team `52822`, Role: `mid`, Games: 5
- **Instance 6**: Team `52822`, Role: `bot`, Games: 4
- **Instance 7**: Team `52822`, Role: `mid`, Games: 134

### Lucid (7 instances)

- **Instance 1**: Team `48179`, Role: `jungle`, Games: 5
- **Instance 2**: Team `48179`, Role: `support`, Games: 6
- **Instance 3**: Team `48179`, Role: `jungle`, Games: 8
- **Instance 4**: Team `48179`, Role: `support`, Games: 5
- **Instance 5**: Team `48179`, Role: `jungle`, Games: 84
- **Instance 6**: Team `48179`, Role: `support`, Games: 6
- **Instance 7**: Team `48179`, Role: `jungle`, Games: 132

### ShowMaker (7 instances)

- **Instance 1**: Team `48179`, Role: `mid`, Games: 15
- **Instance 2**: Team `48179`, Role: `support`, Games: 3
- **Instance 3**: Team `48179`, Role: `mid`, Games: 6
- **Instance 4**: Team `48179`, Role: `support`, Games: 10
- **Instance 5**: Team `48179`, Role: `mid`, Games: 24
- **Instance 6**: Team `48179`, Role: `jungle`, Games: 28
- **Instance 7**: Team `48179`, Role: `mid`, Games: 160

### BuLLDoG (7 instances)

- **Instance 1**: Team `3483`, Role: `mid`, Games: 50
- **Instance 2**: Team `3483`, Role: `bot`, Games: 3
- **Instance 3**: Team `3483`, Role: `mid`, Games: 19
- **Instance 4**: Team `3483`, Role: `bot`, Games: 6
- **Instance 5**: Team `3483`, Role: `mid`, Games: 7
- **Instance 6**: Team `3483`, Role: `bot`, Games: 3
- **Instance 7**: Team `3483`, Role: `mid`, Games: 76

### Scout (6 instances)

- **Instance 1**: Team `52726`, Role: `jungle`, Games: 7
- **Instance 2**: Team `52726`, Role: `mid`, Games: 17
- **Instance 3**: Team `52726`, Role: `bot`, Games: 3
- **Instance 4**: Team `52726`, Role: `mid`, Games: 17
- **Instance 5**: Team `52796`, Role: `top`, Games: 2
- **Instance 6**: Team `52796`, Role: `mid`, Games: 136

### Meiko (6 instances)

- **Instance 1**: Team `375`, Role: `support`, Games: 16
- **Instance 2**: Team `375`, Role: `top`, Games: 3
- **Instance 3**: Team `375`, Role: `support`, Games: 14
- **Instance 4**: Team `375`, Role: `jungle`, Games: 3
- **Instance 5**: Team `375`, Role: `support`, Games: 13
- **Instance 6**: Team `47472`, Role: `support`, Games: 132

### Canyon (6 instances)

- **Instance 1**: Team `47558`, Role: `support`, Games: 52
- **Instance 2**: Team `47558`, Role: `jungle`, Games: 5
- **Instance 3**: Team `47558`, Role: `support`, Games: 5
- **Instance 4**: Team `47558`, Role: `jungle`, Games: 12
- **Instance 5**: Team `47558`, Role: `support`, Games: 6
- **Instance 6**: Team `47558`, Role: `jungle`, Games: 143

### Yike (6 instances)

- **Instance 1**: Team `47380`, Role: `jungle`, Games: 31
- **Instance 2**: Team `47380`, Role: `top`, Games: 18
- **Instance 3**: Team `47380`, Role: `support`, Games: 18
- **Instance 4**: Team `47380`, Role: `jungle`, Games: 14
- **Instance 5**: Team `47380`, Role: `support`, Games: 7
- **Instance 6**: Team `53165`, Role: `jungle`, Games: 88

### Clozer (6 instances)

- **Instance 1**: Team `4035`, Role: `mid`, Games: 25
- **Instance 2**: Team `4035`, Role: `jungle`, Games: 12
- **Instance 3**: Team `4035`, Role: `mid`, Games: 3
- **Instance 4**: Team `4035`, Role: `jungle`, Games: 21
- **Instance 5**: Team `4035`, Role: `mid`, Games: 29
- **Instance 6**: Team `52817`, Role: `mid`, Games: 101

### Sheo (6 instances)

- **Instance 1**: Team `52661`, Role: `jungle`, Games: 35
- **Instance 2**: Team `52661`, Role: `top`, Games: 9
- **Instance 3**: Team `52661`, Role: `jungle`, Games: 37
- **Instance 4**: Team `47435`, Role: `jungle`, Games: 9
- **Instance 5**: Team `47435`, Role: `support`, Games: 3
- **Instance 6**: Team `47435`, Role: `jungle`, Games: 42

### Aki (6 instances)

- **Instance 1**: Team `52905`, Role: `jungle`, Games: 25
- **Instance 2**: Team `52905`, Role: `support`, Games: 17
- **Instance 3**: Team `52905`, Role: `jungle`, Games: 41
- **Instance 4**: Team `52905`, Role: `support`, Games: 3
- **Instance 5**: Team `52905`, Role: `jungle`, Games: 20
- **Instance 6**: Team `52606`, Role: `jungle`, Games: 25

### Sylvie (6 instances)

- **Instance 1**: Team `52747`, Role: `top`, Games: 12
- **Instance 2**: Team `52747`, Role: `jungle`, Games: 11
- **Instance 3**: Team `52747`, Role: `support`, Games: 6
- **Instance 4**: Team `52747`, Role: `jungle`, Games: 4
- **Instance 5**: Team `52747`, Role: `support`, Games: 13
- **Instance 6**: Team `52747`, Role: `jungle`, Games: 38

### Yuekai (6 instances)

- **Instance 1**: Team `3113`, Role: `bot`, Games: 5
- **Instance 2**: Team `3113`, Role: `mid`, Games: 8
- **Instance 3**: Team `3113`, Role: `bot`, Games: 3
- **Instance 4**: Team `3113`, Role: `mid`, Games: 6
- **Instance 5**: Team `3113`, Role: `bot`, Games: 4
- **Instance 6**: Team `3113`, Role: `mid`, Games: 9

### Zhuo (5 instances)

- **Instance 1**: Team `52905`, Role: `top`, Games: 6
- **Instance 2**: Team `52905`, Role: `support`, Games: 52
- **Instance 3**: Team `52726`, Role: `mid`, Games: 1
- **Instance 4**: Team `52726`, Role: `support`, Games: 38
- **Instance 5**: Team `52796`, Role: `support`, Games: 44

### Chovy (5 instances)

- **Instance 1**: Team `47558`, Role: `mid`, Games: 74
- **Instance 2**: Team `47558`, Role: `bot`, Games: 7
- **Instance 3**: Team `47558`, Role: `mid`, Games: 6
- **Instance 4**: Team `47558`, Role: `bot`, Games: 11
- **Instance 5**: Team `47558`, Role: `mid`, Games: 125

### Cuzz (5 instances)

- **Instance 1**: Team `3483`, Role: `jungle`, Games: 44
- **Instance 2**: Team `3483`, Role: `support`, Games: 4
- **Instance 3**: Team `3483`, Role: `jungle`, Games: 41
- **Instance 4**: Team `407`, Role: `support`, Games: 2
- **Instance 5**: Team `407`, Role: `jungle`, Games: 112


## Case Study: Malrang

**Player ID:** 25214
**Total Games:** 37
**Instances:** 2

### Epoch Breakdown:

| Epoch 1 | Team: `106` | Role: `support` | Games: 29 |
| Epoch 2 | Team: `55749` | Role: `support` | Games: 8 |

### Impact:

- **Before:** All Malrang games labeled with single inferred role (jungle)
- **After:** Games correctly attributed to role-specific instances
- **Result:** Neeko game now attributed to support instance, not jungle


## Affected Downstream Modules

| Module | Impact |
|--------|--------|
| **Role Posterior** | More accurate role distributions per champion |
| **Player Pool** | Role-specific champion pools per player instance |
| **Ban Attribution** | Correct role context for ban analysis |
| **Flex Detection** | Reduced false positives from role-switching players |

## Technical Notes

- Epoch detection uses sliding window of 3 games
- Team change always triggers new epoch
- Role change requires 3+ consecutive games with different dominant role
- Original player_id preserved for backward compatibility

## Files Generated

1. `player_role_instances.json` - Instance metadata and epoch definitions
2. `instance_game_records.json` - Game records with instance attribution
3. `player_role_instance_report.md` - This report

---
*Generated: 2026-01-31 15:36:52 UTC*
