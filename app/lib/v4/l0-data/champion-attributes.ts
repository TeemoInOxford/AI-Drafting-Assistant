/**
 * v4-1 L0 Champion Attributes
 *
 * Provides detailed champion attributes for accurate composition evaluation.
 * This replaces position-based heuristics with actual champion data.
 */

/**
 * Champion damage type
 */
export type DamageType = 'physical' | 'magic' | 'mixed' | 'true';

/**
 * Champion range type
 */
export type RangeType = 'melee' | 'ranged' | 'variable';

/**
 * Champion attributes for composition analysis
 */
export interface ChampionAttributes {
  championId: string;

  // Damage profile (0-1 scale)
  primaryDamageType: DamageType;
  physicalDamageRatio: number;  // 0-1: Proportion of physical damage
  magicDamageRatio: number;     // 0-1: Proportion of magic damage
  trueDamageRatio: number;      // 0-1: Proportion of true damage

  // Range profile
  rangeType: RangeType;
  effectiveRange: number;       // 0-1: 0=melee, 1=long range

  // Tankiness (0-1 scale)
  tankiness: number;            // Overall durability
  frontlineCapability: number;  // Ability to be frontline

  // Engage/Disengage (0-1 scale)
  engagePotential: number;      // Ability to initiate fights
  disengagePotential: number;   // Ability to escape/peel

  // Utility
  crowdControl: number;         // 0-1: CC capability
  mobility: number;             // 0-1: Movement capability

  // Confidence in these attributes
  confidence: number;           // 0-1: Data quality
}

/**
 * Default attributes for unknown champions
 */
export const DEFAULT_ATTRIBUTES: Omit<ChampionAttributes, 'championId'> = {
  primaryDamageType: 'mixed',
  physicalDamageRatio: 0.5,
  magicDamageRatio: 0.5,
  trueDamageRatio: 0,
  rangeType: 'melee',
  effectiveRange: 0.3,
  tankiness: 0.5,
  frontlineCapability: 0.5,
  engagePotential: 0.5,
  disengagePotential: 0.5,
  crowdControl: 0.5,
  mobility: 0.5,
  confidence: 0.3,
};

/**
 * Champion attributes database
 *
 * NOTE: This is a starter set. In production, this should be:
 * 1. Loaded from a JSON file
 * 2. Generated from game data analysis
 * 3. Updated regularly with patch changes
 */
