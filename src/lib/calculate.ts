import {
  berryById,
  ingredientById,
  mainSkillById,
  natureById,
  pokemonById,
  subskillById
} from '../data/dataset';
import type {
  CalcInput,
  CalcResult,
  IngredientBreakdown,
  IngredientDrop,
  MainSkillActivation,
  PillowPokemonResult,
  TimedProductionResult,
  WhistlePokemonResult
} from '../types';
import { activeSubskillCountAtLevel, normalizeInput } from './input';

const DAY_SECONDS = 86_400;
const SLEEP_HOURS = 8.5;
const AWAKE_HOURS = 24 - SLEEP_HOURS;
const AWAKE_EFFECTIVE_SECONDS = 100_433.2;
const SLEEP_EFFECTIVE_SECONDS = 46_363.63636363636;
const CONSTANT_80_ENERGY_MULTIPLIER = 1 / 0.52;
const MAX_SPEED_REDUCTION = 0.35;

const DIRECT_ENERGY_UNITS = new Set(['strength']);
const ENERGY_RECOVERY_UNITS = new Set(['energy', 'team energy']);
const INGREDIENT_UNITS = new Set(['ingredients', 'random ingredients']);
const HELP_UNITS = new Set(['helps', 'extra helpful']);
const BERRY_UNITS = new Set(['berries']);

