import type {
  CalcInput,
  CalcResult,
  DistributionMetric,
  DistributionScenario,
  PokemonSpecies
} from '../types';
import { dataset, ingredientById, subskillById } from '../data/dataset';
import { calculate } from './calculate';
import { activeSubskillCountAtLevel, defaultInput, normalizeInput } from './input';

export interface MetricRank {
  id: string;
  label: string;
  unit: string;
  value: number;
  mean: number;
  percentile: number;
  topPercent: number;
  precision: number;
  shape: DistributionShape;
}

export interface DistributionShape {
  min: number;
  p25: number;
  median: number;
  p75: number;
  max: number;
  markerPercent: number;
  p25Percent: number;
  medianPercent: number;
  p75Percent: number;
  bins: DistributionShapeBin[];
}

export interface DistributionShapeBin {
  id: string;
  height: number;
}

export interface DistributionAnalysis {
  scenario: DistributionScenario | null;
  ranks: MetricRank[];
  unavailableReasons: string[];
  assumptions: string[];
}

const PRIMARY_METRICS = ['berryEnergy', 'ingredientTotal', 'skillTriggers'];
const SAMPLE_SIZE = 6_000;
const QUANTILE_COUNT = 251;
const SEED = 0x51ee_2026;
const RARITY_WEIGHTS = [
  { rarity: 'white', weight: 494 },
  { rarity: 'silver', weight: 351 },
  { rarity: 'gold', weight: 155 }
];
const ASSUMPTIONS = [
  '食材構成は現在入力と同じ構成に固定',
  'スキルLvは現在入力と同じ値に固定',
  'せいかくは25種を等確率',
  'サブスキルtierは白49.4%/青35.1%/金15.5%の推定ロール、同tier内は等確率、重複なし',
  'フレンドレベルによる金スキル保証は未反映',
  '睡眠EXP・リサーチEXP・ゆめのかけら等はスロットを消費するが生産値には直接加点しない',
  '比較条件はFB0%、キャンプoff、通常マップ、EX off、他のおてボ0'
];

export function analyzeDistribution(
  result: CalcResult,
  input: CalcInput,
  species: PokemonSpecies,
  options: { helpingBonusTeamValue: boolean; goldFixedSlots: number }
): DistributionAnalysis {
  const unavailableReasons = unavailableReasonsFor(input, species);
  if (unavailableReasons.length > 0) {
    return {
      scenario: null,
      ranks: [],
      unavailableReasons,
      assumptions: ASSUMPTIONS
    };
  }

  const scenario = simulateScenario(species, input, options.helpingBonusTeamValue, options.goldFixedSlots);
  return {
    scenario,
    ranks: metricRanks(result, scenario),
    unavailableReasons: [],
    assumptions: ASSUMPTIONS
  };
}

function unavailableReasonsFor(input: CalcInput, species: PokemonSpecies) {
  const reasons: string[] = [];
  if (!species) {
    reasons.push('このポケモンの個体値分布データを作れません。');
  }
  if (input.fieldBonus !== 0) {
    reasons.push('分布はフィールドボーナス0%で生成しています。');
  }
  if (input.goodCamp) {
    reasons.push('分布はいいキャンプチケットoffで生成しています。');
  }
  if (input.exMode) {
    reasons.push('分布はEXモードoffで生成しています。');
  }
  if (input.mapMode !== 'normal') {
    reasons.push('分布は通常マップで生成しています。');
  }
  if (input.energyMode !== 'normal') {
    reasons.push('分布は通常げんき推移で生成しています。');
  }
  if (input.helpingBonusCount !== 0) {
    reasons.push('分布は他のおてつだいボーナス0匹で生成しています。');
  }
  return reasons;
}

