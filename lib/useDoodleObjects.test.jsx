import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDoodleObjects } from './useDoodleObjects';

const seq = (values) => {
  let i = 0;
  return () => {
    const v = values[i % values.length];
    i += 1;
    return v;
  };
};

beforeEach(() => localStorage.clear());

describe('useDoodleObjects', () => {
  it('spawnShape appends a shape', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.2])));
    act(() => result.current.spawnShape(10, 20));
    expect(result.current.objects).toHaveLength(1);
    expect(result.current.objects[0].kind).toBe('shape');
  });

  it('startStroke then appendStrokePoint builds a stroke', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.2])));
    let id;
    act(() => { id = result.current.startStroke(0, 0); });
    act(() => result.current.appendStrokePoint(id, 5, 5));
    const stroke = result.current.objects.find((o) => o.id === id);
    expect(stroke.kind).toBe('stroke');
    expect(stroke.points).toHaveLength(2);
  });

  it('moveShape updates coordinates', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.2])));
    let shape;
    act(() => { shape = result.current.spawnShape(0, 0); });
    act(() => result.current.moveShape(shape.id, 99, 88));
    const moved = result.current.objects.find((o) => o.id === shape.id);
    expect(moved.x).toBe(99);
    expect(moved.y).toBe(88);
  });

  it('popShape replaces a large shape with smaller children', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.9])));
    let shape;
    act(() => { shape = result.current.spawnShape(0, 0); });
    act(() => result.current.moveShape(shape.id, 0, 0));
    // force a large size so it splits
    act(() => { result.current.objects[0].size = 70; });
    act(() => result.current.popShape(shape.id));
    expect(result.current.objects.find((o) => o.id === shape.id)).toBeUndefined();
    expect(result.current.objects.length).toBeGreaterThanOrEqual(3);
  });

  it('advance moves non-grabbed shapes and skips the grabbed one', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.5])));
    let a;
    let b;
    act(() => { a = result.current.spawnShape(100, 100); });
    act(() => { b = result.current.spawnShape(200, 200); });
    const before = result.current.objects.find((o) => o.id === b.id);
    act(() => result.current.advance(1, { width: 1000, height: 1000 }, b.id));
    const afterA = result.current.objects.find((o) => o.id === a.id);
    const afterB = result.current.objects.find((o) => o.id === b.id);
    expect(afterB.x).toBe(before.x); // grabbed shape unchanged
    expect(afterA.x !== 100 || afterA.y !== 100).toBe(true); // moved
  });

  it('clear empties the array', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.2])));
    act(() => result.current.spawnShape(0, 0));
    act(() => result.current.clear());
    expect(result.current.objects).toHaveLength(0);
  });

  it('persists to localStorage and restores on a fresh hook (debounced)', () => {
    vi.useFakeTimers();
    const first = renderHook(() => useDoodleObjects(seq([0.2])));
    act(() => first.result.current.spawnShape(7, 8));
    act(() => vi.advanceTimersByTime(1000)); // flush debounce
    first.unmount();

    const second = renderHook(() => useDoodleObjects(seq([0.2])));
    expect(second.result.current.objects).toHaveLength(1);
    expect(second.result.current.objects[0].x).toBe(7);
    vi.useRealTimers();
  });

  it('persists during continuous change without a quiet period (interval, not debounce)', () => {
    // Regression: a reset-on-change debounce never fires while the drift loop
    // mutates objects faster than the delay. Here changes arrive every 200ms
    // for 3s straight with no trailing quiet gap; an interval flush must still
    // have written at least once.
    vi.useFakeTimers();
    const { result } = renderHook(() => useDoodleObjects(seq([0.5])));
    act(() => result.current.spawnShape(100, 100));
    for (let i = 0; i < 15; i += 1) {
      act(() => {
        result.current.advance(0.1, { width: 1000, height: 1000 });
        vi.advanceTimersByTime(200);
      });
    }
    expect(localStorage.getItem('doodle-objects')).not.toBeNull();
    expect(JSON.parse(localStorage.getItem('doodle-objects'))).toHaveLength(1);
    vi.useRealTimers();
  });

  it('tolerates a throwing localStorage', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    vi.useFakeTimers();
    const { result } = renderHook(() => useDoodleObjects(seq([0.2])));
    act(() => result.current.spawnShape(0, 0));
    expect(() => act(() => vi.advanceTimersByTime(1000))).not.toThrow();
    vi.useRealTimers();
    spy.mockRestore();
  });
});
