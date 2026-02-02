/**
 * Mock AI 推荐数据
 * 用于演示和开发
 */

import {
  ChampionRecommendation,
  GameSignal,
  AIHintPanelProps,
} from '@/app/types/ai-hint.types';

export const mockRecommendations: ChampionRecommendation[] = [
  {
    championId: 'Graves',
    championName: 'Graves',
    championImage: '/champions/Graves.png',
    score: 0.78,
    scoreRange: { low: 0.68, high: 0.88 },
    tier: 'Strong',
    confidence: 0.82,
    confidenceLevel: 'High',
    whyPick: [
      {
        text: 'Fills critical jungle gap',
        importance: 5,
        dataSupport: 'Role vacancy: High',
      },
      {
        text: 'Flex pick option (Jungle/Top)',
        importance: 4,
        dataSupport: 'Flex value: 0.72',
      },
    ],
    whyNot: [
      {
        text: 'Requires team follow-up',
        importance: 2,
      },
    ],
    uncertainties: [
      {
        type: 'HighVariance',
        severity: 'medium',
        message: 'Win rate varies across patches',
        detail: 'Performance may differ from historical data',
      },
    ],
    phaseScores: {
      early: 0.85,
      mid: 0.72,
      late: 0.58,
      current: 'early',
    },
  },
  {
    championId: 'Sejuani',
    championName: 'Sejuani',
    championImage: '/champions/Sejuani.png',
    score: 0.64,
    tier: 'Stable',
    confidence: 0.75,
    confidenceLevel: 'High',
    whyPick: [
      {
        text: 'Safe tank option',
        importance: 4,
        dataSupport: 'Win rate: 51.2%',
      },
      {
        text: 'Good engage potential',
        importance: 3,
      },
    ],
    uncertainties: [],
    phaseScores: {
      early: 0.62,
      mid: 0.68,
      late: 0.72,
      current: 'early',
    },
  },
  {
    championId: 'Kindred',
    championName: 'Kindred',
    championImage: '/champions/Kindred.png',
    score: 0.58,
    scoreRange: { low: 0.38, high: 0.78 },
    tier: 'Situational',
    confidence: 0.52,
    confidenceLevel: 'Medium',
    whyPick: [
      {
        text: 'Counter to Lee Sin',
        importance: 3,
        dataSupport: '+8% WR vs Lee Sin',
      },
    ],
    whyNot: [
      {
        text: 'Execution-dependent champion',
        importance: 3,
      },
    ],
    uncertainties: [
      {
        type: 'LowConfidence',
        severity: 'high',
        message: 'System confidence: 52% (Below optimal)',
        detail: 'Limited sample size (23 games)',
      },
      {
        type: 'InsufficientData',
        severity: 'medium',
        message: 'Small sample size',
        detail: 'Only 23 games in dataset',
      },
    ],
    phaseScores: {
      early: 0.58,
      mid: 0.62,
      late: 0.55,
      current: 'early',
    },
  },
];

export const mockGameSignal: GameSignal = {
  enabled: true,
  confidence: 0.68,
  opponentResponses: [
    { championName: 'Lee Sin', probability: 0.32 },
    { championName: 'Aatrox', probability: 0.28 },
    { championName: 'Gnar', probability: 0.22 },
    { championName: 'Others', probability: 0.18 },
  ],
  riskLevel: 'medium',
  riskMessage: 'If Lee Sin picked (32% chance): Soft counter matchup (-8% WR)',
  timingAdvice: {
    pickNow: true,
    reason: 'If we delay, 32% chance opponent bans/picks this champion',
  },
};

export const mockAIHintPanelProps: AIHintPanelProps = {
  currentPhase: 'pick1',
  currentTurn: 6,
  currentSide: 'blue',
  recommendations: mockRecommendations,
  gameSignal: mockGameSignal,
  systemStatus: {
    isLoading: false,
    lastUpdated: new Date(),
    overallConfidence: 0.74,
  },
  visible: true,
  collapsible: true,
};
