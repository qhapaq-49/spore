export type CandyExpType = 600 | 900 | 1080 | 1320;
export type CandyExpNature = 'down' | 'neutral' | 'up';
export type CandyBoostMode = 'none' | 'mini' | 'regular' | 'custom';
export type CandyPlanMode = 'target' | 'budget';

export interface CandySimulationInput {
  currentLevel: number;
  currentExp: number;
  targetLevel: number;
  expType: CandyExpType;
  expNature: CandyExpNature;
  boostMode: CandyBoostMode;
  customShardMultiplier?: number;
  candyLimit?: number;
  shardLimit?: number;
}

export interface CandySimulationResult {
  startLevel: number;
  startExp: number;
  targetLevel: number;
  finalLevel: number;
  finalExp: number;
  expToNext: number;
  gainedExp: number;
  neededExp: number;
  usedCandy: number;
  usedShards: number;
  targetReached: boolean;
  stoppedBy: 'target' | 'candy' | 'shards' | 'maxLevel';
}

export interface CandyPlanInput extends CandySimulationInput {
  id: string;
  speciesId: string;
  label: string;
  mode?: CandyPlanMode;
}

export interface CandyPlanResult {
  plan: CandyPlanInput;
  target: CandySimulationResult;
  budget: CandySimulationResult;
}

export const MAX_CANDY_LEVEL = 70;

export const CANDY_EXP_TYPES: { id: CandyExpType; label: string; multiplier: number }[] = [
  { id: 600, label: '600タイプ', multiplier: 1 },
  { id: 900, label: '900タイプ', multiplier: 1.5 },
  { id: 1080, label: '1080タイプ', multiplier: 1.8 },
  { id: 1320, label: '1320タイプ', multiplier: 2.2 }
];

export const CANDY_EXP_NATURES: { id: CandyExpNature; label: string; multiplier: number }[] = [
  { id: 'up', label: 'EXP↑', multiplier: 1.18 },
  { id: 'neutral', label: '補正なし', multiplier: 1 },
  { id: 'down', label: 'EXP↓', multiplier: 0.82 }
];

export const CANDY_BOOST_MODES: { id: CandyBoostMode; label: string; expMultiplier: number; shardMultiplier: number }[] = [
  { id: 'none', label: '通常', expMultiplier: 1, shardMultiplier: 1 },
  { id: 'mini', label: 'ミニブースト', expMultiplier: 2, shardMultiplier: 4 },
  { id: 'regular', label: 'アメブースト', expMultiplier: 2, shardMultiplier: 5 },
  { id: 'custom', label: '手入力', expMultiplier: 2, shardMultiplier: 5 }
];

const BASE_EXP_TO_NEXT = [
  0, 54, 71, 108, 128, 164, 202, 244, 274, 315, 345, 376, 407, 419, 429, 440, 454, 469, 483, 497, 515, 537,
  558, 579, 600, 622, 643, 665, 686, 708, 729, 748, 766, 785, 803, 821, 839, 857, 875, 893, 910, 928, 945,
  963, 980, 997, 1015, 1032, 1049, 1066, 1362, 1562, 1747, 1946, 2195, 2279, 2404, 2533, 2666, 2806,
  2865, 2922, 2977, 3029, 3077, 3095, 3116, 3144, 3189, 3255
];

const DREAM_SHARDS_PER_CANDY = [
  0, 14, 18, 22, 27, 30, 34, 39, 44, 48, 50, 52, 53, 56, 59, 62, 66, 68, 71, 74, 78, 81, 85, 88, 92, 95,
  100, 105, 111, 117, 122, 126, 130, 136, 143, 151, 160, 167, 174, 184, 192, 201, 211, 221, 227, 236, 250,
  264, 279, 295, 309, 323, 338, 356, 372, 391, 437, 486, 538, 593, 651, 698, 750, 804, 866, 932, 1004, 1084, 1173, 1272, 1382
];

