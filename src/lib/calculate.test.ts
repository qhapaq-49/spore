import { describe, expect, it } from 'vitest';
import { dataset } from '../data/dataset';
import { berryEnergyAtLevel, calculate, calculatePillowImpact, calculateWhistle } from './calculate';
import { simulateCookingChanceWeek } from './cooking-chance';
import { analyzeDistribution } from './distribution';
import { activeSubskillCountAtLevel, defaultInput, inputForSpecies, normalizeInput } from './input';

describe('defaultInput', () => {
  it('starts with favorite berry matching off', () => {
    const species = dataset.pokemon.find((pokemon) => pokemon.id === 'RAICHU') ?? dataset.pokemon[0];
    expect(defaultInput(species).favoriteBerry).toBe(false);
  });

  it('resets favorite berry matching when switching species', () => {
    const from = dataset.pokemon.find((pokemon) => pokemon.id === 'RAICHU') ?? dataset.pokemon[0];
    const to = dataset.pokemon.find((pokemon) => pokemon.id === 'DRAGONITE') ?? dataset.pokemon[0];

    expect(inputForSpecies({ ...defaultInput(from), favoriteBerry: true }, to).favoriteBerry).toBe(false);
  });

  it('clamps inputs to the current Pokemon and field bonus caps', () => {
    const species = dataset.pokemon.find((pokemon) => pokemon.id === 'RAICHU') ?? dataset.pokemon[0];
    const normalized = normalizeInput({ ...defaultInput(species), level: 999, fieldBonus: 999 }, species);

    expect(normalized.level).toBe(70);
    expect(normalized.fieldBonus).toBe(85);
  });
});

describe('berryEnergyAtLevel', () => {
  it('uses the level berry energy curve', () => {
    expect(berryEnergyAtLevel(24, 1)).toBe(24);
    expect(berryEnergyAtLevel(24, 2)).toBe(25);
    expect(berryEnergyAtLevel(25, 60)).toBe(107);
  });
});