function simulateScenario(
  species: PokemonSpecies,
  input: CalcInput,
  helpingBonusTeamValue: boolean,
  goldFixedSlots: number
): DistributionScenario {
  const metricSamples = new Map<string, number[]>();
  const activeSubskillCount = activeSubskillCountAtLevel(input.level);
  const selectedIngredients = selectedIngredientIds(input, species, input.level);
  const safeGoldFixedSlots = Math.max(0, Math.min(3, Math.floor(goldFixedSlots)));
  const rng = new Lcg(
    seedForScenario(
      species.id,
      input.level,
      input.skillLevel,
      input.favoriteBerry,
      ingredientKey(input, species, input.level),
      helpingBonusTeamValue,
      safeGoldFixedSlots
    )
  );

  for (let sample = 0; sample < SAMPLE_SIZE; sample += 1) {
    const sampledInput = sampleInput(species, input, activeSubskillCount, selectedIngredients, helpingBonusTeamValue, safeGoldFixedSlots, rng);
    const result = calculate(sampledInput);
    const ingredientTotal = result.ingredientBreakdown.reduce((sum, item) => sum + item.amount, 0);

    pushMetric(metricSamples, 'berryEnergy', result.berryEnergy);
    pushMetric(metricSamples, 'ingredientTotal', ingredientTotal);
    pushMetric(metricSamples, 'ingredientEnergy', result.ingredientEnergy);
    pushMetric(metricSamples, 'skillTriggers', result.expectedSkillTriggers);
  }

  const metrics: Record<string, DistributionMetric> = {};
  for (const [metricId, values] of metricSamples) {
    metrics[metricId] = summarizeMetric(metricId, values);
  }

  return {
    id: scenarioId(
      species.id,
      input.level,
      input.skillLevel,
      input.favoriteBerry,
      ingredientKey(input, species, input.level),
      helpingBonusTeamValue,
      safeGoldFixedSlots
    ),
    speciesId: species.id,
    level: input.level,
    skillLevel: input.skillLevel,
    favoriteBerry: input.favoriteBerry,
    fieldBonus: 0,
    goodCamp: false,
    energyMode: 'normal',
    activeSubskillCount,
    sampleSize: SAMPLE_SIZE,
    ingredientKey: ingredientKey(input, species, input.level),
    ingredientPattern: ingredientPatternLabel(input, species, input.level),
    helpingBonusTeamValue,
    goldFixedSlots: safeGoldFixedSlots,
    metrics
  };
}

function sampleInput(
  species: PokemonSpecies,
  baseInput: CalcInput,
  activeSubskillCount: number,
  selectedIngredients: string[],
  helpingBonusTeamValue: boolean,
  goldFixedSlots: number,
  rng: Lcg
): CalcInput {
  const fallback = defaultInput(species);
  const subskillIds = sampleSubskills(activeSubskillCount, goldFixedSlots, rng);
  const hasHelpingBonus = subskillIds.some((id) => subskillById.get(id)?.name === 'Helping Bonus');
  return normalizeInput(
    {
      ...fallback,
      level: baseInput.level,
      ingredient0Id: selectedIngredients[0] ?? fallback.ingredient0Id,
      ingredient30Id: selectedIngredients[1] ?? fallback.ingredient30Id,
      ingredient60Id: selectedIngredients[2] ?? fallback.ingredient60Id,
      subskillIds,
      natureId: dataset.natures[Math.floor(rng.next() * dataset.natures.length)]?.id ?? fallback.natureId,
      skillLevel: baseInput.skillLevel,
      evolutionCount: 0,
      helpingBonusCount: helpingBonusTeamValue && hasHelpingBonus ? 4 : 0,
      energyMode: 'normal',
      favoriteBerry: baseInput.favoriteBerry,
      goodCamp: false,
      fieldBonus: 0,
      mapMode: 'normal',
      exMode: false
    },
    species
  );
}

function metricRanks(result: CalcResult, scenario: DistributionScenario) {
  const metricValues = resultMetricValues(result, scenario);
  return Object.entries(metricValues)
    .map(([metricId, value]) => {
      const metric = scenario.metrics[metricId];
      if (!metric) {
        return null;
      }
      const percentile = percentileOf(metric, value);
      return {
        id: metricId,
        label: metric.label,
        unit: metric.unit,
        value,
        mean: metric.mean,
        percentile,
        topPercent: Math.max(0, 100 - percentile),
        precision: metric.precision,
        shape: distributionShape(metric, value)
      };
    })
    .filter((rank): rank is MetricRank => rank !== null);
}

function resultMetricValues(result: CalcResult, scenario: DistributionScenario) {
  const values: Record<string, number> = {
    berryEnergy: result.berryEnergy,
    ingredientTotal: result.ingredientBreakdown.reduce((sum, item) => sum + item.amount, 0),
    skillTriggers: result.expectedSkillTriggers
  };

  return Object.fromEntries(
    Object.entries(values).sort(([left], [right]) => {
      const leftIndex = PRIMARY_METRICS.indexOf(left);
      const rightIndex = PRIMARY_METRICS.indexOf(right);
      if (leftIndex >= 0 || rightIndex >= 0) {
        return (leftIndex >= 0 ? leftIndex : 99) - (rightIndex >= 0 ? rightIndex : 99);
      }
      return left.localeCompare(right);
    })
  );
}

