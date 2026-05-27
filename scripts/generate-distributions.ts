import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { dataset } from '../src/data/dataset';
import { calculate } from '../src/lib/calculate';
import { activeSubskillCountAtLevel, defaultInput } from '../src/lib/input';
import type {
  CalcInput,
  DistributionMetric,
  DistributionScenario,
  IngredientDrop,
  PokemonDistributionDataset,
  PokemonDistributionIndex,
  PokemonSpecies,
  Subskill
} from '../src/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const outputDir = resolve(rootDir, 'public', 'distributions');
const speciesOutputDir = resolve(outputDir, 'species');
const indexOutputPath = resolve(outputDir, 'pokemon-distributions.generated.json');

const MODEL_VERSION = 'all-species-monte-carlo-v2';
const LEVELS = [30, 50, 60];
const FAVORITE_BERRY_OPTIONS = [true, false];
const SAMPLE_SIZE = numberEnv('DISTRIBUTION_SAMPLE_SIZE', 10_000);
const QUANTILE_COUNT = numberEnv('DISTRIBUTION_QUANTILE_COUNT', 251);
const SEED = 0x51ee_2026;

type Rarity = Subskill['rarity'];

const RARITY_WEIGHTS: Array<{ rarity: Rarity; weight: number }> = [
  { rarity: 'white', weight: 494 },
  { rarity: 'silver', weight: 351 },
  { rarity: 'gold', weight: 155 }
];

const ASSUMPTIONS = [
  '全ポケモンを種族ごとのJSONに分割して生成',
  'せいかくは25種を等確率',
  '食材2枠目はA:B=1:2、3枠目は3食材なら等確率、2食材ならA:B=1:2',
  'サブスキルtierは白49.4%/青35.1%/金15.5%の推定ロール、同tier内は等確率、重複なし',
  'フレンドレベルによる金スキル保証は未反映',
  '睡眠EXP・リサーチEXP・ゆめのかけら等はスロットを消費するが生産値には直接加点しない',
  '比較条件は通常げんき、FB0%、キャンプoff、通常マップ、EX off、他のおてボ0'
];

export function generateDistributions() {
  const generatedAt = new Date().toISOString();
  const targetSpecies = targetSpeciesIds();
  const speciesIndex: PokemonDistributionIndex['species'] = {};

  rmSync(speciesOutputDir, { recursive: true, force: true });
  mkdirSync(speciesOutputDir, { recursive: true });

  for (const [index, speciesId] of targetSpecies.entries()) {
    const species = required(dataset.pokemon.find((pokemon) => pokemon.id === speciesId), `pokemon ${speciesId}`);
    const speciesBundle = generateSpeciesDistribution(species, generatedAt);
    const path = `species/${species.id}.json`;

    writeFileSync(resolve(outputDir, path), `${JSON.stringify(speciesBundle)}\n`);
    speciesIndex[speciesId] = {
      speciesId,
      scenarioIds: speciesBundle.species[speciesId]?.scenarioIds ?? [],
      path
    };

    if ((index + 1) % 25 === 0 || index + 1 === targetSpecies.length) {
      console.log(`Generated distributions ${index + 1}/${targetSpecies.length}`);
    }
  }

  const index: PokemonDistributionIndex = {
    generatedAt,
    modelVersion: MODEL_VERSION,
    source: dataset.source,
    simulation: {
      seed: SEED,
      sampleSize: SAMPLE_SIZE,
      quantileCount: QUANTILE_COUNT,
      targetSpecies,
      levels: LEVELS,
      assumptions: ASSUMPTIONS
    },
    species: speciesIndex
  };

  writeFileSync(indexOutputPath, `${JSON.stringify(index, null, 2)}\n`);
  return index;
}

function generateSpeciesDistribution(species: PokemonSpecies, generatedAt: string): PokemonDistributionDataset {
  const scenarios: Record<string, DistributionScenario> = {};
  const speciesIndex: PokemonDistributionDataset['species'] = {
    [species.id]: { speciesId: species.id, scenarioIds: [] }
  };

  for (const level of LEVELS) {
    for (const favoriteBerry of FAVORITE_BERRY_OPTIONS) {
      const rng = new Lcg(seedForScenario(species.id, level, favoriteBerry));
      const scenario = simulateScenario(species, level, favoriteBerry, rng);
      scenarios[scenario.id] = scenario;
      speciesIndex[species.id].scenarioIds.push(scenario.id);
    }
  }

  return {
    generatedAt,
    modelVersion: MODEL_VERSION,
    source: dataset.source,
    simulation: {
      seed: SEED,
      sampleSize: SAMPLE_SIZE,
      quantileCount: QUANTILE_COUNT,
      targetSpecies: [species.id],
      levels: LEVELS,
      assumptions: ASSUMPTIONS
    },
    species: speciesIndex,
    scenarios
  };
}