export function calculate(input: CalcInput): CalcResult {
  const species = required(pokemonById.get(input.speciesId), 'pokemon');
  const normalized = normalizeInput(input, species);
  const nature = required(natureById.get(normalized.natureId), 'nature');
  const berry = required(berryById.get(species.berryId), 'berry');
  const mainSkill = required(mainSkillById.get(species.skillId), 'main skill');

  const selectedIngredients = selectedIngredientDrops(normalized, species);
  const selectedIngredientCount = unlockedIngredientCount(normalized.level);
  const activeSubskillIds = normalized.subskillIds.slice(0, activeSubskillCountAtLevel(normalized.level));
  const subskills = activeSubskillIds.map((id) => subskillById.get(id)).filter((item) => item !== undefined);
  const subskillNames = new Set(subskills.map((subskill) => subskill.name));
  const exMode = normalized.exMode || normalized.mapMode !== 'normal';
  const exFavoriteBerry = exMode && normalized.exBerryMode !== 'none';
  const exMainBerry = exMode && normalized.exBerryMode === 'main';
  const exIngredientBonus =
    exMode && exFavoriteBerry && normalized.exBonusMode === 'ingredient'
      ? species.specialty === 'ingredient'
        ? 1.5
        : 1
      : 0;
  const averageIngredientDrops = averageIngredientSet(selectedIngredients, selectedIngredientCount, exIngredientBonus);

  const speedReduction = Math.min(
    MAX_SPEED_REDUCTION,
    normalized.helpingBonusCount * 0.05 +
      (subskillNames.has('Helping Bonus') ? 0.05 : 0) +
      subskills
        .filter((subskill) => subskill.name === 'Helping Speed S' || subskill.name === 'Helping Speed M')
        .reduce((sum, subskill) => sum + subskill.amount, 0)
  );
  const inventoryLimit =
    baseInventoryLimit(species) +
    inventoryBonus(subskills) +
    (normalized.mapMode === 'cyanEx' && exMainBerry ? 5 : 0);
  const levelFrequencyMultiplier = 1 - (normalized.level - 1) * 0.002;
  const campSpeedMultiplier = normalized.goodCamp ? 1.2 : 1;
  const natureSpeedMultiplier = speedNatureMultiplier(nature.positiveModifier, nature.negativeModifier);
  const exSpeedMultiplier = exSpeedTimeMultiplier(normalized.mapMode, normalized.exMode, normalized.exBerryMode);
  const displayedFrequency = Math.floor(
    species.frequency *
      levelFrequencyMultiplier *
      natureSpeedMultiplier *
      (1 - speedReduction) *
      exSpeedMultiplier *
      (1 / campSpeedMultiplier)
  );

  let awakeEffectiveSeconds = AWAKE_EFFECTIVE_SECONDS;
  let sleepEffectiveSeconds = SLEEP_EFFECTIVE_SECONDS;
  if (normalized.energyMode === 'morningPillow') {
    awakeEffectiveSeconds = effectiveSecondsForEnergyWindow(150, AWAKE_HOURS);
  } else if (normalized.energyMode === 'constant80') {
    awakeEffectiveSeconds = AWAKE_HOURS * 3_600 * CONSTANT_80_ENERGY_MULTIPLIER;
    sleepEffectiveSeconds = SLEEP_HOURS * 3_600 * CONSTANT_80_ENERGY_MULTIPLIER;
  }

  let awakeHelps = awakeEffectiveSeconds / displayedFrequency;
  let sleepHelps = sleepEffectiveSeconds / displayedFrequency;
  let helpsPerDay = awakeHelps + sleepHelps;

  const ingredientFinderBonus = subskills
    .filter((subskill) => subskill.name === 'Ingredient Finder S' || subskill.name === 'Ingredient Finder M')
    .reduce((sum, subskill) => sum + subskill.amount, 0);
  const skillTriggerBonus = subskills
    .filter((subskill) => subskill.name === 'Skill Trigger S' || subskill.name === 'Skill Trigger M')
    .reduce((sum, subskill) => sum + subskill.amount, 0);

  const ingredientProbability = clampProbability(
    (species.ingredientPercentage / 100) * nature.ingredient * (1 + ingredientFinderBonus)
  );
  const exSkillMultiplier = exMode && exFavoriteBerry && normalized.exBonusMode === 'skill' ? 1.25 : 1;
  const baseSkillProbability = clampProbability(
    (species.skillPercentage / 100) * nature.skill * (1 + skillTriggerBonus) * exSkillMultiplier
  );
  const skillCeiling = skillPityCeiling(species.specialty, species.frequency);
  const skillProbability = skillProbabilityWithPity(baseSkillProbability, skillCeiling);

  const berriesPerHelp = berriesPerDrop(species.specialty, subskillNames);
  const berryUnitEnergy = berryEnergyAtLevel(berry.energy, normalized.level);
  const favoriteMultiplier = exMode
    ? exFavoriteMultiplier(normalized.exBerryMode, normalized.exBonusMode)
    : normalized.favoriteBerry
      ? 2
      : 1;
  const fieldMultiplier = 1 + normalized.fieldBonus / 100;
  const skillLevel = Math.min(normalized.skillLevel + (exMainBerry ? 1 : 0), Math.max(mainSkill.maxLevel, 1));
  const preliminarySkillTriggers = helpsPerDay * skillProbability;
  const energyRecovery = energyRecoveryPerTrigger(mainSkill.activations, skillLevel);
  const shouldApplyEnergySkill = normalized.energyMode !== 'constant80' && energyRecovery > 0;
  const notes: string[] = ['日中は定期回収、睡眠中は8.5時間の未回収として1日期待値を計算しています。'];
  if (normalized.energyMode === 'morningPillow') {
    notes.push('朝イチげんきマクラ1個を使い、日中はげんき150%スタートとして計算しています。');
  } else if (normalized.energyMode === 'constant80') {
    notes.push('げんきは常に80以上として計算しています。枕2個以上を同じ個体に使う場合の近似にも使えます。');
  }
  if (shouldApplyEnergySkill) {
    const expectedRecovery = preliminarySkillTriggers * energyRecovery * nature.energy;
    const energySpeedBonus = Math.min(0.18, expectedRecovery / 800);
    awakeHelps *= 1 + energySpeedBonus;
    sleepHelps *= 1 + energySpeedBonus;
    helpsPerDay = awakeHelps + sleepHelps;
    notes.push(`げんき回復スキルは期待回復量 ${expectedRecovery.toFixed(1)} を速度補正に換算しています。`);
  }
  if (exMode) {
    notes.push(exModeNote(normalized.mapMode, normalized.exBerryMode, normalized.exBonusMode, exIngredientBonus, exSkillMultiplier));
  }
  if (skillProbability - baseSkillProbability > 0.0005) {
    notes.push(
      `スキル連続不発天井${skillCeiling}回を反映し、みなしスキル確率を${(skillProbability * 100).toFixed(
        2
      )}%として計算しています。`
    );
  }

  const productionWindow = splitProductionWindow({
    awakeHelps,
    sleepHelps,
    inventoryLimit,
    ingredientProbability,
    berriesPerHelp,
    averageIngredientDrops
  });
  if (productionWindow.sleepOverflowHelps > 0) {
    notes.push(
      `睡眠${SLEEP_HOURS}時間中の所持数あふれを反映し、約${productionWindow.sleepOverflowHelps.toFixed(
        1
      )}回分は食材・スキルなしのきのみのみで計算しています。`
    );
  }
  const sleepSkillStockLimit = skillStockLimit(species.specialty);
  const uncappedSleepSkillTriggers = productionWindow.sleepProducingHelps * skillProbability;
  const sleepSkillTriggers = expectedCappedPoisson(uncappedSleepSkillTriggers, sleepSkillStockLimit);
  if (uncappedSleepSkillTriggers - sleepSkillTriggers > 0.05) {
    notes.push(
      `睡眠中のスキル発動はストック上限${sleepSkillStockLimit}回を反映し、期待値を${sleepSkillTriggers.toFixed(
        2
      )}回に丸めています。`
    );
  }

  const normalBerryUnitEnergy = berryEnergyPerBerry(berryUnitEnergy, fieldMultiplier, favoriteMultiplier, false);
  const sneakyBerryUnitEnergy = berryEnergyPerBerry(berryUnitEnergy, fieldMultiplier, favoriteMultiplier, true);
  const berryEnergy =
    productionWindow.producingHelps *
      (1 - ingredientProbability) *
      berriesPerHelp *
      normalBerryUnitEnergy +
    productionWindow.sleepOverflowHelps * berriesPerHelp * sneakyBerryUnitEnergy;

  const ingredientBreakdown = averageIngredientDrops.map<IngredientBreakdown>((drop) => {
    const ingredient = required(ingredientById.get(drop.ingredientId), `ingredient ${drop.ingredientId}`);
    return {
      ingredientId: drop.ingredientId,
      amount: productionWindow.producingHelps * ingredientProbability * drop.amount,
      energy: productionWindow.producingHelps * ingredientProbability * drop.amount * ingredient.energy
    };
  });
  const ingredientEnergy = ingredientBreakdown.reduce((sum, item) => sum + item.energy, 0);

  const expectedSkillTriggers = productionWindow.awakeHelps * skillProbability + sleepSkillTriggers;
  const produceEnergyPerHelp =
    (1 - ingredientProbability) * berriesPerHelp * normalBerryUnitEnergy +
    ingredientProbability * averageIngredientDrops.reduce((sum, drop) => {
      const ingredient = required(ingredientById.get(drop.ingredientId), `ingredient ${drop.ingredientId}`);
      return sum + drop.amount * ingredient.energy;
    }, 0);
  const skillEnergyPerTrigger = mainSkill.activations.reduce(
    (sum, activation) => sum + activationEnergy(activation, skillLevel, normalBerryUnitEnergy, produceEnergyPerHelp),
    0
  );
  let skillEnergy = expectedSkillTriggers * skillEnergyPerTrigger;

  const totalEnergy = berryEnergy + ingredientEnergy + skillEnergy;
  return {
    id: cryptoRandomId(),
    createdAt: new Date().toISOString(),
    speciesId: species.id,
    speciesName: species.displayNameJa,
    level: normalized.level,
    totalEnergy,
    berryEnergy,
    ingredientEnergy,
    skillEnergy,
    helpsPerDay,
    displayedFrequency,
    inventoryLimit,
    ingredientProbability,
    skillProbability,
    expectedSkillTriggers,
    berriesPerHelp,
    sleepHours: SLEEP_HOURS,
    sleepOverflowHelps: productionWindow.sleepOverflowHelps,
    sleepSkillStockLimit,
    sleepSkillTriggers,
    selectedIngredients,
    ingredientBreakdown,
    notes
  };
}

