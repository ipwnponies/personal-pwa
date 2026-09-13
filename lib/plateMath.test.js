import { describe, test, expect } from 'vitest';
import {
  BAR_WEIGHT,
  AVAILABLE_PLATES,
  calculatePlatesPerSide,
} from './plateMath';

describe('BAR_WEIGHT', () => {
  test('exports lb and kg weights', () => {
    expect(BAR_WEIGHT.lb).toBe(45);
    expect(BAR_WEIGHT.kg).toBe(20);
  });
});

describe('AVAILABLE_PLATES', () => {
  test('exports lb plate set', () => {
    expect(AVAILABLE_PLATES.lb).toEqual([45, 35, 25, 10, 5, 2.5]);
  });

  test('exports kg plate set', () => {
    expect(AVAILABLE_PLATES.kg).toEqual([25, 20, 15, 10, 5, 2.5, 1.25]);
  });
});

describe('calculatePlatesPerSide', () => {
  describe('exact fit in lb', () => {
    test('target 225 lb yields exact combination with remainder 0', () => {
      const result = calculatePlatesPerSide(225, 'lb');
      // perSideWeight = (225 - 45) / 2 = 90
      // Can be loaded as [45, 45] or [45, 35, 10]
      expect(result.remainder).toBe(0);
      expect(result.plates.length).toBeGreaterThan(0);
      // Verify total of plates equals 90
      const total = result.plates.reduce((sum, plate) => sum + plate, 0);
      expect(total).toBeCloseTo(90, 5);
    });

    test('target 315 lb (two plates per side of 135 lb)', () => {
      const result = calculatePlatesPerSide(315, 'lb');
      // perSideWeight = (315 - 45) / 2 = 135
      // 135 = 45 + 45 + 45
      expect(result.remainder).toBe(0);
      const total = result.plates.reduce((sum, plate) => sum + plate, 0);
      expect(total).toBeCloseTo(135, 5);
    });

    test('target 185 lb (two plates per side of 70 lb)', () => {
      const result = calculatePlatesPerSide(185, 'lb');
      // perSideWeight = (185 - 45) / 2 = 70
      // 70 = 45 + 25
      expect(result.remainder).toBe(0);
      const total = result.plates.reduce((sum, plate) => sum + plate, 0);
      expect(total).toBeCloseTo(70, 5);
    });
  });

  describe('exact fit in kg', () => {
    test('target 100 kg yields exact combination with remainder 0', () => {
      const result = calculatePlatesPerSide(100, 'kg');
      // perSideWeight = (100 - 20) / 2 = 40
      // 40 = 25 + 15
      expect(result.remainder).toBe(0);
      expect(result.plates).toEqual([25, 15]);
    });

    test('target 120 kg yields exact combination', () => {
      const result = calculatePlatesPerSide(120, 'kg');
      // perSideWeight = (120 - 20) / 2 = 50
      // 50 = 25 + 25
      expect(result.remainder).toBe(0);
      const total = result.plates.reduce((sum, plate) => sum + plate, 0);
      expect(total).toBeCloseTo(50, 5);
    });

    test('target 80 kg yields exact combination', () => {
      const result = calculatePlatesPerSide(80, 'kg');
      // perSideWeight = (80 - 20) / 2 = 30
      // 30 = 25 + 5
      expect(result.remainder).toBe(0);
      const total = result.plates.reduce((sum, plate) => sum + plate, 0);
      expect(total).toBeCloseTo(30, 5);
    });
  });

  describe('remainder/unloadable cases', () => {
    test('target with fractional remainder returns non-zero remainder', () => {
      // 225.5 lb: perSideWeight = (225.5 - 45) / 2 = 90.25
      // 90.25 = 45 + 45 + 0.25 (remainder)
      const result = calculatePlatesPerSide(225.5, 'lb');
      expect(result.remainder).toBeGreaterThan(0);
      expect(result.remainder).toBeLessThan(2.5); // smallest plate is 2.5
    });

    test('target with 1 lb remainder', () => {
      // 227 lb: perSideWeight = (227 - 45) / 2 = 91
      // 91 = 45 + 45 + 1 (remainder)
      const result = calculatePlatesPerSide(227, 'lb');
      expect(result.remainder).toBeCloseTo(1, 5);
    });

    test('target with fractional remainder in kg', () => {
      // 100.5 kg: perSideWeight = (100.5 - 20) / 2 = 40.25
      // 40.25 = 25 + 15 + 0.25 (remainder)
      const result = calculatePlatesPerSide(100.5, 'kg');
      expect(result.remainder).toBeGreaterThan(0);
    });
  });

  describe('target at or below bar weight', () => {
    test('target equals bar weight (45 lb) returns empty plates and zero remainder', () => {
      const result = calculatePlatesPerSide(45, 'lb');
      expect(result.plates).toEqual([]);
      expect(result.remainder).toBe(0);
    });

    test('target below bar weight (40 lb) returns empty plates and zero remainder', () => {
      const result = calculatePlatesPerSide(40, 'lb');
      expect(result.plates).toEqual([]);
      expect(result.remainder).toBe(0);
    });

    test('target equals bar weight (20 kg) returns empty plates and zero remainder', () => {
      const result = calculatePlatesPerSide(20, 'kg');
      expect(result.plates).toEqual([]);
      expect(result.remainder).toBe(0);
    });

    test('target below bar weight (15 kg) returns empty plates and zero remainder', () => {
      const result = calculatePlatesPerSide(15, 'kg');
      expect(result.plates).toEqual([]);
      expect(result.remainder).toBe(0);
    });
  });

  describe('unit-scoped plate sets', () => {
    test('lb target never uses kg plate set', () => {
      const result = calculatePlatesPerSide(200, 'lb');
      // perSideWeight = (200 - 45) / 2 = 77.5
      // Can be loaded as 45 + 25 + 7.5 or similar, never with 1.25 kg plates
      for (const plate of result.plates) {
        expect(AVAILABLE_PLATES.lb).toContain(plate);
      }
    });

    test('kg target never uses lb plate set', () => {
      const result = calculatePlatesPerSide(90, 'kg');
      // perSideWeight = (90 - 20) / 2 = 35
      // 35 = 25 + 10
      for (const plate of result.plates) {
        expect(AVAILABLE_PLATES.kg).toContain(plate);
      }
    });
  });

  describe('greedy largest-to-smallest loading order', () => {
    test('plates array is ordered largest to smallest', () => {
      const result = calculatePlatesPerSide(225, 'lb');
      // perSideWeight = 90
      // Should load [45, 45] or [45, 35, 10]
      for (let i = 0; i < result.plates.length - 1; i++) {
        expect(result.plates[i]).toBeGreaterThanOrEqual(result.plates[i + 1]);
      }
    });

    test('greedy loading for 100 lb per side', () => {
      // target = 245 lb: perSideWeight = 100
      const result = calculatePlatesPerSide(245, 'lb');
      // 100 = 45 + 45 + 10
      expect(result.remainder).toBe(0);
      expect(result.plates).toEqual([45, 45, 10]);
    });

    test('greedy loading for 70 kg per side', () => {
      // target = 160 kg: perSideWeight = 70
      const result = calculatePlatesPerSide(160, 'kg');
      // 70 = 25 + 25 + 20
      expect(result.remainder).toBe(0);
      expect(result.plates).toEqual([25, 25, 20]);
    });
  });

  describe('epsilon-safe floating-point comparisons', () => {
    test('small floating-point error does not create spurious remainder', () => {
      // 2.5 kg plates can accumulate float error; test that epsilon handles it
      // This loads exactly: 25 + 25 + 20 = 70, but with potential float slop
      const result = calculatePlatesPerSide(160, 'kg');
      expect(result.remainder).toBeCloseTo(0, 5);
    });

    test('multiple 2.5 plate additions handle epsilon correctly', () => {
      // 45 lb: target = 50 lb, perSideWeight = 2.5 (one 2.5 plate)
      const result = calculatePlatesPerSide(50, 'lb');
      expect(result.plates).toEqual([2.5]);
      expect(result.remainder).toBeCloseTo(0, 5);
    });

    test('multiple small plates in sequence', () => {
      // target = 70 lb: perSideWeight = 12.5 = 10 + 2.5
      const result = calculatePlatesPerSide(70, 'lb');
      expect(result.remainder).toBeCloseTo(0, 5);
      const total = result.plates.reduce((sum, plate) => sum + plate, 0);
      expect(total).toBeCloseTo(12.5, 5);
    });
  });

  describe('return shape contract', () => {
    test('always returns object with plates and remainder properties', () => {
      const result = calculatePlatesPerSide(200, 'lb');
      expect(result).toHaveProperty('plates');
      expect(result).toHaveProperty('remainder');
      expect(Array.isArray(result.plates)).toBe(true);
      expect(typeof result.remainder).toBe('number');
    });

    test('remainder is never silently dropped', () => {
      // Even when remainder is non-zero, it must be in the return value
      const result = calculatePlatesPerSide(225.5, 'lb');
      expect('remainder' in result).toBe(true);
      expect(result.remainder).toBeGreaterThan(0);
    });
  });
});
