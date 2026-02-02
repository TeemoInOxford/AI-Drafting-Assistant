// Champion class/role types
export type ChampionClass = 'Tank' | 'Fighter' | 'Assassin' | 'Mage' | 'Marksman' | 'Support' | 'Controller';

// Opponent type (from game theory)
export type OpponentType = 'aggressive' | 'defensive' | 'meta_follower' | 'counter_focused' | 'flex_master' | 'unknown';

// Opponent model for PTS calculation
export interface OpponentModel {
  predictedType: OpponentType;
  confidence: number;           // 0-1
  observedPicks: Champion[];    // 对手已选的英雄
}

// Champion data type
export interface Champion {
  id: string;           // e.g. "Aatrox"
  key: string;          // e.g. "266"
  name: string;         // Display name
  image: string;        // Avatar URL
  positions: Position[]; // Positions
  tags: ChampionClass[]; // Champion classes/roles
}

// Position type
export type Position = 'top' | 'jungle' | 'mid' | 'bot' | 'support';

// Position info
export interface PositionInfo {
  id: Position;
  name: string;
  icon: string;
}

// Team type
export type Team = 'blue' | 'red';

// Action type
export type ActionType = 'ban' | 'pick';

// Ban reason type
export type BanReason = 'manual' | 'fearless' | 'pts';

// Ban entry with reason
export interface BanEntry {
  champion: Champion | null;
  reason?: BanReason;
}

// BP step definition
export interface BPStep {
  team: Team;
  action: ActionType;
  index: number;        // Index for this team's action (0-4)
}

// BP state
export interface BPState {
  currentStep: number;  // Current step index (0-19)
  blueBans: BanEntry[];    // Blue bans (5)
  redBans: BanEntry[];     // Red bans (5)
  bluePicks: (Champion | null)[];   // Blue picks (5)
  redPicks: (Champion | null)[];    // Red picks (5)
  usedChampions: Set<string>;       // Used champion IDs
  history: BPHistoryEntry[];        // Action history (for undo)
}

// History entry
export interface BPHistoryEntry {
  step: number;
  championId: string;
  team: Team;
  action: ActionType;
}

// AI control mode - coach-centric design
export type AIControlMode = 'manual' | 'assistant';

// AI mode state
export interface AIState {
  mode: AIControlMode;
  isThinking: boolean;
  lastRecommendation: AIRecommendation | null;
  autoPlay: boolean; // Auto-execute AI choices
  thinkingDelay: number; // AI thinking delay (ms)
}

// AI recommendation result
export interface AIRecommendation {
  champion: string;
  score: number;
  reason: string;
  winRate?: number;
  pts?: number; // Pick Threat Score
  riskTier?: 'critical' | 'high' | 'moderate' | 'low';
}

// AI full analysis result
export interface AIAnalysis {
  recommendations: AIRecommendation[];
  currentWinRate: number; // Current composition predicted win rate
  warnings: AIWarning[];
  insights: string[];
}

// AI warning
export interface AIWarning {
  type: 'danger' | 'warning' | 'info';
  message: string;
}

// DDragon API response type
export interface DDragonChampionData {
  type: string;
  format: string;
  version: string;
  data: Record<string, {
    id: string;
    key: string;
    name: string;
    title: string;
    image: {
      full: string;
    };
    tags: string[];
  }>;
}

// Fearless Draft related types
export type SeriesFormat = 'bo1' | 'bo3' | 'bo5';

// Single game record
export interface GameRecord {
  gameNumber: number;
  bluePicks: string[];  // Blue picks champion IDs
  redPicks: string[];   // Red picks champion IDs
}

// Series state
export interface SeriesState {
  format: SeriesFormat;
  currentGame: number;
  gameRecords: GameRecord[];  // Previous game records
  fearlessPool: Set<string>;  // All used champions (cannot be picked again)
}

// History select mode
export type HistorySelectMode = 'off' | 'blue' | 'red';

// Pro Player from hierarchy data
export interface ProPlayer {
  id: string;
  name: string;
  teamId?: string;
  teamName?: string;
  seriesCount?: number;
}

// Team Roster - 5 players per team
export interface TeamRoster {
  teamName: string;
  teamLogo?: string | null;
  players: (ProPlayer | null)[]; // 5 positions: top, jungle, mid, bot, support
}

// Match Roster State - both teams
export interface MatchRosterState {
  enabled: boolean;
  blueTeam: TeamRoster;
  redTeam: TeamRoster;
}

// ============ Pick Threat Score (PTS) System ============

// Draft state for PTS calculation
export interface DraftState {
  side: Team;
  currentStep: BPStep;
  bluePicks: (Champion | null)[];
  redPicks: (Champion | null)[];
  blueBans: (Champion | null)[];
  redBans: (Champion | null)[];
  blueRemainingRoles: Position[];
  redRemainingRoles: Position[];
}

// Pick likelihood signals
export interface PickLikelihoodSignals {
  opponentRoleVacancy: number;      // 0-1: Does opponent need this role?
  playerChampionPoolFreq: number;   // 0-1: How often does opponent player pick this?
  globalMetaPresence: number;       // 0-1: How meta is this champion?
  synergyBanSignal: number;         // 0-1: Did they ban synergies?
  championPoolStrength?: number;    // 0-1: Opponent's proficiency with this champion (from Game Theory)
}

// Loss severity categories
export type LossSeverityCategory = 'role_collapse' | 'composition_lock' | 'strategic_denial';

export interface LossSeverityBreakdown {
  roleCollapse: number;       // 0-1: Losing this forces suboptimal role fill
  compositionLock: number;    // 0-1: Losing this locks us into predictable comp
  strategicDenial: number;    // 0-1: Opponent denies our win condition
  total: number;              // 0-1: Combined severity
  primaryCategory: LossSeverityCategory;
}

// Pick Threat Score result
export interface PTSResult {
  championId: string;
  championName: string;
  pts: number;                // 0-100: Final PTS score (内部使用，不显示给用户)
  pickLikelihood: number;     // 0-1: Probability opponent picks this
  lossSeverity: number;       // 0-1: How bad if we lose it
  riskTier: 'critical' | 'high' | 'moderate' | 'low';

  // 新增：用户友好的等级显示
  threatLevel?: '高' | '中' | '低';        // Ban阶段：威胁程度
  recommendLevel?: '高' | '中' | '低';     // Pick阶段：推荐度

  explanation: string;        // Natural language explanation
  detailedReason?: string;    // 详细推荐理由（指标来源）

  signals: PickLikelihoodSignals;
  severityBreakdown: LossSeverityBreakdown;
  isFlex?: boolean;           // Whether this is a flex pick
  roleDistribution?: { role: Position; probability: number }[]; // Role probabilities for flex picks
}

// PTS configuration (heuristic weights - can be learned later)
export interface PTSConfig {
  // PickLikelihood weights
  roleVacancyWeight: number;
  championPoolWeight: number;
  metaPresenceWeight: number;
  synergyBanWeight: number;

  // LossSeverity weights
  roleCollapseWeight: number;
  compositionLockWeight: number;
  strategicDenialWeight: number;

  // Risk tier thresholds
  criticalThreshold: number;  // PTS >= this is critical
  highThreshold: number;      // PTS >= this is high risk
  moderateThreshold: number;  // PTS >= this is moderate risk
}