export function calculateWhistle(input: CalcInput, whistleCount = 1): WhistlePokemonResult {
  const species = required(pokemonById.get(input.speciesId), 'pokemon');
  const normalized = normalizeInput(input, species);
  const nature = required(natureById.get(normalized.natureId), 'nature');
  const berry = required(berryById.get(species.berryId), 'berry');

  const selectedIngredients = selectedIngredientDrops(normalized, species);
  const selectedIngredientCount = unlockedIngredientCount(normalized.level);
  const activeSubskillIds = normalized.subskillIds.slice(0, activeSubskillCountAtLevel(normalized.level));
  const subskills = activeSubskillIds.map((id) => subskillById.get(id)).filter((item) => item !== undefined);
  const subskillNames = new Set(subskills.map((subskill) => subskill.name));
  const exMode = normalized.exMode || normalized.mapMode !== 'normal';
  const exFavoriteBerry = exMode && normalized.exBerryMode !== 'none';

  const speedReduction = Math.min(
    MAX_SPEED_REDUCTION,
    normalized.helpingBonusCount * 0.05 +
      (subskillNames.has('Helping Bonus') ? 0.05 : 0) +
      subskills
        .filter((subskill) => subskill.name === 'Helping Speed S' || subskill.name === 'Helping Speed M')
        .reduce((sum, subskill) => sum + subskill.amount, 0)
  );
  const levelFrequencyMultiplier = 1 - (normalized.level - 1) * 0.002;
  const natureSpeedMultiplier = speedNatureMultiplier(nature.positiveModifier, nature.negativeModifier);
  const displayedFrequency = Math.floor(species.frequency * levelFrequencyMultiplier * natureSpeedMultiplier * (1 - speedReduction));
  const helpsPerWhistle = (3 * 3_600 * CONSTANT_80_ENERGY_MULTIPLIER) / displayedFrequency;

  const ingredientFinderBonus = subskills
    .filter((subskill) => subskill.name === 'Ingredient Finder S' || subskill.name === 'Ingredient Finder M')
    .reduce((sum, subskill) => sum + subskill.amount, 0);
  const ingredientProbability = clampProbability(
    (species.ingredientPercentage / 100) * nature.ingredient * (1 + ingredientFinderBonus)
  );

  const berriesPerHelp = berriesPerDrop(species.specialty, subskillNames);
  const berryUnitEnergy = berryEnergyAtLevel(berry.energy, normalized.level);
  const favoriteMultiplier = exMode
    ? normalized.exBonusMode === 'berry' && exFavoriteBerry
      ? 2.4
      : exFavoriteBerry
        ? 2
        : 1
    : normalized.favoriteBerry
      ? 2
      : 1;
  const fieldMultiplier = 1 + normalized.fieldBonus / 100;
  const normalBerryUnitEnergy = berryEnergyPerBerry(berryUnitEnergy, fieldMultiplier, favoriteMultiplier, false);
  const count = Math.max(1, Math.floor(whistleCount));
  const berryAmountPerWhistle = Math.round(helpsPerWhistle * (1 - ingredientProbability) * berriesPerHelp);
  const berryAmount = berryAmountPerWhistle * count;
  const berryEnergy = berryAmount * normalBerryUnitEnergy;

  const ingredientMap = new Map<string, IngredientBreakdown>();
  for (const drop of selectedIngredients.slice(0, selectedIngredientCount)) {
    if (!drop || drop.amount <= 0 || drop.ingredientId === 'Locked') {
      continue;
    }
    const ingredient = required(ingredientById.get(drop.ingredientId), `ingredient ${drop.ingredientId}`);
    const amountPerWhistle = Math.round((helpsPerWhistle * ingredientProbability * drop.amount) / selectedIngredientCount);
    const amount = amountPerWhistle * count;
    const current = ingredientMap.get(drop.ingredientId) ?? { ingredientId: drop.ingredientId, amount: 0, energy: 0 };
    current.amount += amount;
    current.energy += amount * ingredient.energy;
    ingredientMap.set(drop.ingredientId, current);
  }

  const ingredientBreakdown = Array.from(ingredientMap.values());
  const ingredientEnergy = ingredientBreakdown.reduce((sum, item) => sum + item.energy, 0);

  return {
    speciesId: species.id,
    speciesName: species.displayNameJa,
    level: normalized.level,
    whistleCount: count,
    displayedFrequency,
    helpsPerWhistle,
    berryId: berry.id,
    berryName: berry.nameJa,
    berryAmount,
    berryEnergy,
    ingredientEnergy,
    totalEnergy: berryEnergy + ingredientEnergy,
    ingredientBreakdown,
    notes: [
      'おてつだいホイッスルは最大げんき効率の3時間分として計算しています。',
      'メインスキル、いいキャンプチケット、食材+1、EXモードの速度補正は反映していません。'
    ]
  };
}

