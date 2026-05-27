export interface CookingChanceSource {
  id: string;
  label: string;
  triggersPerDay: number;
  chancePercent: number;
}

export interface CookingChanceSimulationOptions {
  sources: CookingChanceSource[];
  baseMealScore?: number;
  weeks?: number;
  mealsPerDay?: number;
  targetSuccesses?: number;
  seed?: number;
}

export interface CookingChanceSimulationResult {
  weeks: number;
  mealsPerWeek: number;
  targetSuccesses: number;
  totalTriggersPerDay: number;
  meanSuccesses: number;
  p10Successes: number;
  medianSuccesses: number;
  p90Successes: number;
  probabilityAtLeastTarget: number;
  meanEnergyMultiplier: number;
  baselineEnergyMultiplier: number;
  energyRatio: number;
  baseMealScore: number;
  meanScore: number;
  p10Score: number;
  medianScore: number;
  p90Score: number;
  histogram: Array<{
    successes: number;
    count: number;
    probability: number;
  }>;
  scoreHistogram: Array<{
    id: string;
    min: number;
    max: number;
    count: number;
    probability: number;
  }>;
}

const DAYS_PER_WEEK = 7;
const DEFAULT_MEALS_PER_DAY = 3;
const DEFAULT_WEEKS = 50_000;
const DEFAULT_TARGET_SUCCESSES = 8;
const WEEKDAY_BASE_CHANCE = 0.1;
const SUNDAY_BASE_CHANCE = 0.3;
const MAX_COOKING_CHANCE_BONUS = 0.7;

export function simulateCookingChanceWeek(options: CookingChanceSimulationOptions): CookingChanceSimulationResult {
  const weeks = Math.max(1, Math.floor(options.weeks ?? DEFAULT_WEEKS));
  const mealsPerDay = Math.max(1, Math.floor(options.mealsPerDay ?? DEFAULT_MEALS_PER_DAY));
  const mealsPerWeek = DAYS_PER_WEEK * mealsPerDay;
  const baseMealScore = Math.max(0, options.baseMealScore ?? 10_000);
  const targetSuccesses = Math.max(0, Math.min(mealsPerWeek, Math.floor(options.targetSuccesses ?? DEFAULT_TARGET_SUCCESSES)));
  const sources = options.sources
    .map((source) => ({
      ...source,
      triggersPerDay: Math.max(0, source.triggersPerDay),
      chancePercent: Math.max(0, source.chancePercent)
    }))
    .filter((source) => source.triggersPerDay > 0 && source.chancePercent > 0);
  const rng = new Lcg(options.seed ?? 0xc001_ce55);
  const histogram = Array.from({ length: mealsPerWeek + 1 }, (_, successes) => ({ successes, count: 0, probability: 0 }));
  const successSamples: number[] = [];
  const scoreSamples: number[] = [];
  let totalEnergyMultiplier = 0;

  for (let week = 0; week < weeks; week += 1) {
    let chanceStack = 0;
    let successes = 0;
    let energyMultiplier = 0;

    for (let day = 0; day < DAYS_PER_WEEK; day += 1) {
      for (let meal = 0; meal < mealsPerDay; meal += 1) {
        for (const source of sources) {
          const triggers = poisson(source.triggersPerDay / mealsPerDay, rng);
          chanceStack = Math.min(MAX_COOKING_CHANCE_BONUS, chanceStack + triggers * (source.chancePercent / 100));
        }

        const baseChance = day === DAYS_PER_WEEK - 1 ? SUNDAY_BASE_CHANCE : WEEKDAY_BASE_CHANCE;
        const success = rng.next() < Math.min(1, baseChance + chanceStack);
        if (success) {
          successes += 1;
          energyMultiplier += day === DAYS_PER_WEEK - 1 ? 3 : 2;
          chanceStack = 0;
        } else {
          energyMultiplier += 1;
        }
      }
    }

    histogram[successes].count += 1;
    successSamples.push(successes);
    scoreSamples.push(energyMultiplier * baseMealScore);
    totalEnergyMultiplier += energyMultiplier;
  }

  for (const bin of histogram) {
    bin.probability = bin.count / weeks;
  }

  successSamples.sort((left, right) => left - right);
  scoreSamples.sort((left, right) => left - right);
  const meanSuccesses = successSamples.reduce((sum, value) => sum + value, 0) / weeks;
  const meanScore = scoreSamples.reduce((sum, value) => sum + value, 0) / weeks;
  const meanEnergyMultiplier = totalEnergyMultiplier / weeks;
  const baselineEnergyMultiplier = baselineWeeklyEnergyMultiplier(mealsPerDay);

  return {
    weeks,
    mealsPerWeek,
    targetSuccesses,
    totalTriggersPerDay: sources.reduce((sum, source) => sum + source.triggersPerDay, 0),
    meanSuccesses,
    p10Successes: quantile(successSamples, 0.1),
    medianSuccesses: quantile(successSamples, 0.5),
    p90Successes: quantile(successSamples, 0.9),
    probabilityAtLeastTarget: successSamples.filter((value) => value >= targetSuccesses).length / weeks,
    meanEnergyMultiplier,
    baselineEnergyMultiplier,
    energyRatio: baselineEnergyMultiplier > 0 ? meanEnergyMultiplier / baselineEnergyMultiplier : 1,
    baseMealScore,
    meanScore,
    p10Score: quantile(scoreSamples, 0.1),
    medianScore: quantile(scoreSamples, 0.5),
    p90Score: quantile(scoreSamples, 0.9),
    histogram,
    scoreHistogram: scoreHistogram(scoreSamples, 24)
  };
}

function baselineWeeklyEnergyMultiplier(mealsPerDay: number) {
  const weekdayMeals = (DAYS_PER_WEEK - 1) * mealsPerDay;
  const sundayMeals = mealsPerDay;
  return weekdayMeals * (1 + WEEKDAY_BASE_CHANCE) + sundayMeals * (1 + 2 * SUNDAY_BASE_CHANCE);
}

function quantile(sorted: number[], fraction: number) {
  if (sorted.length === 0) {
    return 0;
  }
  const index = Math.max(0, Math.min(sorted.length - 1, Math.round((sorted.length - 1) * fraction)));
  return sorted[index];
}

function scoreHistogram(sorted: number[], binCount: number) {
  if (sorted.length === 0) {
    return [];
  }
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  if (max <= min) {
    return [{ id: '0', min, max, count: sorted.length, probability: 1 }];
  }
  const width = (max - min) / binCount;
  const bins = Array.from({ length: binCount }, (_, index) => ({
    id: String(index),
    min: min + width * index,
    max: index === binCount - 1 ? max : min + width * (index + 1),
    count: 0,
    probability: 0
  }));
  for (const value of sorted) {
    const index = Math.max(0, Math.min(binCount - 1, Math.floor((value - min) / width)));
    bins[index].count += 1;
  }
  for (const bin of bins) {
    bin.probability = bin.count / sorted.length;
  }
  return bins;
}

function poisson(lambda: number, rng: Lcg) {
  if (lambda <= 0) {
    return 0;
  }
  if (lambda > 30) {
    const normal = Math.sqrt(lambda) * boxMuller(rng) + lambda;
    return Math.max(0, Math.round(normal));
  }
  const limit = Math.exp(-lambda);
  let product = 1;
  let count = 0;
  do {
    count += 1;
    product *= rng.next();
  } while (product > limit);
  return count - 1;
}

function boxMuller(rng: Lcg) {
  const u1 = Math.max(Number.EPSILON, rng.next());
  const u2 = Math.max(Number.EPSILON, rng.next());
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
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
