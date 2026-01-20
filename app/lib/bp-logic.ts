import { BPStep, BPState, Champion } from './types';

// Complete BP sequence (20 steps) - Official match rules
export const BP_SEQUENCE: BPStep[] = [
  // Ban Phase 1: Blue Ban → Red Ban → Blue Ban → Red Ban → Blue Ban → Red Ban (3 each)
  { team: 'blue', action: 'ban', index: 0 },
  { team: 'red', action: 'ban', index: 0 },
  { team: 'blue', action: 'ban', index: 1 },
  { team: 'red', action: 'ban', index: 1 },
  { team: 'blue', action: 'ban', index: 2 },
  { team: 'red', action: 'ban', index: 2 },

  // Pick Phase 1: Blue Pick → Red Pick → Red Pick → Blue Pick → Blue Pick → Red Pick (3 each)
  { team: 'blue', action: 'pick', index: 0 },
  { team: 'red', action: 'pick', index: 0 },
  { team: 'red', action: 'pick', index: 1 },
  { team: 'blue', action: 'pick', index: 1 },
  { team: 'blue', action: 'pick', index: 2 },
  { team: 'red', action: 'pick', index: 2 },

  // Ban Phase 2: Red Ban → Blue Ban → Red Ban → Blue Ban (2 each)
  { team: 'red', action: 'ban', index: 3 },
  { team: 'blue', action: 'ban', index: 3 },
  { team: 'red', action: 'ban', index: 4 },
  { team: 'blue', action: 'ban', index: 4 },

  // Pick Phase 2: Red Pick → Blue Pick → Blue Pick → Red Pick (2 each)
  { team: 'red', action: 'pick', index: 3 },
  { team: 'blue', action: 'pick', index: 3 },
  { team: 'blue', action: 'pick', index: 4 },
  { team: 'red', action: 'pick', index: 4 },
];

// Initial state
export const createInitialState = (): BPState => ({
  currentStep: 0,
  blueBans: [null, null, null, null, null],
  redBans: [null, null, null, null, null],
  bluePicks: [null, null, null, null, null],
  redPicks: [null, null, null, null, null],
  usedChampions: new Set(),
  history: [],
});

// Get current step info
export const getCurrentStep = (state: BPState): BPStep | null => {
  if (state.currentStep >= BP_SEQUENCE.length) return null;
  return BP_SEQUENCE[state.currentStep];
};

// Get current phase description
export const getPhaseDescription = (step: number): string => {
  if (step >= 20) return 'BP Complete';
  if (step < 6) return 'Ban Phase 1';
  if (step < 12) return 'Pick Phase 1';
  if (step < 16) return 'Ban Phase 2';
  return 'Pick Phase 2';
};

// Get current action description
export const getCurrentActionDescription = (state: BPState): string => {
  const currentStep = getCurrentStep(state);
  if (!currentStep) return 'BP Complete';

  const teamName = currentStep.team === 'blue' ? 'Blue' : 'Red';
  const actionName = currentStep.action === 'ban' ? 'Ban' : 'Pick';

  return `${teamName} ${actionName}`;
};

// Select champion
export const selectChampion = (state: BPState, champion: Champion): BPState => {
  const currentStep = getCurrentStep(state);
  if (!currentStep) return state;

  // Check if champion is already used
  if (state.usedChampions.has(champion.id)) return state;

  const newState = { ...state };
  const { team, action, index } = currentStep;

  // Update corresponding array
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

  // Update used champions
  newState.usedChampions = new Set(state.usedChampions);
  newState.usedChampions.add(champion.id);

  // Record history
  newState.history = [...state.history, {
    step: state.currentStep,
    championId: champion.id,
    team,
    action,
  }];

  // Advance to next step
  newState.currentStep = state.currentStep + 1;

  return newState;
};

// Undo last action
export const undoLastAction = (state: BPState): BPState => {
  if (state.history.length === 0) return state;

  const lastEntry = state.history[state.history.length - 1];
  const newState = { ...state };

  // Remove last history entry
  newState.history = state.history.slice(0, -1);

  // Revert step
  newState.currentStep = lastEntry.step;

  // Remove from used champions
  newState.usedChampions = new Set(state.usedChampions);
  newState.usedChampions.delete(lastEntry.championId);

  // Clear corresponding position
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

// Check if BP is complete
export const isBPComplete = (state: BPState): boolean => {
  return state.currentStep >= BP_SEQUENCE.length;
};