function sampleSubskills(activeCount: number, goldFixedSlots: number, rng: Lcg) {
  const selected = new Set<string>();
  const byRarity = new Map<string, typeof dataset.subskills>();
  for (const subskill of dataset.subskills) {
    byRarity.set(subskill.rarity, [...(byRarity.get(subskill.rarity) ?? []), subskill]);
  }

  const fixedGoldCount = Math.min(activeCount, Math.max(0, Math.floor(goldFixedSlots)));
  for (let index = 0; index < fixedGoldCount; index += 1) {
    const candidates = (byRarity.get('gold') ?? []).filter((subskill) => !selected.has(subskill.id));
    if (candidates.length === 0) {
      break;
    }
    selected.add(candidates[Math.floor(rng.next() * candidates.length)].id);
  }

  while (selected.size < activeCount && selected.size < dataset.subskills.length) {
    const rarity = weightedChoice(RARITY_WEIGHTS, rng);
    const candidates = (byRarity.get(rarity) ?? []).filter((subskill) => !selected.has(subskill.id));
    if (candidates.length === 0) {
      continue;
    }
    selected.add(candidates[Math.floor(rng.next() * candidates.length)].id);
  }

  return Array.from(selected);
}

function weightedChoice<T extends string>(items: Array<{ rarity: T; weight: number }>, rng: Lcg) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = rng.next() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) {
      return item.rarity;
    }
  }
  return items[items.length - 1].rarity;
}

function selectedIngredientIds(input: CalcInput, species: PokemonSpecies, level: number) {
  const ingredients = [
    input.ingredient0Id || species.ingredient0[0]?.ingredientId,
    input.ingredient30Id || species.ingredient30[0]?.ingredientId,
    input.ingredient60Id || species.ingredient60[0]?.ingredientId
  ];
  return ingredients.slice(0, unlockedIngredientCount(level)).filter((ingredientId): ingredientId is string => Boolean(ingredientId));
}

export function ingredientPatternLabel(input: CalcInput, species: PokemonSpecies, level: number) {
  const labels = [
    ingredientOptionLabel(species.ingredient0, input.ingredient0Id),
    ingredientOptionLabel(species.ingredient30, input.ingredient30Id),
    ingredientOptionLabel(species.ingredient60, input.ingredient60Id)
  ];
  return labels.slice(0, unlockedIngredientCount(level)).join('');
}

function ingredientOptionLabel(options: Array<{ ingredientId: string; amount: number }>, selectedIngredientId: string) {
  const availableOptions = options.filter((option) => option.amount > 0 && option.ingredientId !== 'Locked');
  const index = Math.max(
    0,
    availableOptions.findIndex((option) => option.ingredientId === selectedIngredientId)
  );
  return String.fromCharCode('A'.charCodeAt(0) + (index >= 0 ? index : 0));
}

function ingredientKey(input: CalcInput, species: PokemonSpecies, level: number) {
  return selectedIngredientIds(input, species, level)
    .map((ingredientId) => {
      const ingredient = ingredientById.get(ingredientId);
      return ingredient?.id ?? ingredientId;
    })
    .join('-');
}

function unlockedIngredientCount(level: number) {
  if (level >= 60) {
    return 3;
  }
  if (level >= 30) {
    return 2;
  }
  return 1;
}

function summarizeMetric(metricId: string, values: number[]): DistributionMetric {
  const sorted = values.slice().sort((a, b) => a - b);
  const quantiles = Array.from({ length: QUANTILE_COUNT }, (_, index) => {
    const position = (index / (QUANTILE_COUNT - 1)) * (sorted.length - 1);
    const low = Math.floor(position);
    const high = Math.ceil(position);
    if (low === high) {
      return roundMetric(sorted[low]);
    }
    const weight = position - low;
    return roundMetric(sorted[low] * (1 - weight) + sorted[high] * weight);
  });

  return {
    label: metricLabel(metricId),
    unit: metricUnit(metricId),
    precision: metricPrecision(metricId),
    min: roundMetric(sorted[0]),
    max: roundMetric(sorted[sorted.length - 1]),
    mean: roundMetric(values.reduce((sum, value) => sum + value, 0) / values.length),
    quantiles
  };
}