const PSEUDO_900_SPECIES = new Set([
  'DRATINI',
  'DRAGONAIR',
  'DRAGONITE',
  'LARVITAR',
  'PUPITAR',
  'TYRANITAR',
  'BAGON',
  'SHELGON',
  'SALAMENCE'
]);
const LEGENDARY_1080_SPECIES = new Set(['RAIKOU', 'ENTEI', 'SUICUNE', 'CRESSELIA', 'LATIAS', 'LATIOS']);
const MYTHICAL_1320_SPECIES = new Set(['MEW', 'DARKRAI']);

export function inferCandyExpType(speciesId: string): CandyExpType {
  if (MYTHICAL_1320_SPECIES.has(speciesId)) {
    return 1320;
  }
  if (LEGENDARY_1080_SPECIES.has(speciesId)) {
    return 1080;
  }
  if (PSEUDO_900_SPECIES.has(speciesId)) {
    return 900;
  }
  return 600;
}

export function expNatureFromModifier(expModifier: number): CandyExpNature {
  if (expModifier > 1) {
    return 'up';
  }
  if (expModifier < 1) {
    return 'down';
  }
  return 'neutral';
}

export function candyExpAtLevel(level: number, expNature: CandyExpNature, boostMode: CandyBoostMode) {
  const baseExp = level >= 30 ? 25 : level >= 25 ? 35 : 40;
  return Math.round(baseExp * expNatureMultiplier(expNature)) * boostExpMultiplier(boostMode);
}

export function dreamShardsPerCandy(level: number, boostMode: CandyBoostMode, customShardMultiplier = 5) {
  const safeLevel = clampLevel(level);
  return DREAM_SHARDS_PER_CANDY[safeLevel] * boostShardMultiplier(boostMode, customShardMultiplier);
}

export function expToNextLevel(level: number, expType: CandyExpType) {
  if (level >= MAX_CANDY_LEVEL) {
    return 0;
  }
  return Math.round(BASE_EXP_TO_NEXT[clampLevel(level)] * expTypeMultiplier(expType));
}

export function simulateCandyUse(input: CandySimulationInput): CandySimulationResult {
  const startLevel = clampLevel(input.currentLevel);
  const targetLevel = clampLevel(Math.max(input.targetLevel, startLevel));
  let finalLevel = startLevel;
  let finalExp = clampInt(input.currentExp, 0, Math.max(0, expToNextLevel(startLevel, input.expType) - 1));
  const startExp = finalExp;
  const candyLimit = input.candyLimit === undefined ? Number.POSITIVE_INFINITY : Math.max(0, Math.floor(input.candyLimit));
  const shardLimit = input.shardLimit === undefined || input.shardLimit <= 0 ? Number.POSITIVE_INFINITY : Math.floor(input.shardLimit);
  const neededExp = expNeededToReachLevel(startLevel, startExp, targetLevel, input.expType);
  let usedCandy = 0;
  let usedShards = 0;
  let gainedExp = 0;
  let stoppedBy: CandySimulationResult['stoppedBy'] = 'target';

  while (finalLevel < targetLevel && finalLevel < MAX_CANDY_LEVEL) {
    if (usedCandy >= candyLimit) {
      stoppedBy = 'candy';
      break;
    }

    const shardCost = dreamShardsPerCandy(finalLevel, input.boostMode, input.customShardMultiplier);
    if (usedShards + shardCost > shardLimit) {
      stoppedBy = 'shards';
      break;
    }

    const expGain = candyExpAtLevel(finalLevel, input.expNature, input.boostMode);
    usedCandy += 1;
    usedShards += shardCost;
    gainedExp += expGain;
    finalExp += expGain;

    while (finalLevel < targetLevel && finalLevel < MAX_CANDY_LEVEL) {
      const nextExp = expToNextLevel(finalLevel, input.expType);
      if (finalExp < nextExp) {
        break;
      }
      finalExp -= nextExp;
      finalLevel += 1;
      if (finalLevel >= MAX_CANDY_LEVEL) {
        finalExp = 0;
        stoppedBy = 'maxLevel';
        break;
      }
    }
  }

  if (finalLevel >= targetLevel) {
    stoppedBy = 'target';
  } else if (finalLevel >= MAX_CANDY_LEVEL) {
    stoppedBy = 'maxLevel';
  }

  return {
    startLevel,
    startExp,
    targetLevel,
    finalLevel,
    finalExp,
    expToNext: expToNextLevel(finalLevel, input.expType),
    gainedExp,
    neededExp,
    usedCandy,
    usedShards,
    targetReached: finalLevel >= targetLevel,
    stoppedBy
  };
}

