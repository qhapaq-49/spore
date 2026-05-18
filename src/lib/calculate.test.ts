import { describe, expect, it } from 'vitest';
import { dataset } from '../data/dataset';
import { calculate, berryEnergyAtLevel } from './calculate';
import { defaultInput } from './input';

describe('berryEnergyAtLevel', () => {
  it('uses the level berry energy curve', () => {
    expect(berryEnergyAtLevel(24, 1)).toBe(24);
    expect(berryEnergyAtLevel(24, 2)).toBe(25);
    expect(berryEnergyAtLevel(25, 60)).toBe(107);
  });
});

describe('calculate', () => {
  it('produces a positive deterministic result for a representative pokemon', () => {
    const species = dataset.pokemon.find((pokemon) => pokemon.id === 'VENUSAUR') ?? dataset.pokemon[0];
    expect(species).toBeDefined();

    const result = calculate({
      ...defaultInput(species),
      level: 50,
      skillLevel: 3,
      fieldBonus: 20,
      subskillIds: ['Helping Speed M', 'Ingredient Finder M']
    });

    expect(result.totalEnergy).toBeGreaterThan(0);
    expect(result.helpsPerDay).toBeGreaterThan(0);
    expect(result.ingredientProbability).toBeGreaterThan(species.ingredientPercentage / 100);
    expect(result.displayedFrequency).toBeLessThan(species.frequency);
  });

  it('increases berry output with Berry Finding S', () => {
    const species = dataset.pokemon.find((pokemon) => pokemon.id === 'RAICHU') ?? dataset.pokemon[0];
    const base = calculate(defaultInput(species));
    const bfs = calculate({ ...defaultInput(species), subskillIds: ['Berry Finding S'] });

    expect(bfs.berriesPerHelp).toBe(base.berriesPerHelp + 1);
    expect(bfs.berryEnergy).toBeGreaterThan(base.berryEnergy);
  });

  it('applies the target pokemon Helping Bonus subskill to help speed', () => {
    const species = dataset.pokemon.find((pokemon) => pokemon.id === 'RAICHU') ?? dataset.pokemon[0];
    const base = calculate(defaultInput(species));
    const helpingBonus = calculate({ ...defaultInput(species), subskillIds: ['Helping Bonus'] });

    expect(helpingBonus.displayedFrequency).toBeLessThan(base.displayedFrequency);
    expect(helpingBonus.helpsPerDay).toBeGreaterThan(base.helpsPerDay);
    expect(helpingBonus.totalEnergy).toBeGreaterThan(base.totalEnergy);
  });

  it('removes ingredient and skill production from sleep overflow helps', () => {
    const species = dataset.pokemon.find((pokemon) => pokemon.id === 'CRAMORANT') ?? dataset.pokemon[0];
    const base = calculate({ ...defaultInput(species), level: 60, energyMode: 'constant80' });
    const largerInventory = calculate({
      ...defaultInput(species),
      level: 60,
      energyMode: 'constant80',
      evolutionCount: 2,
      subskillIds: ['Inventory Up L']
    });

    expect(base.sleepOverflowHelps).toBeGreaterThan(0);
    expect(largerInventory.sleepOverflowHelps).toBeLessThan(base.sleepOverflowHelps);
    expect(largerInventory.expectedSkillTriggers).toBeGreaterThan(base.expectedSkillTriggers);
  });

  it('includes the skill pity ceiling in expected skill triggers', () => {
    const species = dataset.pokemon.find((pokemon) => pokemon.id === 'RAICHU') ?? dataset.pokemon[0];
    const result = calculate(defaultInput(species));

    expect(result.skillProbability).toBeGreaterThan(species.skillPercentage / 100);
    expect(result.notes.some((note) => note.includes('スキル連続不発天井'))).toBe(true);
  });

  it('applies EX berry mode above normal favorite berry matching', () => {
    const species = dataset.pokemon.find((pokemon) => pokemon.id === 'RAICHU') ?? dataset.pokemon[0];
    const normal = calculate({ ...defaultInput(species), favoriteBerry: true, exMode: false });
    const ex = calculate({ ...defaultInput(species), exMode: true, exBerryMode: 'main', exBonusMode: 'berry' });

    expect(ex.berryEnergy).toBeGreaterThan(normal.berryEnergy);
    expect(ex.displayedFrequency).toBeLessThan(normal.displayedFrequency);
  });

  it('applies EX skill and ingredient effects only when selected', () => {
    const species = dataset.pokemon.find((pokemon) => pokemon.id === 'VENUSAUR') ?? dataset.pokemon[0];
    const base = calculate({ ...defaultInput(species), exMode: true, exBerryMode: 'sub', exBonusMode: 'berry' });
    const skill = calculate({ ...defaultInput(species), exMode: true, exBerryMode: 'sub', exBonusMode: 'skill' });
    const ingredient = calculate({ ...defaultInput(species), exMode: true, exBerryMode: 'sub', exBonusMode: 'ingredient' });

    expect(skill.skillProbability).toBeGreaterThan(base.skillProbability);
    expect(ingredient.ingredientBreakdown.reduce((sum, item) => sum + item.amount, 0)).toBeGreaterThan(
      base.ingredientBreakdown.reduce((sum, item) => sum + item.amount, 0)
    );
  });
});
