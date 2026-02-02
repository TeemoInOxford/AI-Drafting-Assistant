"""
Hero Role and Tag Database
===========================
Defines hero roles and characteristics for feature engineering
"""

HERO_ROLES = {
    # Top Lane - Tanks
    "Sion": {"role": "tank", "tags": ["tank", "engage", "cc"]},
    "Ornn": {"role": "tank", "tags": ["tank", "engage", "cc"]},
    "K'Sante": {"role": "tank", "tags": ["tank", "engage", "cc"]},
    "Maokai": {"role": "tank", "tags": ["tank", "engage", "cc"]},
    "Poppy": {"role": "tank", "tags": ["tank", "engage", "cc"]},
    "Shen": {"role": "tank", "tags": ["tank", "support", "cc"]},

    # Top Lane - Fighters
    "Aatrox": {"role": "fighter", "tags": ["fighter", "sustain", "damage"]},
    "Gwen": {"role": "fighter", "tags": ["fighter", "damage", "sustain"]},
    "Jax": {"role": "fighter", "tags": ["fighter", "damage", "split_push"]},
    "Rumble": {"role": "fighter", "tags": ["fighter", "damage", "aoe"]},
    "Gnar": {"role": "fighter", "tags": ["fighter", "engage", "cc"]},
    "Renekton": {"role": "fighter", "tags": ["fighter", "damage", "engage"]},
    "Ambessa": {"role": "fighter", "tags": ["fighter", "damage", "mobility"]},
    "Urgot": {"role": "fighter", "tags": ["fighter", "damage", "tank"]},
    "Yorick": {"role": "fighter", "tags": ["fighter", "split_push", "damage"]},
    "Kled": {"role": "fighter", "tags": ["fighter", "engage", "damage"]},

    # Jungle - Tanks
    "Sejuani": {"role": "tank", "tags": ["tank", "engage", "cc"]},
    "Trundle": {"role": "tank", "tags": ["tank", "sustain", "cc"]},
    "Volibear": {"role": "tank", "tags": ["tank", "engage", "damage"]},
    "Skarner": {"role": "tank", "tags": ["tank", "engage", "cc"]},
    "Rek'Sai": {"role": "fighter", "tags": ["fighter", "engage", "damage"]},

    # Jungle - Fighters
    "Jarvan IV": {"role": "fighter", "tags": ["fighter", "engage", "cc"]},
    "Xin Zhao": {"role": "fighter", "tags": ["fighter", "damage", "engage"]},
    "Vi": {"role": "fighter", "tags": ["fighter", "engage", "cc"]},
    "Wukong": {"role": "fighter", "tags": ["fighter", "engage", "damage"]},
    "Lee Sin": {"role": "fighter", "tags": ["fighter", "mobility", "engage"]},
    "Viego": {"role": "fighter", "tags": ["fighter", "damage", "sustain"]},
    "Nocturne": {"role": "assassin", "tags": ["assassin", "damage", "engage"]},
    "Pantheon": {"role": "fighter", "tags": ["fighter", "engage", "damage"]},
    "Peanut": {"role": "fighter", "tags": ["fighter", "damage", "mobility"]},

    # Mid Lane - Mages
    "Azir": {"role": "mage", "tags": ["mage", "damage", "control"]},
    "Orianna": {"role": "mage", "tags": ["mage", "damage", "cc", "control"]},
    "Ryze": {"role": "mage", "tags": ["mage", "damage", "mobility"]},
    "Taliyah": {"role": "mage", "tags": ["mage", "damage", "control"]},
    "Cassiopeia": {"role": "mage", "tags": ["mage", "damage", "cc"]},
    "Viktor": {"role": "mage", "tags": ["mage", "damage", "control"]},
    "Galio": {"role": "mage", "tags": ["mage", "tank", "engage", "cc"]},
    "Neeko": {"role": "mage", "tags": ["mage", "cc", "engage"]},
    "Aurora": {"role": "mage", "tags": ["mage", "damage", "mobility"]},

    # Mid Lane - Assassins
    "Akali": {"role": "assassin", "tags": ["assassin", "damage", "mobility"]},
    "Sylas": {"role": "assassin", "tags": ["assassin", "damage", "sustain"]},
    "Yone": {"role": "assassin", "tags": ["assassin", "damage", "mobility"]},

    # ADC
    "Kai'Sa": {"role": "adc", "tags": ["adc", "damage", "mobility"]},
    "Sivir": {"role": "adc", "tags": ["adc", "damage", "utility"]},
    "Ezreal": {"role": "adc", "tags": ["adc", "damage", "mobility"]},
    "Corki": {"role": "adc", "tags": ["adc", "damage", "poke"]},
    "Xayah": {"role": "adc", "tags": ["adc", "damage", "self_peel"]},
    "Jhin": {"role": "adc", "tags": ["adc", "damage", "utility"]},
    "Lucian": {"role": "adc", "tags": ["adc", "damage", "mobility"]},
    "Caitlyn": {"role": "adc", "tags": ["adc", "damage", "range"]},
    "Zeri": {"role": "adc", "tags": ["adc", "damage", "mobility"]},
    "Yunara": {"role": "adc", "tags": ["adc", "damage", "utility"]},
    "Smolder": {"role": "adc", "tags": ["adc", "damage", "scaling"]},
    "Varus": {"role": "adc", "tags": ["adc", "damage", "poke", "cc"]},
    "Senna": {"role": "adc", "tags": ["adc", "damage", "support", "utility"]},
    "Ziggs": {"role": "mage", "tags": ["mage", "damage", "poke"]},

    # Support - Engage
    "Alistar": {"role": "support", "tags": ["support", "tank", "engage", "cc"]},
    "Leona": {"role": "support", "tags": ["support", "tank", "engage", "cc"]},
    "Rakan": {"role": "support", "tags": ["support", "engage", "cc", "mobility"]},
    "Nautilus": {"role": "support", "tags": ["support", "tank", "engage", "cc"]},
    "Rell": {"role": "support", "tags": ["support", "tank", "engage", "cc"]},
    "Blitzcrank": {"role": "support", "tags": ["support", "engage", "cc"]},
    "Pyke": {"role": "support", "tags": ["support", "assassin", "engage", "cc"]},

    # Support - Enchanters
    "Bard": {"role": "support", "tags": ["support", "utility", "cc"]},
    "Karma": {"role": "support", "tags": ["support", "utility", "poke"]},
    "Lulu": {"role": "support", "tags": ["support", "utility", "peel"]},
    "Braum": {"role": "support", "tags": ["support", "tank", "peel", "cc"]},
    "Renata Glasc": {"role": "support", "tags": ["support", "utility", "cc"]},

    # Special
    "Annie": {"role": "mage", "tags": ["mage", "damage", "cc", "burst"]},
}

def get_hero_role(hero_name: str) -> str:
    """Get hero primary role"""
    return HERO_ROLES.get(hero_name, {}).get("role", "unknown")

def get_hero_tags(hero_name: str) -> list:
    """Get hero tags"""
    return HERO_ROLES.get(hero_name, {}).get("tags", [])

def has_tag(hero_name: str, tag: str) -> bool:
    """Check if hero has specific tag"""
    return tag in get_hero_tags(hero_name)

def count_role_in_team(team_heroes: list, role: str) -> int:
    """Count how many heroes of a specific role in team"""
    return sum(1 for hero in team_heroes if get_hero_role(hero) == role)

def count_tag_in_team(team_heroes: list, tag: str) -> int:
    """Count how many heroes with specific tag in team"""
    return sum(1 for hero in team_heroes if has_tag(hero, tag))