export function calculatePillowImpact(input: CalcInput, startEnergy = 80, pillowCount = 1, awakeHours = 15.5): PillowPokemonResult {
  const species = required(pokemonById.get(input.speciesId), 'pokemon');
  const normalized = normalizeInput(input, species);
  const safeStartEnergy = Math.max(0, Math.min(100, Math.round(startEnergy)));
  const safePillowCount = Math.max(0, Math.floor(pillowCount));
  const afterEnergy = Math.min(150, safeStartEnergy + safePillowCount * 50);
  const safeAwakeHours = Math.max(0, awakeHours);
  const before = calculateTimedProduction(normalized, effectiveSecondsForEnergyWindow(safeStartEnergy, safeAwakeHours));
  const after = calculateTimedProduction(normalized, effectiveSecondsForEnergyWindow(afterEnergy, safeAwakeHours));

  return {
    speciesId: species.id,
    speciesName: species.displayNameJa,
    level: normalized.level,
    pillowCount: safePillowCount,
    startEnergy: safeStartEnergy,
    afterEnergy,
    awakeHours: safeAwakeHours,
    displayedFrequency: before.displayedFrequency,
    before,
    after,
    gain: subtractTimedProduction(after, before)
  };
}

export function berryEnergyAtLevel(baseEnergy: number, level: number) {
  return Math.round(Math.max(baseEnergy + level - 1, baseEnergy * 1.025 ** (level - 1)));
}