function metricLabel(metricId: string) {
  if (metricId === 'berryEnergy') {
    return 'きのみエナジー';
  }
  if (metricId === 'ingredientTotal') {
    return '合計食材数';
  }
  if (metricId === 'ingredientEnergy') {
    return '食材エナジー';
  }
  if (metricId === 'skillTriggers') {
    return 'スキル発動回数';
  }
  return metricId;
}

function metricUnit(metricId: string) {
  if (metricId === 'ingredientTotal') {
    return '個';
  }
  if (metricId === 'skillTriggers') {
    return '回';
  }
  return '';
}

function metricPrecision(metricId: string) {
  if (metricId === 'skillTriggers') {
    return 2;
  }
  if (metricId === 'ingredientTotal') {
    return 1;
  }
  return 0;
}

function pushMetric(samples: Map<string, number[]>, metricId: string, value: number) {
  const values = samples.get(metricId);
  if (values) {
    values.push(value);
  } else {
    samples.set(metricId, [value]);
  }
}

function roundMetric(value: number) {
  return Math.round(value * 1000) / 1000;
}

export function percentileOf(metric: DistributionMetric, value: number) {
  const quantiles = metric.quantiles;
  if (quantiles.length <= 1) {
    return 0;
  }
  let low = 0;
  let high = quantiles.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (quantiles[middle] <= value) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return Math.max(0, Math.min(100, ((low - 1) / (quantiles.length - 1)) * 100));
}

export function distributionShape(metric: DistributionMetric, value: number, binCount = 28): DistributionShape {
  const quantiles = metric.quantiles;
  const min = quantiles[0] ?? metric.min;
  const max = quantiles[quantiles.length - 1] ?? metric.max;
  const range = max - min;
  const p25 = quantileAt(quantiles, 0.25);
  const median = quantileAt(quantiles, 0.5);
  const p75 = quantileAt(quantiles, 0.75);

  if (range <= 0 || quantiles.length === 0) {
    return {
      min,
      p25,
      median,
      p75,
      max,
      markerPercent: 50,
      p25Percent: 50,
      medianPercent: 50,
      p75Percent: 50,
      bins: Array.from({ length: binCount }, (_, index) => ({ id: String(index), height: 0 }))
    };
  }

  const counts = Array.from({ length: binCount }, () => 0);
  for (const quantile of quantiles) {
    const index = Math.max(0, Math.min(binCount - 1, Math.floor(((quantile - min) / range) * binCount)));
    counts[index] += 1;
  }
  const maxCount = Math.max(...counts, 1);

  return {
    min,
    p25,
    median,
    p75,
    max,
    markerPercent: valueToPercent(value, min, max),
    p25Percent: valueToPercent(p25, min, max),
    medianPercent: valueToPercent(median, min, max),
    p75Percent: valueToPercent(p75, min, max),
    bins: counts.map((count, index) => ({
      id: String(index),
      height: count > 0 ? Math.max(0.08, Math.sqrt(count / maxCount)) : 0
    }))
  };
}

function quantileAt(quantiles: number[], fraction: number) {
  if (quantiles.length === 0) {
    return 0;
  }
  const index = Math.max(0, Math.min(quantiles.length - 1, Math.round((quantiles.length - 1) * fraction)));
  return quantiles[index];
}

function valueToPercent(value: number, min: number, max: number) {
  if (max <= min) {
    return 50;
  }
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
}

function scenarioId(
  speciesId: string,
  level: number,
  skillLevel: number,
  favoriteBerry: boolean,
  ingredientKeyValue: string,
  helpingBonusTeamValue: boolean,
  goldFixedSlots: number
) {
  return `${speciesId}-lv${level}-skill${skillLevel}-fav-${favoriteBerry ? 'on' : 'off'}-ing-${ingredientKeyValue}-hbteam-${
    helpingBonusTeamValue ? 'on' : 'off'
  }-gold${goldFixedSlots}`;
}

function seedForScenario(
  speciesId: string,
  level: number,
  skillLevel: number,
  favoriteBerry: boolean,
  ingredientKeyValue: string,
  helpingBonusTeamValue: boolean,
  goldFixedSlots: number
) {
  let hash = SEED >>> 0;
  const key = `${speciesId}:${level}:skill${skillLevel}:${favoriteBerry ? 'on' : 'off'}:${ingredientKeyValue}:${
    helpingBonusTeamValue ? 'hbteam' : 'self'
  }:gold${goldFixedSlots}`;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  return hash;
}

class Lcg {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next() {
    this.state = (Math.imul(1_664_525, this.state) + 1_013_904_223) >>> 0;
    return this.state / 0x1_0000_0000;
  }
}
