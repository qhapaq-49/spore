import { describe, expect, it } from 'vitest';

import {
  candyExpAtLevel,
  dreamShardsPerCandy,
  inferCandyExpType,
  simulateCandyPlanQueue,
  simulateCandyUse
} from './candy';

describe('candy simulation', () => {
  it('uses the current level candy exp bands and nature modifiers', () => {
    expect(candyExpAtLevel(1, 'neutral', 'none')).toBe(40);
    expect(candyExpAtLevel(25, 'neutral', 'none')).toBe(35);
    expect(candyExpAtLevel(30, 'neutral', 'none')).toBe(25);
    expect(candyExpAtLevel(30, 'up', 'none')).toBe(30);
    expect(candyExpAtLevel(30, 'down', 'none')).toBe(21);
  });

  it('uses dream shard cost at the current level and boost multiplier', () => {
    expect(dreamShardsPerCandy(1, 'none')).toBe(14);
    expect(dreamShardsPerCandy(30, 'none')).toBe(122);
    expect(dreamShardsPerCandy(30, 'mini')).toBe(488);
    expect(dreamShardsPerCandy(30, 'custom', 6)).toBe(732);
    expect(dreamShardsPerCandy(66, 'none')).toBe(1004);
    expect(dreamShardsPerCandy(70, 'none')).toBe(1382);
  });

  it('simulates candies one by one until a target level is reached', () => {
    const result = simulateCandyUse({
      currentLevel: 1,
      currentExp: 0,
      targetLevel: 2,
      expType: 600,
      expNature: 'neutral',
      boostMode: 'none'
    });

    expect(result.usedCandy).toBe(2);
    expect(result.usedShards).toBe(28);
    expect(result.finalLevel).toBe(2);
    expect(result.finalExp).toBe(26);
    expect(result.targetReached).toBe(true);
  });

  it('answers the fixed candy budget case', () => {
    const result = simulateCandyUse({
      currentLevel: 24,
      currentExp: 0,
      targetLevel: 30,
      expType: 600,
      expNature: 'neutral',
      boostMode: 'none',
      candyLimit: 18
    });

    expect(result.usedCandy).toBe(18);
    expect(result.finalLevel).toBe(25);
    expect(result.finalExp).toBe(105);
    expect(result.stoppedBy).toBe('candy');
  });

  it('infers slow exp species lines', () => {
    expect(inferCandyExpType('BAGON')).toBe(900);
    expect(inferCandyExpType('RAIKOU')).toBe(1080);
    expect(inferCandyExpType('DARKRAI')).toBe(1320);
    expect(inferCandyExpType('PIKACHU')).toBe(600);
  });

  it('spends a shared shard budget across multiple plans in order', () => {
    const queue = simulateCandyPlanQueue(
      [
        {
          id: 'a',
          speciesId: 'PIKACHU',
          label: 'A',
          currentLevel: 1,
          currentExp: 0,
          targetLevel: 3,
          expType: 600,
          expNature: 'neutral',
          boostMode: 'none',
          candyLimit: 99
        },
        {
          id: 'b',
          speciesId: 'PIKACHU',
          label: 'B',
          currentLevel: 1,
          currentExp: 0,
          targetLevel: 2,
          expType: 600,
          expNature: 'neutral',
          boostMode: 'none',
          candyLimit: 99
        }
      ],
      70
    );

    expect(queue.totals.budgetCandy).toBe(4);
    expect(queue.totals.budgetShards).toBe(64);
    expect(queue.totals.targetReachedCount).toBe(1);
    expect(queue.results[1].budget.finalLevel).toBe(1);
  });

  it('supports budget-mode plans that spend a fixed candy amount', () => {
    const queue = simulateCandyPlanQueue(
      [
        {
          id: 'budget',
          speciesId: 'PIKACHU',
          label: 'Budget',
          mode: 'budget',
          currentLevel: 1,
          currentExp: 0,
          targetLevel: 70,
          expType: 600,
          expNature: 'neutral',
          boostMode: 'none',
          candyLimit: 3
        }
      ],
      0
    );

    expect(queue.totals.targetCandy).toBe(3);
    expect(queue.totals.budgetCandy).toBe(3);
    expect(queue.totals.targetReachedCount).toBe(1);
    expect(queue.results[0].budget.stoppedBy).toBe('candy');
  });

});
