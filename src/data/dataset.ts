import rawDataset from './pokemon-sleep.generated.json';
import type {
  Berry,
  Ingredient,
  MainSkill,
  Nature,
  PokemonSleepDataset,
  PokemonSpecies,
  Subskill
} from '../types';

export const dataset = rawDataset as PokemonSleepDataset;

export const pokemonById = mapById<PokemonSpecies>(dataset.pokemon);
export const ingredientById = mapById<Ingredient>(dataset.ingredients);
export const berryById = mapById<Berry>(dataset.berries);
export const natureById = mapById<Nature>(dataset.natures);
export const subskillById = mapById<Subskill>(dataset.subskills);
export const mainSkillById = mapById<MainSkill>(dataset.mainSkills);

function mapById<T extends { id: string }>(items: T[]) {
  return new Map(items.map((item) => [item.id, item]));
}

