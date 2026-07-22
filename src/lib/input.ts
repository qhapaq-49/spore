import { dataset } from '../data/dataset';
import type { CalcInput, EnergyMode, ExBerryMode, ExBonusMode, MapMode, PokemonSpecies } from '../types';

const DEFAULT_NATURE_ID = 'Bashful';
const ENERGY_MODES = new Set<EnergyMode>(['normal', 'morningPillow', 'constant80']);
const EX_BERRY_MODES = new Set<ExBerryMode>(['none', 'main', 'sub']);
const EX_BONUS_MODES = new Set<ExBonusMode>(['berry', 'ingredient', 'skill']);
const MAP_MODES = new Set<MapMode>(['normal', 'wakakusaEx']);

export function firstPlayableSpecies() {
  const species = dataset.pokemon.find((pokemon) => pokemon.id === 'VENUSAUR') ?? dataset.pokemon[0];
  if (!species) {
    throw new Error('Pokemon dataset is empty. Run npm run update-data first.');
  }
  return species;
}

export function defaultInput(species: PokemonSpecies = firstPlayableSpecies()): CalcInput {
  const ingredient0 = species.ingredient0.find((drop) => drop.amount > 0) ?? species.ingredient0[0];
  const ingredient30 = species.ingredient30.find((drop) => drop.amount > 0) ?? species.ingredient30[0] ?? ingredient0;
  const ingredient60 = species.ingredient60.find((drop) => drop.amount > 0) ?? species.ingredient60[0] ?? ingredient30;

  return {
    speciesId: species.id,
    level: 50,
    ingredient0Id: ingredient0?.ingredientId ?? '',
    ingredient30Id: ingredient30?.ingredientId ?? '',
    ingredient60Id: ingredient60?.ingredientId ?? '',
    skillLevel: 1,
    evolutionCount: 0,
    helpingBonusCount: 0,
    subskillIds: [],
    natureId: DEFAULT_NATURE_ID,
    energyMode: 'normal',
    favoriteBerry: false,
    exMode: false,
    exBerryMode: 'main',
    exBonusMode: 'berry',
    mapMode: 'normal',
    goodCamp: false,
    fieldBonus: 0
  };
}

export function inputForSpecies(previous: CalcInput, species: PokemonSpecies): CalcInput {
  const next = defaultInput(species);
  return {
    ...previous,
    speciesId: species.id,
    ingredient0Id: next.ingredient0Id,
    ingredient30Id: next.ingredient30Id,
    ingredient60Id: next.ingredient60Id,
    evolutionCount: 0,
    favoriteBerry: next.favoriteBerry,
    skillLevel: Math.min(previous.skillLevel, 8)
  };
}

export function normalizeInput(input: CalcInput, species: PokemonSpecies): CalcInput {
  const fallback = defaultInput(species);
  const { excludeSelfEnergySkill: _unused, ...rawInput } = input as CalcInput & { excludeSelfEnergySkill?: boolean };
  return {
    ...rawInput,
    level: clampInt(rawInput.level, 1, 100),
    skillLevel: clampInt(rawInput.skillLevel, 1, 8),
    evolutionCount: clampInt(rawInput.evolutionCount, 0, 2),
    helpingBonusCount: clampInt(rawInput.helpingBonusCount, 0, 4),
    fieldBonus: clampInt(rawInput.fieldBonus, 0, 100),
    energyMode: ENERGY_MODES.has(rawInput.energyMode) ? rawInput.energyMode : fallback.energyMode,
    exBerryMode: EX_BERRY_MODES.has(rawInput.exBerryMode) ? rawInput.exBerryMode : fallback.exBerryMode,
    exBonusMode: EX_BONUS_MODES.has(rawInput.exBonusMode) ? rawInput.exBonusMode : fallback.exBonusMode,
    mapMode: MAP_MODES.has(rawInput.mapMode) ? rawInput.mapMode : fallback.mapMode,
    favoriteBerry: booleanOrDefault(rawInput.favoriteBerry, fallback.favoriteBerry),
    exMode: booleanOrDefault(rawInput.exMode, fallback.exMode),
    goodCamp: booleanOrDefault(rawInput.goodCamp, fallback.goodCamp),
    ingredient0Id: ensureIngredient(species.ingredient0, rawInput.ingredient0Id, fallback.ingredient0Id),
    ingredient30Id: ensureIngredient(species.ingredient30, rawInput.ingredient30Id, fallback.ingredient30Id),
    ingredient60Id: ensureIngredient(species.ingredient60, rawInput.ingredient60Id, fallback.ingredient60Id)
  };
}

export function activeSubskillCountAtLevel(level: number) {
  if (level >= 80) {
    return 5;
  }
  if (level >= 70) {
    return 4;
  }
  if (level >= 50) {
    return 3;
  }
  if (level >= 25) {
    return 2;
  }
  if (level >= 10) {
    return 1;
  }
  return 0;
}

function ensureIngredient(options: { ingredientId: string }[], value: string, fallback: string) {
  return options.some((option) => option.ingredientId === value) ? value : fallback;
}

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.round(value)));
}

function booleanOrDefault(value: boolean, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}
