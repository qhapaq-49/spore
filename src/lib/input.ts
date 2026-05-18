import { dataset } from '../data/dataset';
import type { CalcInput, PokemonSpecies } from '../types';

const DEFAULT_NATURE_ID = 'Bashful';

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
    evolutionCount: Math.min(2, species.previousEvolutions),
    helpingBonusCount: 0,
    subskillIds: [],
    natureId: DEFAULT_NATURE_ID,
    energyMode: 'normal',
    excludeSelfEnergySkill: false,
    favoriteBerry: true,
    exMode: false,
    exBerryMode: 'main',
    exBonusMode: 'berry',
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
    evolutionCount: Math.min(2, species.previousEvolutions),
    skillLevel: Math.min(previous.skillLevel, 8)
  };
}

export function normalizeInput(input: CalcInput, species: PokemonSpecies): CalcInput {
  const fallback = defaultInput(species);
  return {
    ...input,
    level: clampInt(input.level, 1, 100),
    skillLevel: clampInt(input.skillLevel, 1, 8),
    evolutionCount: clampInt(input.evolutionCount, 0, 2),
    helpingBonusCount: clampInt(input.helpingBonusCount, 0, 4),
    fieldBonus: clampInt(input.fieldBonus, 0, 100),
    ingredient0Id: ensureIngredient(species.ingredient0, input.ingredient0Id, fallback.ingredient0Id),
    ingredient30Id: ensureIngredient(species.ingredient30, input.ingredient30Id, fallback.ingredient30Id),
    ingredient60Id: ensureIngredient(species.ingredient60, input.ingredient60Id, fallback.ingredient60Id)
  };
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
