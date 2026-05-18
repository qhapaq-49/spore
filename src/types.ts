export type Specialty = 'berry' | 'ingredient' | 'skill' | 'all';

export interface Ingredient {
  id: string;
  name: string;
  nameJa: string;
  energy: number;
}

export interface Berry {
  id: string;
  name: string;
  nameJa: string;
  type: string;
  energy: number;
}

export interface IngredientDrop {
  ingredientId: string;
  amount: number;
}

export interface MainSkillActivation {
  name: string;
  unit: string;
  amounts: number[];
}

export interface MainSkill {
  id: string;
  name: string;
  nameJa: string;
  maxLevel: number;
  activations: MainSkillActivation[];
}

export interface Nature {
  id: string;
  name: string;
  nameJa: string;
  positiveModifier: string;
  negativeModifier: string;
  frequency: number;
  ingredient: number;
  skill: number;
  energy: number;
  exp: number;
}

export interface Subskill {
  id: string;
  name: string;
  nameJa: string;
  shortName: string;
  amount: number;
  rarity: string;
}

export interface PokemonSpecies {
  id: string;
  name: string;
  displayName: string;
  displayNameJa: string;
  pokedexNumber: number;
  specialty: Specialty;
  frequency: number;
  ingredientPercentage: number;
  skillPercentage: number;
  berryId: string;
  carrySize: number;
  previousEvolutions: number;
  remainingEvolutions: number;
  ingredient0: IngredientDrop[];
  ingredient30: IngredientDrop[];
  ingredient60: IngredientDrop[];
  skillId: string;
}

export interface PokemonSleepDataset {
  generatedAt: string;
  source: {
    name: string;
    url: string;
    commit: string;
  };
  pokemon: PokemonSpecies[];
  ingredients: Ingredient[];
  berries: Berry[];
  mainSkills: MainSkill[];
  natures: Nature[];
  subskills: Subskill[];
}

export type EnergyMode = 'normal' | 'constant80';
export type ExBerryMode = 'none' | 'main' | 'sub';
export type ExBonusMode = 'berry' | 'ingredient' | 'skill';

export interface CalcInput {
  speciesId: string;
  level: number;
  ingredient0Id: string;
  ingredient30Id: string;
  ingredient60Id: string;
  skillLevel: number;
  evolutionCount: number;
  helpingBonusCount: number;
  subskillIds: string[];
  natureId: string;
  energyMode: EnergyMode;
  excludeSelfEnergySkill: boolean;
  favoriteBerry: boolean;
  exMode: boolean;
  exBerryMode: ExBerryMode;
  exBonusMode: ExBonusMode;
  goodCamp: boolean;
  fieldBonus: number;
}

export interface IngredientBreakdown {
  ingredientId: string;
  amount: number;
  energy: number;
}

export interface CalcResult {
  id: string;
  createdAt: string;
  speciesId: string;
  speciesName: string;
  level: number;
  totalEnergy: number;
  berryEnergy: number;
  ingredientEnergy: number;
  skillEnergy: number;
  helpsPerDay: number;
  displayedFrequency: number;
  inventoryLimit: number;
  ingredientProbability: number;
  skillProbability: number;
  expectedSkillTriggers: number;
  berriesPerHelp: number;
  sleepHours: number;
  sleepOverflowHelps: number;
  sleepSkillStockLimit: number;
  sleepSkillTriggers: number;
  selectedIngredients: IngredientDrop[];
  ingredientBreakdown: IngredientBreakdown[];
  notes: string[];
}
