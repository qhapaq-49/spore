import { describe, expect, it } from 'vitest';
import { distributionShape, percentileOf } from './distribution';
import type { DistributionMetric } from '../types';

describe('percentileOf', () => {
  const metric: DistributionMetric = {
    label: 'test',
    unit: '',
    precision: 0,
    min: 0,
    max: 100,
    mean: 50,
    quantiles: [0, 25, 50, 75, 100]
  };

  it('maps a value onto the empirical quantile index', () => {
    expect(percentileOf(metric, -1)).toBe(0);
    expect(percentileOf(metric, 0)).toBe(0);
    expect(percentileOf(metric, 50)).toBe(50);
    expect(percentileOf(metric, 80)).toBe(75);
    expect(percentileOf(metric, 100)).toBe(100);
  });

  it('summarizes the quantile shape for a compact chart', () => {
    const shape = distributionShape(metric, 75, 5);

    expect(shape.markerPercent).toBe(75);
    expect(shape.median).toBe(50);
    expect(shape.bins).toHaveLength(5);
    expect(shape.bins.some((bin) => bin.height > 0)).toBe(true);
  });
});