export const CHAMPION_ATTRIBUTES_DB: Map<string, ChampionAttributes> = new Map([
  // Top laners - Tanks
  ['Ornn', {
    championId: 'Ornn',
    primaryDamageType: 'mixed',
    physicalDamageRatio: 0.4,
    magicDamageRatio: 0.6,
    trueDamageRatio: 0,
    rangeType: 'melee',
    effectiveRange: 0.2,
    tankiness: 0.95,
    frontlineCapability: 0.95,
    engagePotential: 0.9,
    disengagePotential: 0.3,
    crowdControl: 0.9,
    mobility: 0.4,
    confidence: 0.9,
  }],

  ['Malphite', {
    championId: 'Malphite',
    primaryDamageType: 'magic',
    physicalDamageRatio: 0.2,
    magicDamageRatio: 0.8,
    trueDamageRatio: 0,
    rangeType: 'melee',
    effectiveRange: 0.3,
    tankiness: 0.9,
    frontlineCapability: 0.9,
    engagePotential: 0.95,
    disengagePotential: 0.2,
    crowdControl: 0.8,
    mobility: 0.5,
    confidence: 0.9,
  }],

  // Top laners - Fighters
  ['Aatrox', {
    championId: 'Aatrox',
    primaryDamageType: 'physical',
    physicalDamageRatio: 0.9,
    magicDamageRatio: 0.1,
    trueDamageRatio: 0,
    rangeType: 'melee',
    effectiveRange: 0.4,
    tankiness: 0.7,
    frontlineCapability: 0.7,
    engagePotential: 0.6,
    disengagePotential: 0.5,
    crowdControl: 0.7,
    mobility: 0.6,
    confidence: 0.9,
  }],

  // Top laners - AP
  ['Rumble', {
    championId: 'Rumble',
    primaryDamageType: 'magic',
    physicalDamageRatio: 0.1,
    magicDamageRatio: 0.9,
    trueDamageRatio: 0,
    rangeType: 'melee',
    effectiveRange: 0.3,
    tankiness: 0.5,
    frontlineCapability: 0.6,
    engagePotential: 0.4,
    disengagePotential: 0.3,
    crowdControl: 0.5,
    mobility: 0.5,
    confidence: 0.9,
  }],

  ['Kennen', {
    championId: 'Kennen',
    primaryDamageType: 'magic',
    physicalDamageRatio: 0.1,
    magicDamageRatio: 0.9,
    trueDamageRatio: 0,
    rangeType: 'ranged',
    effectiveRange: 0.6,
    tankiness: 0.3,
    frontlineCapability: 0.4,
    engagePotential: 0.8,
    disengagePotential: 0.6,
    crowdControl: 0.9,
    mobility: 0.8,
    confidence: 0.9,
  }],

  // Mid laners - Mages
  ['Orianna', {
    championId: 'Orianna',
    primaryDamageType: 'magic',
    physicalDamageRatio: 0.05,
    magicDamageRatio: 0.95,
    trueDamageRatio: 0,
    rangeType: 'ranged',
    effectiveRange: 0.7,
    tankiness: 0.3,
    frontlineCapability: 0.2,
    engagePotential: 0.5,
    disengagePotential: 0.7,
    crowdControl: 0.8,
    mobility: 0.4,
    confidence: 0.9,
  }],

  ['Syndra', {
    championId: 'Syndra',
    primaryDamageType: 'magic',
    physicalDamageRatio: 0.05,
    magicDamageRatio: 0.95,
    trueDamageRatio: 0,
    rangeType: 'ranged',
    effectiveRange: 0.8,
    tankiness: 0.2,
    frontlineCapability: 0.1,
    engagePotential: 0.3,
    disengagePotential: 0.6,
    crowdControl: 0.7,
    mobility: 0.3,
    confidence: 0.9,
  }],

  // Mid laners - AD Assassins
  ['Zed', {
    championId: 'Zed',
    primaryDamageType: 'physical',
    physicalDamageRatio: 0.95,
    magicDamageRatio: 0.05,
    trueDamageRatio: 0,
    rangeType: 'melee',
    effectiveRange: 0.5,
    tankiness: 0.3,
    frontlineCapability: 0.2,
    engagePotential: 0.7,
    disengagePotential: 0.8,
    crowdControl: 0.3,
    mobility: 0.9,
    confidence: 0.9,
  }],

  ['Talon', {
    championId: 'Talon',
    primaryDamageType: 'physical',
    physicalDamageRatio: 0.95,
    magicDamageRatio: 0.05,
    trueDamageRatio: 0,
    rangeType: 'melee',
    effectiveRange: 0.4,
    tankiness: 0.3,
    frontlineCapability: 0.2,
    engagePotential: 0.8,
    disengagePotential: 0.7,
    crowdControl: 0.4,
    mobility: 0.9,
    confidence: 0.9,
  }],

  // ADCs
  ['Jinx', {
    championId: 'Jinx',
    primaryDamageType: 'physical',
    physicalDamageRatio: 0.95,
    magicDamageRatio: 0.05,
    trueDamageRatio: 0,
    rangeType: 'ranged',
    effectiveRange: 0.9,
    tankiness: 0.2,
    frontlineCapability: 0.1,
    engagePotential: 0.2,
    disengagePotential: 0.4,
    crowdControl: 0.5,
    mobility: 0.3,
    confidence: 0.9,
  }],

  ['Kai\'Sa', {
    championId: 'Kai\'Sa',
    primaryDamageType: 'mixed',
    physicalDamageRatio: 0.6,
    magicDamageRatio: 0.4,
    trueDamageRatio: 0,
    rangeType: 'ranged',
    effectiveRange: 0.6,
    tankiness: 0.3,
    frontlineCapability: 0.2,
    engagePotential: 0.4,
    disengagePotential: 0.7,
    crowdControl: 0.2,
    mobility: 0.8,
    confidence: 0.9,
  }],

  // Supports - Engage
  ['Leona', {
    championId: 'Leona',
    primaryDamageType: 'magic',
    physicalDamageRatio: 0.2,
    magicDamageRatio: 0.8,
    trueDamageRatio: 0,
    rangeType: 'melee',
    effectiveRange: 0.3,
    tankiness: 0.9,
    frontlineCapability: 0.85,
    engagePotential: 0.95,
    disengagePotential: 0.2,
    crowdControl: 0.95,
    mobility: 0.5,
    confidence: 0.9,
  }],

  ['Nautilus', {
    championId: 'Nautilus',
    primaryDamageType: 'magic',
    physicalDamageRatio: 0.2,
    magicDamageRatio: 0.8,
    trueDamageRatio: 0,
    rangeType: 'melee',
    effectiveRange: 0.4,
    tankiness: 0.9,
    frontlineCapability: 0.9,
    engagePotential: 0.9,
    disengagePotential: 0.3,
    crowdControl: 0.95,
    mobility: 0.4,
    confidence: 0.9,
  }],

  // Supports - Enchanters
  ['Lulu', {
    championId: 'Lulu',
    primaryDamageType: 'magic',
    physicalDamageRatio: 0.05,
    magicDamageRatio: 0.95,
    trueDamageRatio: 0,
    rangeType: 'ranged',
    effectiveRange: 0.7,
    tankiness: 0.2,
    frontlineCapability: 0.1,
    engagePotential: 0.2,
    disengagePotential: 0.9,
    crowdControl: 0.7,
    mobility: 0.4,
    confidence: 0.9,
  }],

  ['Janna', {
    championId: 'Janna',
    primaryDamageType: 'magic',
    physicalDamageRatio: 0.05,
    magicDamageRatio: 0.95,
    trueDamageRatio: 0,
    rangeType: 'ranged',
    effectiveRange: 0.7,
    tankiness: 0.2,
    frontlineCapability: 0.1,
    engagePotential: 0.1,
    disengagePotential: 0.95,
    crowdControl: 0.8,
    mobility: 0.5,
    confidence: 0.9,
  }],

  // Junglers - Tanks
  ['Sejuani', {
    championId: 'Sejuani',
    primaryDamageType: 'magic',
    physicalDamageRatio: 0.3,
    magicDamageRatio: 0.7,
    trueDamageRatio: 0,
    rangeType: 'melee',
    effectiveRange: 0.3,
    tankiness: 0.9,
    frontlineCapability: 0.9,
    engagePotential: 0.9,
    disengagePotential: 0.3,
    crowdControl: 0.95,
    mobility: 0.6,
    confidence: 0.9,
  }],

  // Junglers - Assassins
  ['Kha\'Zix', {
    championId: 'Kha\'Zix',
    primaryDamageType: 'physical',
    physicalDamageRatio: 0.95,
    magicDamageRatio: 0.05,
    trueDamageRatio: 0,
    rangeType: 'melee',
    effectiveRange: 0.4,
    tankiness: 0.3,
    frontlineCapability: 0.2,
    engagePotential: 0.6,
    disengagePotential: 0.7,
    crowdControl: 0.3,
    mobility: 0.9,
    confidence: 0.9,
  }],
]);