describe('activeSubskillCountAtLevel', () => {
  it('uses the current 10/25/50/70/80 unlock levels', () => {
    expect(activeSubskillCountAtLevel(9)).toBe(0);
    expect(activeSubskillCountAtLevel(10)).toBe(1);
    expect(activeSubskillCountAtLevel(25)).toBe(2);
    expect(activeSubskillCountAtLevel(50)).toBe(3);
    expect(activeSubskillCountAtLevel(69)).toBe(3);
    expect(activeSubskillCountAtLevel(70)).toBe(4);
    expect(activeSubskillCountAtLevel(80)).toBe(5);
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

  it('uses only subskills unlocked at the current level in selection order', () => {
    const species = dataset.pokemon.find((pokemon) => pokemon.id === 'RAICHU') ?? dataset.pokemon[0];
    const base = calculate({ ...defaultInput(species), level: 10 });
    const lockedBfs = calculate({
      ...defaultInput(species),
      level: 10,
      subskillIds: ['Sleep EXP Bonus', 'Berry Finding S']
    });
    const unlockedBfs = calculate({
      ...defaultInput(species),
      level: 25,
      subskillIds: ['Sleep EXP Bonus', 'Berry Finding S']
    });

    expect(lockedBfs.berriesPerHelp).toBe(base.berriesPerHelp);
    expect(unlockedBfs.berriesPerHelp).toBe(base.berriesPerHelp + 1);
  });

  it('removes ingredient and skill production from sleep overflow helps', () => {
    const species = dataset.pokemon.find((pokemon) => pokemon.id === 'CRAMORANT') ?? dataset.pokemon[0];
    const base = calculate({ ...defaultInput(species), level: 60, energyMode: 'constant80' });
    const largerInventory = calculate({
      ...defaultInput(species),
      level: 60,
      energyMode: 'constant80',
      subskillIds: ['Inventory Up L']
    });

    expect(base.sleepOverflowHelps).toBeGreaterThan(0);
    expect(largerInventory.sleepOverflowHelps).toBeLessThan(base.sleepOverflowHelps);
    expect(largerInventory.expectedSkillTriggers).toBeGreaterThan(base.expectedSkillTriggers);
  });

  it('does not vary inventory by the individual evolution count input', () => {
    const species = dataset.pokemon.find((pokemon) => pokemon.id === 'VENUSAUR') ?? dataset.pokemon[0];
    const directCaught = calculate({ ...defaultInput(species), evolutionCount: 0 });
    const evolvedTwice = calculate({ ...defaultInput(species), evolutionCount: 2 });

    expect(evolvedTwice.inventoryLimit).toBe(directCaught.inventoryLimit);
    expect(directCaught.inventoryLimit).toBe(species.carrySize + species.previousEvolutions * 5);
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

  it('applies Wakakusa EX map speed down for non-matching berries', () => {
    const species = dataset.pokemon.find((pokemon) => pokemon.id === 'RAICHU') ?? dataset.pokemon[0];
    const normal = calculate({ ...defaultInput(species), exMode: false, mapMode: 'normal' });
    const exNonMatch = calculate({
      ...defaultInput(species),
      exMode: false,
      mapMode: 'wakakusaEx',
      exBerryMode: 'none',
      exBonusMode: 'berry'
    });
    const exMain = calculate({
      ...defaultInput(species),
      exMode: false,
      mapMode: 'wakakusaEx',
      exBerryMode: 'main',
      exBonusMode: 'berry'
    });

    expect(exNonMatch.displayedFrequency).toBeGreaterThan(normal.displayedFrequency);
    expect(exNonMatch.totalEnergy).toBeLessThan(normal.totalEnergy);
    expect(exMain.displayedFrequency).toBeLessThan(normal.displayedFrequency);
  });

  it('applies Cyan EX speed and inventory modifiers', () => {
    const species = dataset.pokemon.find((pokemon) => pokemon.id === 'RAICHU') ?? dataset.pokemon[0];
    const normal = calculate({ ...defaultInput(species), mapMode: 'normal' });
    const wakakusaMain = calculate({ ...defaultInput(species), mapMode: 'wakakusaEx', exBerryMode: 'main' });
    const cyanMain = calculate({ ...defaultInput(species), mapMode: 'cyanEx', exBerryMode: 'main' });
    const wakakusaNone = calculate({ ...defaultInput(species), mapMode: 'wakakusaEx', exBerryMode: 'none' });
    const cyanNone = calculate({ ...defaultInput(species), mapMode: 'cyanEx', exBerryMode: 'none' });

    expect(cyanMain.displayedFrequency).toBeLessThan(wakakusaMain.displayedFrequency);
    expect(cyanMain.inventoryLimit).toBe(normal.inventoryLimit + 5);
    expect(cyanNone.displayedFrequency).toBeGreaterThan(wakakusaNone.displayedFrequency);
    expect(cyanMain.notes.some((note) => note.includes('最大所持数+5'))).toBe(true);
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

  it('converts berry-producing skills with favorite berry and field bonuses', () => {
    const species = dataset.pokemon.find((pokemon) => pokemon.id === 'SCEPTILE') ?? dataset.pokemon[0];
    const baseInput = { ...defaultInput(species), level: 60, skillLevel: 6 };
    const base = calculate({ ...baseInput, favoriteBerry: false, fieldBonus: 0 });
    const favorite = calculate({ ...baseInput, favoriteBerry: true, fieldBonus: 0 });
    const field = calculate({ ...baseInput, favoriteBerry: false, fieldBonus: 50 });

    expect(favorite.skillEnergy).toBeGreaterThan(base.skillEnergy * 1.9);
    expect(field.skillEnergy).toBeGreaterThan(base.skillEnergy * 1.4);
  });

  it('supports morning energy pillow as an individual expected value condition', () => {
    const species = dataset.pokemon.find((pokemon) => pokemon.id === 'RAICHU') ?? dataset.pokemon[0];
    const baseInput = { ...defaultInput(species), level: 60 };
    const normal = calculate({ ...baseInput, energyMode: 'normal' });
    const pillow = calculate({ ...baseInput, energyMode: 'morningPillow' });

    expect(pillow.helpsPerDay).toBeGreaterThan(normal.helpsPerDay);
    expect(pillow.totalEnergy).toBeGreaterThan(normal.totalEnergy);
    expect(pillow.notes.some((note) => note.includes('げんきマクラ1個'))).toBe(true);
  });
});

describe('score attack tools', () => {
  it('calculates whistle output as three hours per item without skill energy', () => {
    const species = dataset.pokemon.find((pokemon) => pokemon.id === 'RAICHU') ?? dataset.pokemon[0];
    const one = calculateWhistle(defaultInput(species), 1);
    const three = calculateWhistle(defaultInput(species), 3);

    expect(one.totalEnergy).toBeGreaterThan(0);
    expect(one.helpsPerWhistle).toBeGreaterThan(0);
    expect(three.totalEnergy).toBeCloseTo(one.totalEnergy * 3, 6);
    expect(one.notes.some((note) => note.includes('メインスキル'))).toBe(true);
  });

  it('calculates the day-production gain from an energy pillow', () => {
    const species = dataset.pokemon.find((pokemon) => pokemon.id === 'SCEPTILE') ?? dataset.pokemon[0];
    const result = calculatePillowImpact({ ...defaultInput(species), level: 60, skillLevel: 6 }, 100, 1, 15.5);

    expect(result.afterEnergy).toBe(150);
    expect(result.after.totalEnergy).toBeGreaterThan(result.before.totalEnergy);
    expect(result.gain.totalEnergy).toBeGreaterThan(0);
  });

  it('simulates cooking chance weekly score distribution', () => {
    const none = simulateCookingChanceWeek({ sources: [], baseMealScore: 10_000, weeks: 2_000, seed: 1 });
    const tasty = simulateCookingChanceWeek({
      sources: [{ id: 'tasty', label: '料理チャンス', triggersPerDay: 2, chancePercent: 6 }],
      baseMealScore: 10_000,
      weeks: 2_000,
      seed: 1
    });

    expect(tasty.meanScore).toBeGreaterThan(none.meanScore);
    expect(tasty.scoreHistogram.length).toBeGreaterThan(0);
    expect(tasty.histogram.reduce((sum, bin) => sum + bin.count, 0)).toBe(2_000);
  });
});

describe('distribution analysis', () => {
  it('reports ingredient distribution as the total count only', () => {
    const species = dataset.pokemon.find((pokemon) => pokemon.id === 'DRAGONITE') ?? dataset.pokemon[0];
    const input = { ...defaultInput(species), level: 60, favoriteBerry: false };
    const result = calculate(input);
    const analysis = analyzeDistribution(result, input, species, { helpingBonusTeamValue: false, goldFixedSlots: 0 });

    expect(analysis.ranks.some((rank) => rank.id === 'ingredientTotal')).toBe(true);
    expect(analysis.ranks.some((rank) => rank.id.startsWith('ingredient:'))).toBe(false);
  });

  it('uses the current skill level when building the comparison population', () => {
    const species = dataset.pokemon.find((pokemon) => pokemon.id === 'DRAGONITE') ?? dataset.pokemon[0];
    const lowSkillInput = { ...defaultInput(species), level: 60, skillLevel: 1 };
    const highSkillInput = { ...defaultInput(species), level: 60, skillLevel: 6 };
    const low = analyzeDistribution(calculate(lowSkillInput), lowSkillInput, species, { helpingBonusTeamValue: false, goldFixedSlots: 0 });
    const high = analyzeDistribution(calculate(highSkillInput), highSkillInput, species, { helpingBonusTeamValue: false, goldFixedSlots: 0 });

    expect(high.scenario?.metrics.skillTriggers.mean).toBeGreaterThan(low.scenario?.metrics.skillTriggers.mean ?? 0);
  });
});