export function simulateCandyPlanQueue(plans: CandyPlanInput[], sharedShardLimit: number) {
  let remainingShards = sharedShardLimit > 0 ? Math.floor(sharedShardLimit) : Number.POSITIVE_INFINITY;
  const results: CandyPlanResult[] = [];

  for (const plan of plans) {
    const isBudgetMode = plan.mode === 'budget';
    const targetLevel = isBudgetMode ? MAX_CANDY_LEVEL : plan.targetLevel;
    const candyLimit = isBudgetMode ? (plan.candyLimit ?? 0) : undefined;
    const target = simulateCandyUse({ ...plan, targetLevel, candyLimit, shardLimit: undefined });
    const budget = simulateCandyUse({
      ...plan,
      targetLevel,
      candyLimit,
      shardLimit: Number.isFinite(remainingShards) ? remainingShards : undefined
    });
    remainingShards = Number.isFinite(remainingShards) ? Math.max(0, remainingShards - budget.usedShards) : remainingShards;
    results.push({ plan, target, budget });
  }

  const totals = results.reduce(
    (sum, result) => ({
      targetCandy: sum.targetCandy + result.target.usedCandy,
      targetShards: sum.targetShards + result.target.usedShards,
      budgetCandy: sum.budgetCandy + result.budget.usedCandy,
      budgetShards: sum.budgetShards + result.budget.usedShards,
      targetReachedCount: sum.targetReachedCount + (isPlanComplete(result) ? 1 : 0)
    }),
    { targetCandy: 0, targetShards: 0, budgetCandy: 0, budgetShards: 0, targetReachedCount: 0 }
  );

  return {
    results,
    totals,
    remainingShards: Number.isFinite(remainingShards) ? remainingShards : 0,
    isShardUnlimited: !Number.isFinite(remainingShards)
  };
}

function isPlanComplete(result: CandyPlanResult) {
  if (result.plan.mode === 'budget') {
    return result.budget.finalLevel >= MAX_CANDY_LEVEL || result.budget.usedCandy >= (result.plan.candyLimit ?? 0);
  }
  return result.budget.targetReached;
}

function expNeededToReachLevel(currentLevel: number, currentExp: number, targetLevel: number, expType: CandyExpType) {
  let total = Math.max(0, expToNextLevel(currentLevel, expType) - currentExp);
  for (let level = currentLevel + 1; level < targetLevel; level += 1) {
    total += expToNextLevel(level, expType);
  }
  return currentLevel >= targetLevel ? 0 : total;
}

function expTypeMultiplier(expType: CandyExpType) {
  return CANDY_EXP_TYPES.find((type) => type.id === expType)?.multiplier ?? 1;
}

function expNatureMultiplier(expNature: CandyExpNature) {
  return CANDY_EXP_NATURES.find((nature) => nature.id === expNature)?.multiplier ?? 1;
}

function boostExpMultiplier(boostMode: CandyBoostMode) {
  return CANDY_BOOST_MODES.find((mode) => mode.id === boostMode)?.expMultiplier ?? 1;
}

function boostShardMultiplier(boostMode: CandyBoostMode, customShardMultiplier: number) {
  if (boostMode === 'custom') {
    return clampInt(customShardMultiplier, 1, 20);
  }
  return CANDY_BOOST_MODES.find((mode) => mode.id === boostMode)?.shardMultiplier ?? 1;
}

function clampLevel(value: number) {
  return clampInt(value, 1, MAX_CANDY_LEVEL);
}

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.floor(value)));
}