/**
 * Get champion attributes
 * Returns default attributes if champion not found
 */
export function getChampionAttributes(championId: string): ChampionAttributes {
  const attributes = CHAMPION_ATTRIBUTES_DB.get(championId);

  if (attributes) {
    return attributes;
  }

  // Return default attributes with low confidence
  return {
    championId,
    ...DEFAULT_ATTRIBUTES,
  };
}

/**
 * Check if champion has high-quality attribute data
 */
export function hasHighQualityAttributes(championId: string): boolean {
  const attributes = CHAMPION_ATTRIBUTES_DB.get(championId);
  return attributes !== undefined && attributes.confidence >= 0.7;
}

/**
 * Get all champions with attribute data
 */
export function getChampionsWithAttributes(): string[] {
  return Array.from(CHAMPION_ATTRIBUTES_DB.keys());
}

/**
 * Calculate team average for an attribute
 */
export function calculateTeamAverage(
  championIds: string[],
  attributeGetter: (attr: ChampionAttributes) => number
): { value: number; confidence: number } {
  if (championIds.length === 0) {
    return { value: 0.5, confidence: 0 };
  }

  let totalValue = 0;
  let totalConfidence = 0;

  for (const championId of championIds) {
    const attributes = getChampionAttributes(championId);
    totalValue += attributeGetter(attributes);
    totalConfidence += attributes.confidence;
  }

  return {
    value: totalValue / championIds.length,
    confidence: totalConfidence / championIds.length,
  };
}