function calculateTimedProduction(input: CalcInput, effectiveSeconds: number): TimedProductionResult & { displayedFrequency: number } {
  const species = required(pokemonById.get(input.speciesId), 'pokemon');
  const normalized = normalizeInput(input, species);
  const nature = required(natureById.get(normalized.natureId), 'nature');
  const berry = required(berryById.get(species.berryId), 'berry');
  const mainSkill = required(mainSkillById.get(species.skillId), 'main skill');
  const selectedIngredients = selectedIngredientDrops(normalized, species);
  const selectedIngredientCount = unlockedIngredientCount(normalized.level);
  const activeSubskillIds = normalized.subskillIds.slice(0, activeSubskillCountAtLevel(normalized.level));
  const subskills = activeSubskillIds.map((id) => subskillById.get(id)).filter((item) => item !== undefined);
  const subskillNames = new Set(subskills.map((subskill) => subskill.name));
  const exMode = normalized.exMode || normalized.mapMode !== 'normal';
  const exFavoriteBerry = exMode && normalized.exBerryMode !== 'none';
  const exMainBerry = exMode && normalized.exBerryMode === 'main';
  const exIngredientBonus =
    exMode && exFavoriteBerry && normalized.exBonusMode === 'ingredient'
      ? species.specialty === 'ingredient'
        ? 1.5
        : 1
      : 0;
  const averageIngredientDrops = averageIngredientSet(selectedIngredients, selectedIngredientCount, exIngredientBonus);

  const speedReduction = Math.min(
    MAX_SPEED_REDUCTION,
    normalized.helpingBonusCount * 0.05 +
      (subskillNames.has('Helping Bonus') ? 0.05 : 0) +
      subskills
        .filter((subskill) => subskill.name === 'Helping Speed S' || subskill.name === 'Helping Speed M')
        .reduce((sum, subskill) => sum + subskill.amount, 0)
  );
  const levelFrequencyMultiplier = 1 - (normalized.level - 1) * 0.002;
  const campSpeedMultiplier = normalized.goodCamp ? 1.2 : 1;
  const natureSpeedMultiplier = speedNatureMultiplier(nature.positiveModifier, nature.negativeModifier);
  const exSpeedMultiplier = exSpeedTimeMultiplier(normalized.mapMode, normalized.exMode, normalized.exBerryMode);
  const displayedFrequency = Math.floor(
    species.frequency *
      levelFrequencyMultiplier *
      natureSpeedMultiplier *
      (1 - speedReduction) *
      exSpeedMultiplier *
      (1 / campSpeedMultiplier)
  );
  const helps = effectiveSeconds / displayedFrequency;

  const ingredientFinderBonus = subskills
    .filter((subskill) => subskill.name === 'Ingredient Finder S' || subskill.name === 'Ingredient Finder M')
    .reduce((sum, subskill) => sum + subskill.amount, 0);
  const skillTriggerBonus = subskills
    .filter((subskill) => subskill.name === 'Skill Trigger S' || subskill.name === 'Skill Trigger M')
    .reduce((sum, subskill) => sum + subskill.amount, 0);
  const ingredientProbability = clampProbability(
    (species.ingredientPercentage / 100) * nature.ingredient * (1 + ingredientFinderBonus)
  );
  const exSkillMultiplier = exMode && exFavoriteBerry && normalized.exBonusMode === 'skill' ? 1.25 : 1;
  const baseSkillProbability = clampProbability(
    (species.skillPercentage / 100) * nature.skill * (1 + skillTriggerBonus) * exSkillMultiplier
  );
  const skillProbability = skillProbabilityWithPity(baseSkillProbability, skillPityCeiling(species.specialty, species.frequency));

  const berriesPerHelp = berriesPerDrop(species.specialty, subskillNames);
  const berryUnitEnergy = berryEnergyAtLevel(berry.energy, normalized.level);
  const favoriteMultiplier = exMode
    ? exFavoriteMultiplier(normalized.exBerryMode, normalized.exBonusMode)
    : normalized.favoriteBerry
      ? 2
      : 1;
  const fieldMultiplier = 1 + normalized.fieldBonus / 100;
  const normalBerryUnitEnergy = berryEnergyPerBerry(berryUnitEnergy, fieldMultiplier, favoriteMultiplier, false);
  const berryEnergy = helps * (1 - ingredientProbability) * berriesPerHelp * normalBerryUnitEnergy;

  const ingredientBreakdown = averageIngredientDrops.map<IngredientBreakdown>((drop) => {
    const ingredient = required(ingredientById.get(drop.ingredientId), `ingredient ${drop.ingredientId}`);
    return {
      ingredientId: drop.ingredientId,
      amount: helps * ingredientProbability * drop.amount,
      energy: helps * ingredientProbability * drop.amount * ingredient.energy
    };
  });
  const ingredientEnergy = ingredientBreakdown.reduce((sum, item) => sum + item.energy, 0);
  const produceEnergyPerHelp =
    (1 - ingredientProbability) * berriesPerHelp * normalBerryUnitEnergy +
    ingredientProbability * averageIngredientDrops.reduce((sum, drop) => {
      const ingredient = required(ingredientById.get(drop.ingredientId), `ingredient ${drop.ingredientId}`);
      return sum + drop.amount * ingredient.energy;
    }, 0);
  const skillLevel = Math.min(normalized.skillLevel + (exMainBerry ? 1 : 0), Math.max(mainSkill.maxLevel, 1));
  const skillEnergyPerTrigger = mainSkill.activations.reduce(
    (sum, activation) => sum + activationEnergy(activation, skillLevel, normalBerryUnitEnergy, produceEnergyPerHelp),
    0
  );
  const skillEnergy = helps * skillProbability * skillEnergyPerTrigger;

  return {
    displayedFrequency,
    effectiveSeconds,
    helps,
    berryEnergy,
    ingredientEnergy,
    skillEnergy,
    totalEnergy: berryEnergy + ingredientEnergy + skillEnergy,
    ingredientBreakdown
  };
}