function simulateScenario(species: PokemonSpecies, level: number, favoriteBerry: boolean, rng: Lcg): DistributionScenario {
  const metricSamples = new Map<string, number[]>();
  const activeSubskillCount = activeSubskillCountAtLevel(level);

  for (let sample = 0; sample < SAMPLE_SIZE; sample += 1) {
    const input = sampleInput(species, level, favoriteBerry, activeSubskillCount, rng);
    const result = calculate(input);
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

  const id = scenarioId(species.id, level, favoriteBerry);
  return {
    id,
    speciesId: species.id,
    level,
    skillLevel: 1,
    favoriteBerry,
    fieldBonus: 0,
    goodCamp: false,
    energyMode: 'normal',
    activeSubskillCount,
    sampleSize: SAMPLE_SIZE,
    metrics
  };
}

function sampleInput(
  species: PokemonSpecies,
  level: number,
  favoriteBerry: boolean,
  activeSubskillCount: number,
  rng: Lcg
): CalcInput {
  const base = defaultInput(species);
  const subskillIds = sampleSubskills(activeSubskillCount, rng);

  return {
    ...base,
    level,
    ingredient0Id: species.ingredient0[0]?.ingredientId ?? base.ingredient0Id,
    ingredient30Id: sampleIngredient30(species.ingredient30, rng).ingredientId,
    ingredient60Id: sampleIngredient60(species.ingredient60, rng).ingredientId,
    subskillIds,
    natureId: sampleNature(rng),
    skillLevel: 1,
    evolutionCount: 0,
    helpingBonusCount: 0,
    energyMode: 'normal',
    favoriteBerry,
    goodCamp: false,
    fieldBonus: 0,
    mapMode: 'normal',
    exMode: false
  };
}

function sampleSubskills(activeCount: number, rng: Lcg) {
  const selected = new Set<string>();
  const byRarity = new Map<Rarity, Subskill[]>();
  for (const subskill of dataset.subskills) {
    byRarity.set(subskill.rarity, [...(byRarity.get(subskill.rarity) ?? []), subskill]);
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

function sampleIngredient30(options: IngredientDrop[], rng: Lcg) {
  const availableOptions = availableIngredientOptions(options);
  if (availableOptions.length <= 1) {
    return availableOptions[0];
  }
  return rng.next() < 1 / 3 ? availableOptions[0] : availableOptions[1];
}

function sampleIngredient60(options: IngredientDrop[], rng: Lcg) {
  const availableOptions = availableIngredientOptions(options);
  if (availableOptions.length <= 1) {
    return availableOptions[0];
  }
  if (availableOptions.length === 2) {
    return rng.next() < 1 / 3 ? availableOptions[0] : availableOptions[1];
  }
  return availableOptions[Math.floor(rng.next() * Math.min(3, availableOptions.length))];
}

function sampleNature(rng: Lcg) {
  return dataset.natures[Math.floor(rng.next() * dataset.natures.length)].id;
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

function availableIngredientOptions(options: IngredientDrop[]) {
  const availableOptions = options.filter((drop) => drop.amount > 0 && drop.ingredientId !== 'Locked');
  return availableOptions.length > 0 ? availableOptions : options;
}

function scenarioId(speciesId: string, level: number, favoriteBerry: boolean) {
  return `${speciesId}-lv${level}-fav-${favoriteBerry ? 'on' : 'off'}`;
}

function roundMetric(value: number) {
  return Math.round(value * 1000) / 1000;
}

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) {
    throw new Error(`Missing ${label}`);
  }
  return value;
}

function targetSpeciesIds() {
  const raw = process.env.DISTRIBUTION_SPECIES?.trim();
  if (!raw) {
    return dataset.pokemon.map((pokemon) => pokemon.id);
  }
  return raw.split(',').map((item) => item.trim()).filter(Boolean);
}

function numberEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function seedForScenario(speciesId: string, level: number, favoriteBerry: boolean) {
  let hash = SEED >>> 0;
  const key = `${speciesId}:${level}:${favoriteBerry ? 'on' : 'off'}`;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash;
}

class Lcg {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next() {
    this.state = (Math.imul(1664525, this.state) + 1013904223) >>> 0;
    return this.state / 0x1_0000_0000;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  generateDistributions();
  console.log(`Wrote ${indexOutputPath}`);
  console.log(`Wrote species distributions to ${speciesOutputDir}`);
}
