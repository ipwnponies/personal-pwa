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

  it('spawnShape threads sizeMultiplier through to the created shape', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.2])));
    let shape;
    act(() => { shape = result.current.spawnShape(0, 0, 2); });
    expect(shape.sizeMultiplier).toBe(2);
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

  it('advance moves non-grabbed shapes and skips shapes in the grabbed set', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.5])));
    let a;
    let b;
    act(() => { a = result.current.spawnShape(100, 100); });
    act(() => { b = result.current.spawnShape(200, 200); });
    const before = result.current.objects.find((o) => o.id === b.id);
    act(() => result.current.advance(1, { width: 1000, height: 1000 }, new Set([b.id])));
    const afterA = result.current.objects.find((o) => o.id === a.id);
    const afterB = result.current.objects.find((o) => o.id === b.id);
    expect(afterB.x).toBe(before.x); // grabbed shape unchanged
    expect(afterA.x !== 100 || afterA.y !== 100).toBe(true); // moved
  });

  it('advance skips every shape whose id is in the grabbed set', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.5])));
    let a;
    let b;
    act(() => { a = result.current.spawnShape(100, 100); });
    act(() => { b = result.current.spawnShape(200, 200); });
    act(() => result.current.advance(1, { width: 1000, height: 1000 }, new Set([a.id, b.id])));
    const afterA = result.current.objects.find((o) => o.id === a.id);
    const afterB = result.current.objects.find((o) => o.id === b.id);
    expect(afterA.x).toBe(100);
    expect(afterB.x).toBe(200);
  });

  it('advance resolves collisions between overlapping shapes and returns events', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.5])));
    let a;
    let b;
    act(() => { a = result.current.spawnShape(100, 100); });
    act(() => { b = result.current.spawnShape(105, 100); }); // overlapping, same rng -> same color
    // dt=0 makes the drift step a no-op, isolating collision resolution from drift.
    let events;
    act(() => { events = result.current.advance(0, { width: 1000, height: 1000 }, null); });
    expect(events.length).toBeGreaterThan(0);
    // same color (both spawned with the same rng sequence) -> merge -> one fewer shape
    const ids = [a.id, b.id];
    const survivingOriginals = result.current.objects.filter((o) => ids.includes(o.id));
    expect(survivingOriginals.length).toBeLessThan(2);
  });

  it('advance preserves stroke/shape interleave order for untouched objects', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.2])));
    let shape;
    act(() => { shape = result.current.spawnShape(0, 0); });
    let strokeId;
    act(() => { strokeId = result.current.startStroke(500, 500); });
    act(() => result.current.advance(0.01, { width: 1000, height: 1000 }, null));
    const order = result.current.objects.map((o) => o.id);
    expect(order).toEqual([shape.id, strokeId]);
  });

  it('advance does not merge a grabbed shape into a same-color overlap, but still bounces it', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.5])));
    let a;
    let b;
    act(() => { a = result.current.spawnShape(100, 100); });
    act(() => { b = result.current.spawnShape(105, 100); }); // overlapping, same color
    // Force b to be approaching a (velAlongNormal < 0) so a real impulse fires,
    // deterministically exercising the bounce-not-merge path regardless of the
    // spawn-time drift velocity the rng happened to produce.
    act(() => {
      const bObj = result.current.objects.find((o) => o.id === b.id);
      bObj.vx = -50;
      bObj.vy = 0;
    });
    // Advance with a as the grabbed shape (being dragged by user)
    let events;
    act(() => { events = result.current.advance(0, { width: 1000, height: 1000 }, new Set([a.id])); });
    // The grabbed shape's id must still exist; it should NOT have merged away
    const shapeIds = new Set(result.current.objects.filter((o) => o.kind === 'shape').map((o) => o.id));
    expect(shapeIds.has(a.id)).toBe(true);
    expect(shapeIds.has(b.id)).toBe(true);
    // The grabbed shape's position must be exactly where moveShape/spawnShape put
    // it — restored after collision resolution, not left wherever physics moved it.
    const afterA = result.current.objects.find((o) => o.id === a.id);
    expect(afterA.x).toBe(100);
    expect(afterA.y).toBe(100);
    // Dragging into another shape must still produce a physics reaction — the
    // other shape bounces off the grabbed one instead of the collision being
    // silently ignored.
    expect(events.some((e) => e.type === 'bounce')).toBe(true);
    const afterB = result.current.objects.find((o) => o.id === b.id);
    expect(afterB.vx).not.toBe(-50); // b's velocity actually changed (impulse applied)
  });

  it('transformShape updates size and rotation on the matching shape', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.5])));
    let shape;
    act(() => { shape = result.current.spawnShape(0, 0); });
    act(() => result.current.transformShape(shape.id, { size: 50, rotation: 120 }));
    const updated = result.current.objects.find((o) => o.id === shape.id);
    expect(updated.size).toBe(50);
    expect(updated.rotation).toBe(120);
    expect(updated.x).toBe(shape.x); // unaffected
    expect(updated.y).toBe(shape.y); // unaffected
  });

  it('transformShape partially updates, leaving an omitted field unchanged', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.5])));
    let shape;
    act(() => { shape = result.current.spawnShape(0, 0); });
    act(() => result.current.transformShape(shape.id, { size: 50, rotation: 120 }));
    act(() => result.current.transformShape(shape.id, { size: 65 })); // rotation omitted
    const updated = result.current.objects.find((o) => o.id === shape.id);
    expect(updated.size).toBe(65);
    expect(updated.rotation).toBe(120); // held from before, not clobbered to undefined
  });

  it('transformShape no-ops for an unknown id', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.5])));
    act(() => { result.current.spawnShape(0, 0); });
    const before = result.current.objects;
    act(() => result.current.transformShape('does-not-exist', { size: 999, rotation: 999 }));
    expect(result.current.objects).toEqual(before);
  });

  it('clear empties the array', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.2])));
    act(() => result.current.spawnShape(0, 0));
    act(() => result.current.clear());
    expect(result.current.objects).toHaveLength(0);
  });

  it("clear('shape') removes only shapes, leaving strokes", () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.2])));
    act(() => result.current.spawnShape(0, 0));
    act(() => result.current.startStroke(1, 1));
    act(() => result.current.clear('shape'));
    expect(result.current.objects).toHaveLength(1);
    expect(result.current.objects[0].kind).toBe('stroke');
  });

  it("clear('stroke') removes only strokes, leaving shapes", () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.2])));
    act(() => result.current.spawnShape(0, 0));
    act(() => result.current.startStroke(1, 1));
    act(() => result.current.clear('stroke'));
    expect(result.current.objects).toHaveLength(1);
    expect(result.current.objects[0].kind).toBe('shape');
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