function effectiveSecondsForEnergyWindow(startEnergy: number, hours: number) {
  const minutes = Math.max(0, Math.round(hours * 60));
  let effectiveSeconds = 0;
  for (let minute = 0; minute < minutes; minute += 1) {
    const energy = Math.max(0, startEnergy - minute / 10);
    effectiveSeconds += 60 * energySpeedMultiplier(energy);
  }
  return effectiveSeconds;
}

function energySpeedMultiplier(energy: number) {
  if (energy > 80) {
    return 1 / 0.45;
  }
  if (energy > 60) {
    return 1 / 0.52;
  }
  if (energy > 40) {
    return 1 / 0.58;
  }
  if (energy > 0) {
    return 1 / 0.66;
  }
  return 1;
}

function subtractTimedProduction(after: TimedProductionResult, before: TimedProductionResult): TimedProductionResult {
  const ingredientIds = new Set([
    ...after.ingredientBreakdown.map((item) => item.ingredientId),
    ...before.ingredientBreakdown.map((item) => item.ingredientId)
  ]);
  return {
    effectiveSeconds: after.effectiveSeconds - before.effectiveSeconds,
    helps: after.helps - before.helps,
    berryEnergy: after.berryEnergy - before.berryEnergy,
    ingredientEnergy: after.ingredientEnergy - before.ingredientEnergy,
    skillEnergy: after.skillEnergy - before.skillEnergy,
    totalEnergy: after.totalEnergy - before.totalEnergy,
    ingredientBreakdown: Array.from(ingredientIds, (ingredientId) => {
      const afterItem = after.ingredientBreakdown.find((item) => item.ingredientId === ingredientId);
      const beforeItem = before.ingredientBreakdown.find((item) => item.ingredientId === ingredientId);
      return {
        ingredientId,
        amount: (afterItem?.amount ?? 0) - (beforeItem?.amount ?? 0),
        energy: (afterItem?.energy ?? 0) - (beforeItem?.energy ?? 0)
      };
    }).filter((item) => Math.abs(item.amount) > 0.0001 || Math.abs(item.energy) > 0.0001)
  };
}

