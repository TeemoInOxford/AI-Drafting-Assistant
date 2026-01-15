import { BPStep, BPState, Champion } from './types';

// 完整的BP顺序（20步）- 正规比赛规则
export const BP_SEQUENCE: BPStep[] = [
  // Ban阶段1: 蓝Ban → 红Ban → 蓝Ban → 红Ban → 蓝Ban → 红Ban (各3个)
  { team: 'blue', action: 'ban', index: 0 },
  { team: 'red', action: 'ban', index: 0 },
  { team: 'blue', action: 'ban', index: 1 },
  { team: 'red', action: 'ban', index: 1 },
  { team: 'blue', action: 'ban', index: 2 },
  { team: 'red', action: 'ban', index: 2 },

  // Pick阶段1: 蓝Pick → 红Pick → 红Pick → 蓝Pick → 蓝Pick → 红Pick (各3个)
  { team: 'blue', action: 'pick', index: 0 },
  { team: 'red', action: 'pick', index: 0 },
  { team: 'red', action: 'pick', index: 1 },
  { team: 'blue', action: 'pick', index: 1 },
  { team: 'blue', action: 'pick', index: 2 },
  { team: 'red', action: 'pick', index: 2 },

  // Ban阶段2: 红Ban → 蓝Ban → 红Ban → 蓝Ban (各2个)
  { team: 'red', action: 'ban', index: 3 },
  { team: 'blue', action: 'ban', index: 3 },
  { team: 'red', action: 'ban', index: 4 },
  { team: 'blue', action: 'ban', index: 4 },

  // Pick阶段2: 红Pick → 蓝Pick → 蓝Pick → 红Pick → 红Pick → 蓝Pick (各2个)
  { team: 'red', action: 'pick', index: 3 },
  { team: 'blue', action: 'pick', index: 3 },
  { team: 'blue', action: 'pick', index: 4 },
  { team: 'red', action: 'pick', index: 4 },
];

// 初始状态
export const createInitialState = (): BPState => ({
  currentStep: 0,
  blueBans: [null, null, null, null, null],
  redBans: [null, null, null, null, null],
  bluePicks: [null, null, null, null, null],
  redPicks: [null, null, null, null, null],
  usedChampions: new Set(),
  history: [],
});

// 获取当前步骤信息
export const getCurrentStep = (state: BPState): BPStep | null => {
  if (state.currentStep >= BP_SEQUENCE.length) return null;
  return BP_SEQUENCE[state.currentStep];
};

// 获取当前阶段描述
export const getPhaseDescription = (step: number, language: 'zh' | 'en'): string => {
  const descriptions = {
    zh: {
      ban1: 'Ban阶段 1',
      pick1: 'Pick阶段 1',
      ban2: 'Ban阶段 2',
      pick2: 'Pick阶段 2',
      complete: 'BP完成',
    },
    en: {
      ban1: 'Ban Phase 1',
      pick1: 'Pick Phase 1',
      ban2: 'Ban Phase 2',
      pick2: 'Pick Phase 2',
      complete: 'BP Complete',
    },
  };

  if (step >= 20) return descriptions[language].complete;
  if (step < 6) return descriptions[language].ban1;
  if (step < 12) return descriptions[language].pick1;
  if (step < 16) return descriptions[language].ban2;
  return descriptions[language].pick2;
};

// 获取当前操作描述
export const getCurrentActionDescription = (state: BPState, language: 'zh' | 'en'): string => {
  const currentStep = getCurrentStep(state);
  if (!currentStep) {
    return language === 'zh' ? 'BP已完成' : 'BP Complete';
  }

  const teamName = language === 'zh'
    ? (currentStep.team === 'blue' ? '蓝方' : '红方')
    : (currentStep.team === 'blue' ? 'Blue' : 'Red');

  const actionName = language === 'zh'
    ? (currentStep.action === 'ban' ? '禁用' : '选择')
    : (currentStep.action === 'ban' ? 'Ban' : 'Pick');

  return `${teamName} ${actionName}`;
};

// 选择英雄
export const selectChampion = (state: BPState, champion: Champion): BPState => {
  const currentStep = getCurrentStep(state);
  if (!currentStep) return state;

  // 检查英雄是否已被使用
  if (state.usedChampions.has(champion.id)) return state;

  const newState = { ...state };
  const { team, action, index } = currentStep;

  // 更新对应数组
  if (team === 'blue') {
    if (action === 'ban') {
      newState.blueBans = [...state.blueBans];
      newState.blueBans[index] = champion;
    } else {
      newState.bluePicks = [...state.bluePicks];
      newState.bluePicks[index] = champion;
    }
  } else {
    if (action === 'ban') {
      newState.redBans = [...state.redBans];
      newState.redBans[index] = champion;
    } else {
      newState.redPicks = [...state.redPicks];
      newState.redPicks[index] = champion;
    }
  }

  // 更新已使用英雄
  newState.usedChampions = new Set(state.usedChampions);
  newState.usedChampions.add(champion.id);

  // 记录历史
  newState.history = [...state.history, {
    step: state.currentStep,
    championId: champion.id,
    team,
    action,
  }];

  // 前进到下一步
  newState.currentStep = state.currentStep + 1;

  return newState;
};

// 撤销上一步
export const undoLastAction = (state: BPState): BPState => {
  if (state.history.length === 0) return state;

  const lastEntry = state.history[state.history.length - 1];
  const newState = { ...state };

  // 移除最后一条历史
  newState.history = state.history.slice(0, -1);

  // 回退步骤
  newState.currentStep = lastEntry.step;

  // 从已使用中移除
  newState.usedChampions = new Set(state.usedChampions);
  newState.usedChampions.delete(lastEntry.championId);

  // 清除对应位置
  const step = BP_SEQUENCE[lastEntry.step];
  if (step.team === 'blue') {
    if (step.action === 'ban') {
      newState.blueBans = [...state.blueBans];
      newState.blueBans[step.index] = null;
    } else {
      newState.bluePicks = [...state.bluePicks];
      newState.bluePicks[step.index] = null;
    }
  } else {
    if (step.action === 'ban') {
      newState.redBans = [...state.redBans];
      newState.redBans[step.index] = null;
    } else {
      newState.redPicks = [...state.redPicks];
      newState.redPicks[step.index] = null;
    }
  }

  return newState;
};

// 检查BP是否完成
export const isBPComplete = (state: BPState): boolean => {
  return state.currentStep >= BP_SEQUENCE.length;
};