function selectedIngredientDrops(input: CalcInput, species: { ingredient0: IngredientDrop[]; ingredient30: IngredientDrop[]; ingredient60: IngredientDrop[] }) {
  return [
    findDrop(species.ingredient0, input.ingredient0Id),
    findDrop(species.ingredient30, input.ingredient30Id),
    findDrop(species.ingredient60, input.ingredient60Id)
  ];
}

function findDrop(options: IngredientDrop[], ingredientId: string) {
  return options.find((drop) => drop.ingredientId === ingredientId) ?? options[0];
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

function averageIngredientSet(drops: IngredientDrop[], unlockedCount: number, amountBonus = 0) {
  const map = new Map<string, number>();
  for (const drop of drops.slice(0, unlockedCount)) {
    if (!drop || drop.amount <= 0 || drop.ingredientId === 'Locked') {
      continue;
    }
    map.set(drop.ingredientId, (map.get(drop.ingredientId) ?? 0) + (drop.amount + amountBonus) / unlockedCount);
  }
  return Array.from(map, ([ingredientId, amount]) => ({ ingredientId, amount }));
}

function splitProductionWindow(params: {
  awakeHelps: number;
  sleepHelps: number;
  inventoryLimit: number;
  ingredientProbability: number;
  berriesPerHelp: number;
  averageIngredientDrops: IngredientDrop[];
}) {
  const { awakeHelps, sleepHelps, inventoryLimit, ingredientProbability, berriesPerHelp, averageIngredientDrops } = params;
  const ingredientPiecesPerIngredientHelp = averageIngredientDrops.reduce((sum, drop) => sum + drop.amount, 0);
  const inventoryPiecesPerHelp =
    (1 - ingredientProbability) * berriesPerHelp + ingredientProbability * ingredientPiecesPerIngredientHelp;

  if (inventoryLimit <= 0 || inventoryPiecesPerHelp <= 0) {
    return {
      producingHelps: awakeHelps,
      awakeHelps,
      sleepProducingHelps: 0,
      sleepOverflowHelps: sleepHelps
    };
  }

  const sleepInventoryPieces = sleepHelps * inventoryPiecesPerHelp;
  if (sleepInventoryPieces <= inventoryLimit) {
    return {
      producingHelps: awakeHelps + sleepHelps,
      awakeHelps,
      sleepProducingHelps: sleepHelps,
      sleepOverflowHelps: 0
    };
  }

  const producingSleepHelps = inventoryLimit / inventoryPiecesPerHelp;
  return {
    producingHelps: awakeHelps + producingSleepHelps,
    awakeHelps,
    sleepProducingHelps: producingSleepHelps,
    sleepOverflowHelps: Math.max(0, sleepHelps - producingSleepHelps)
  };
}

function speedNatureMultiplier(positiveModifier: string, negativeModifier: string) {
  if (positiveModifier === 'speed') {
    return 0.9;
  }
  if (negativeModifier === 'speed') {
    return 1.075;
  }
  return 1;
}

function skillStockLimit(specialty: string) {
  return specialty === 'skill' || specialty === 'all' ? 2 : 1;
}

function skillPityCeiling(specialty: string, baseFrequency: number) {
  if (specialty === 'skill' || specialty === 'all') {
    return Math.max(1, Math.ceil(144_000 / baseFrequency));
  }
  return 78;
}

function skillProbabilityWithPity(probability: number, ceiling: number) {
  if (probability <= 0 || ceiling <= 0) {
    return probability;
  }
  const nonPityProbability = 1 - (1 - probability) ** ceiling;
  if (nonPityProbability <= 0) {
    return probability;
  }
  return clampProbability(probability / nonPityProbability);
}

function expectedCappedPoisson(lambda: number, cap: number) {
  if (lambda <= 0 || cap <= 0) {
    return 0;
  }

  let probability = Math.exp(-lambda);
  let cumulative = 0;
  let expected = 0;
  for (let k = 0; k < cap; k += 1) {
    if (k > 0) {
      probability *= lambda / k;
    }
    cumulative += probability;
    expected += k * probability;
  }

  return expected + cap * Math.max(0, 1 - cumulative);
}

function berriesPerDrop(specialty: string, subskillNames: Set<string>) {
  return (specialty === 'berry' || specialty === 'all' ? 2 : 1) +
    (subskillNames.has('Berry Finding S') ? 1 : 0);
}

function berryEnergyPerBerry(
  berryUnitEnergy: number,
  fieldMultiplier: number,
  favoriteMultiplier: number,
  sneakySnacking: boolean
) {
  if (sneakySnacking) {
    return Math.ceil(Math.ceil(berryUnitEnergy * fieldMultiplier) * favoriteMultiplier);
  }
  return Math.ceil(berryUnitEnergy * fieldMultiplier * favoriteMultiplier);
}

function activationEnergy(
  activation: MainSkillActivation,
  skillLevel: number,
  skillBerryUnitEnergy: number,
  produceEnergyPerHelp: number
) {
  const amount = activation.amounts[Math.min(skillLevel, activation.amounts.length) - 1] ?? 0;
  const unit = activation.unit.toLowerCase();
  if (DIRECT_ENERGY_UNITS.has(unit)) {
    return amount;
  }
  if (INGREDIENT_UNITS.has(unit)) {
    return amount * averageIngredientEnergy();
  }
  if (BERRY_UNITS.has(unit)) {
    return amount * skillBerryUnitEnergy;
  }
  if (HELP_UNITS.has(unit)) {
    return amount * produceEnergyPerHelp;
  }
  return 0;
}

function energyRecoveryPerTrigger(activations: MainSkillActivation[], skillLevel: number) {
  return activations.reduce((sum, activation) => {
    const unit = activation.unit.toLowerCase();
    if (!ENERGY_RECOVERY_UNITS.has(unit)) {
      return sum;
    }
    return sum + (activation.amounts[Math.min(skillLevel, activation.amounts.length) - 1] ?? 0);
  }, 0);
}

function averageIngredientEnergy() {
  const ingredients = Array.from(ingredientById.values()).filter((ingredient) => ingredient.energy > 0);
  return ingredients.reduce((sum, ingredient) => sum + ingredient.energy, 0) / ingredients.length;
}

function inventoryBonus(subskills: { name: string; amount: number }[]) {
  return subskills
    .filter((subskill) => subskill.name === 'Inventory Up S' || subskill.name === 'Inventory Up M' || subskill.name === 'Inventory Up L')
    .reduce((sum, subskill) => sum + subskill.amount, 0);
}

function baseInventoryLimit(species: { carrySize: number; previousEvolutions: number }) {
  return species.carrySize + species.previousEvolutions * 5;
}

function exSpeedTimeMultiplier(mapMode: CalcInput['mapMode'], legacyExMode: boolean, berryMode: string) {
  if (mapMode === 'normal' && !legacyExMode) {
    return 1;
  }
  if (berryMode === 'main') {
    return mapMode === 'cyanEx' ? 0.8 : 0.9;
  }
  if (berryMode === 'none') {
    return mapMode === 'cyanEx' ? 1.35 : 1.15;
  }
  return 1;
}

function exFavoriteMultiplier(berryMode: string, bonusMode: string) {
  if (berryMode === 'none') {
    return 1;
  }
  if (bonusMode === 'berry') {
    return 2.4;
  }
  return 2;
}

function exModeNote(mapMode: CalcInput['mapMode'], berryMode: string, bonusMode: string, ingredientBonus: number, skillMultiplier: number) {
  const berryLabel = berryMode === 'main' ? 'メインきのみ一致' : berryMode === 'sub' ? 'サブきのみ一致' : 'きのみ不一致';
  if (berryMode === 'none') {
    return 'EXモード（きのみ不一致）では、おてつだい時間' + (mapMode === 'cyanEx' ? 35 : 15) + '%増を反映し、対象きのみ効果は適用していません。';
  }
  const mainBonus = berryMode === 'main'
    ? mapMode === 'cyanEx'
      ? ' おてつだい時間20%短縮、最大所持数+5、スキルLv+1も反映しています。'
      : ' おてつだい時間10%短縮とスキルLv+1も反映しています。'
    : '';
  if (bonusMode === 'berry') {
    return `EXモード（${berryLabel}）では、対象きのみのエナジー倍率を2.4倍として計算しています。${mainBonus}`;
  }
  if (bonusMode === 'ingredient') {
    return `EXモード（${berryLabel}）では、食材おてつだい1回あたり+${ingredientBonus.toFixed(
      1
    )}個として計算しています。${mainBonus}`;
  }
  return `EXモード（${berryLabel}）では、スキル確率を${skillMultiplier.toFixed(2)}倍として計算しています。${mainBonus}`;
}

function clampProbability(value: number) {
  return Math.max(0, Math.min(0.95, value));
}

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) {
    throw new Error(`Missing ${label}`);
  }
  return value;
}

function cryptoRandomId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
