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

  it('clear() returns the full previous objects array', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.2])));
    let shape;
    let strokeId;
    act(() => { shape = result.current.spawnShape(0, 0); });
    act(() => { strokeId = result.current.startStroke(1, 1); });
    let removed;
    act(() => { removed = result.current.clear(); });
    expect(removed).toHaveLength(2);
    expect(removed.map((o) => o.id).sort()).toEqual([shape.id, strokeId].sort());
  });

  it("clear('shape') returns only the removed shape objects", () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.2])));
    let shape;
    act(() => { shape = result.current.spawnShape(0, 0); });
    act(() => { result.current.startStroke(1, 1); });
    let removed;
    act(() => { removed = result.current.clear('shape'); });
    expect(removed).toHaveLength(1);
    expect(removed[0].id).toBe(shape.id);
    expect(removed[0].kind).toBe('shape');
  });

  it("clear('stroke') returns only the removed stroke objects", () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.2])));
    act(() => { result.current.spawnShape(0, 0); });
    let strokeId;
    act(() => { strokeId = result.current.startStroke(1, 1); });
    let removed;
    act(() => { removed = result.current.clear('stroke'); });
    expect(removed).toHaveLength(1);
    expect(removed[0].id).toBe(strokeId);
    expect(removed[0].kind).toBe('stroke');
  });

  it('clear() on an empty hook returns an empty array', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.2])));
    let removed;
    act(() => { removed = result.current.clear(); });
    expect(removed).toEqual([]);
  });

  it('restore appends removed objects to whatever is currently in state', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.2])));
    act(() => { result.current.spawnShape(0, 0); });
    let removed;
    act(() => { removed = result.current.clear(); });
    let newShape;
    act(() => { newShape = result.current.spawnShape(5, 5); });
    act(() => result.current.restore(removed));
    expect(result.current.objects).toHaveLength(2);
    const ids = result.current.objects.map((o) => o.id);
    expect(ids).toContain(newShape.id);
    expect(ids).toContain(removed[0].id);
  });

  it('restore writes the merged array to localStorage synchronously', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.2])));
    act(() => { result.current.spawnShape(0, 0); });
    let removed;
    act(() => { removed = result.current.clear(); });
    act(() => { result.current.spawnShape(5, 5); });
    act(() => result.current.restore(removed));
    const stored = JSON.parse(localStorage.getItem('doodle-objects'));
    expect(stored).toHaveLength(2);
  });

  it('restore(null) is a safe no-op', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.2])));
    act(() => { result.current.spawnShape(0, 0); });
    const before = result.current.objects;
    act(() => result.current.restore(null));
    expect(result.current.objects).toEqual(before);
  });

  it('restore([]) is a safe no-op', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.2])));
    act(() => { result.current.spawnShape(0, 0); });
    const before = result.current.objects;
    act(() => result.current.restore([]));
    expect(result.current.objects).toEqual(before);
  });

  it('applyToShapes replaces every shape with the transform result', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.2])));
    act(() => { result.current.spawnShape(10, 20); });
    act(() => { result.current.spawnShape(30, 40); });
    act(() => {
      result.current.applyToShapes((shapes) => shapes.map((s) => ({ ...s, vx: 999 })));
    });
    expect(result.current.objects.every((o) => o.vx === 999)).toBe(true);
  });

  it('applyToShapes leaves strokes untouched and keeps array order', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.2])));
    let strokeId;
    act(() => { strokeId = result.current.startStroke(0, 0); });
    act(() => { result.current.spawnShape(10, 20); });
    act(() => {
      result.current.applyToShapes((shapes) => shapes.map((s) => ({ ...s, vx: 999 })));
    });
    expect(result.current.objects[0].id).toBe(strokeId);
    expect(result.current.objects[0].kind).toBe('stroke');
    expect(result.current.objects[0].vx).toBeUndefined();
    expect(result.current.objects[1].vx).toBe(999);
  });

  it('applyToShapes is a no-op when there are no shapes', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.2])));
    act(() => { result.current.startStroke(0, 0); });
    const before = result.current.objects;
    const transform = vi.fn();
    act(() => { result.current.applyToShapes(transform); });
    expect(transform).not.toHaveBeenCalled();
    expect(result.current.objects).toBe(before);
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

  // Drives a shape at (100, 80) straight down into a stroke drawn across
  // y = 100. r = 20 + WALL_RADIUS 4 means contact begins 24px out.
  const setUpWallHit = (result) => {
    let shape;
    act(() => { shape = result.current.spawnShape(100, 80); });
    let strokeId;
    act(() => { strokeId = result.current.startStroke(0, 100); });
    act(() => result.current.appendStrokePoint(strokeId, 200, 100));
    act(() => {
      const live = result.current.objects.find((o) => o.id === shape.id);
      live.x = 100;
      live.y = 80;
      live.vx = 0;
      live.vy = 50;
      live.size = 40;
    });
    return shape;
  };

  it('advance returns wallBounce events for a shape driven into a stroke', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.5])));
    setUpWallHit(result);
    let events;
    act(() => {
      events = result.current.advance(0.001, { width: 1000, height: 1000 }, null);
    });
    expect(events.some((e) => e.type === 'wallBounce')).toBe(true);
  });

  it('advance reverses a shape driven into a stroke', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.5])));
    const shape = setUpWallHit(result);
    act(() => result.current.advance(0.001, { width: 1000, height: 1000 }, null));
    const after = result.current.objects.find((o) => o.id === shape.id);
    expect(after.vy).toBeLessThan(0);
  });

  it('advance lets a grabbed shape pass through a stroke', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.5])));
    const shape = setUpWallHit(result);
    let events;
    act(() => {
      events = result.current.advance(
        0.001, { width: 1000, height: 1000 }, new Set([shape.id]),
      );
    });
    expect(events.some((e) => e.type === 'wallBounce')).toBe(false);
    const after = result.current.objects.find((o) => o.id === shape.id);
    expect(after.y).toBe(80);
  });

  it('advance threads wallRestitution from its tuning argument', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.5])));
    const shape = setUpWallHit(result);
    act(() => result.current.advance(
      0.001, { width: 1000, height: 1000 }, null, { wallRestitution: 0.2 },
    ));
    const after = result.current.objects.find((o) => o.id === shape.id);
    expect(after.vy).toBeCloseTo(-10, 0); // 50 * 0.2, minus a sliver of drift
  });

  it('grants wall immunity when a wall and the canvas edge trap a shape', () => {
    // The genuine deadlock: a line drawn 30px from the left edge, and a shape
    // whose own radius (20) leaves it no room between the two. The wall pushes
    // it left, the bounds clamp pushes it right, forever — so the conflict is
    // detected on the first frame and handed to immunity instead.
    const { result } = renderHook(() => useDoodleObjects(seq([0.5])));
    let shape;
    act(() => { shape = result.current.spawnShape(20, 100); });
    let strokeId;
    act(() => { strokeId = result.current.startStroke(30, 0); });
    act(() => result.current.appendStrokePoint(strokeId, 30, 200));
    act(() => {
      const live = result.current.objects.find((o) => o.id === shape.id);
      live.x = 20;
      live.y = 100;
      live.vx = 0;
      live.vy = 0;
      live.size = 40;
    });

    act(() => result.current.advance(
      0.016, { width: 1000, height: 1000 }, null, { wallImmunityS: 2 },
    ));

    const after = result.current.objects.find((o) => o.id === shape.id);
    expect(after.wallImmunityRemaining).toBe(2);
    expect(after.x).toBe(20); // clamped back in, not left sitting out of bounds
  });

  it('releaseShape grants wall immunity that then expires', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.5])));
    let shape;
    act(() => { shape = result.current.spawnShape(100, 100); });
    act(() => result.current.releaseShape(shape.id, 0.5));
    expect(
      result.current.objects.find((o) => o.id === shape.id).wallImmunityRemaining,
    ).toBe(0.5);

    act(() => result.current.advance(0.6, { width: 1000, height: 1000 }, null));
    expect(
      result.current.objects.find((o) => o.id === shape.id).wallImmunityRemaining,
    ).toBeUndefined();
  });

  it('withholds immunity when the clamp and the wall push are unrelated', () => {
    // Not a deadlock: another shape shoves this one out past the left edge
    // (so the clamp pushes it back along +x) while it separately brushes an
    // unrelated horizontal wall below it (which pushes it along -y). The two
    // corrections are perpendicular, not opposed, so nothing is trapped and no
    // immunity is granted. Shapes are sized past MAX_MERGE_SIZE so they bounce
    // rather than merge.
    const { result } = renderHook(() => useDoodleObjects(seq([0.5])));
    let a;
    let b;
    act(() => { a = result.current.spawnShape(60, 300); });
    act(() => { b = result.current.spawnShape(170, 300); });
    let strokeId;
    act(() => { strokeId = result.current.startStroke(0, 360); });
    act(() => result.current.appendStrokePoint(strokeId, 400, 360));
    act(() => {
      const liveA = result.current.objects.find((o) => o.id === a.id);
      const liveB = result.current.objects.find((o) => o.id === b.id);
      Object.assign(liveA, {
        x: 60, y: 300, vx: 0, vy: 0, size: 120,
      });
      Object.assign(liveB, {
        x: 170, y: 300, vx: 0, vy: 0, size: 120,
      });
    });

    act(() => result.current.advance(
      0.001, { width: 1000, height: 1000 }, null, { wallImmunityS: 2 },
    ));

    const after = result.current.objects.find((o) => o.id === a.id);
    expect(after.x).toBe(60); // the clamp did fire (b shoved it out past x = 60)
    expect(after.y).toBeCloseTo(296); // and it is in wall contact, pushed up 4
    expect(after.wallImmunityRemaining).toBeUndefined(); // but not trapped
  });

  it('refreshes wall immunity while a shape is still overlapping a wall', () => {
    // A shape parked on a line, immune. Immunity must not run out while it is
    // still pinned — otherwise a tight enclosure produces a repeating
    // "free for a moment, then jitter" cycle instead of a one-time rescue.
    const { result } = renderHook(() => useDoodleObjects(seq([0.5])));
    let shape;
    act(() => { shape = result.current.spawnShape(100, 95); });
    let strokeId;
    act(() => { strokeId = result.current.startStroke(0, 100); });
    act(() => result.current.appendStrokePoint(strokeId, 200, 100));
    act(() => {
      const live = result.current.objects.find((o) => o.id === shape.id);
      live.x = 100;
      live.y = 95; // overlapping the line at y = 100 (r 20 + WALL_RADIUS 4)
      live.vx = 0;
      live.vy = 0;
      live.size = 40;
    });
    act(() => result.current.releaseShape(shape.id, 0.5));

    const immunity = () => result.current.objects
      .find((o) => o.id === shape.id).wallImmunityRemaining;

    for (let i = 0; i < 4; i += 1) {
      act(() => result.current.advance(
        0.2, { width: 1000, height: 1000 }, null, { wallImmunityS: 0.5 },
      ));
      expect(immunity()).toBe(0.5); // refreshed, never decaying toward zero
    }

    // Once it is clear of the wall the countdown resumes normally.
    act(() => result.current.moveShape(shape.id, 100, 10));
    act(() => result.current.advance(
      0.2, { width: 1000, height: 1000 }, null, { wallImmunityS: 0.5 },
    ));
    expect(immunity()).toBeCloseTo(0.3);
  });

  it('releaseShape ignores a stroke id', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.5])));
    let strokeId;
    act(() => { strokeId = result.current.startStroke(0, 0); });
    act(() => result.current.releaseShape(strokeId));
    const stroke = result.current.objects.find((o) => o.id === strokeId);
    expect(stroke.wallImmunityRemaining).toBeUndefined();
  });

  it('never persists the stuck tracker or the wall cache', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useDoodleObjects(seq([0.5])));
    setUpWallHit(result);
    act(() => result.current.advance(0.5, { width: 1000, height: 1000 }, null));
    act(() => { vi.advanceTimersByTime(1000); });
    const saved = JSON.parse(localStorage.getItem('doodle-objects'));
    saved.forEach((o) => expect(['shape', 'stroke']).toContain(o.kind));
    expect(JSON.stringify(saved)).not.toContain('contacted');
    expect(JSON.stringify(saved)).not.toContain('pointCount');
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

  it('throwShape replaces a shape velocity without moving it', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.2])));
    let shape;
    act(() => { shape = result.current.spawnShape(50, 60); });
    act(() => result.current.throwShape(shape.id, 400, -200));
    const thrown = result.current.objects.find((o) => o.id === shape.id);
    expect(thrown.vx).toBe(400);
    expect(thrown.vy).toBe(-200);
    expect(thrown.x).toBe(50);
    expect(thrown.y).toBe(60);
  });

  it('throwShape ignores strokes', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.2])));
    let id;
    act(() => { id = result.current.startStroke(0, 0); });
    act(() => result.current.throwShape(id, 400, 400));
    const stroke = result.current.objects.find((o) => o.id === id);
    expect(stroke.vx).toBeUndefined();
  });

  it('advance threads a gravity vector through to every shape', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.2])));
    let shape;
    act(() => { shape = result.current.spawnShape(500, 500); });
    const before = result.current.objects.find((o) => o.id === shape.id).vy;
    act(() => {
      result.current.advance(0.1, { width: 1000, height: 1000 }, new Set(), {
        accel: { x: 0, y: 1000 },
      });
    });
    const after = result.current.objects.find((o) => o.id === shape.id).vy;
    expect(after - before).toBeCloseTo(100);
  });

  it('advance with no physics argument leaves velocity untouched', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.2])));
    let shape;
    act(() => { shape = result.current.spawnShape(500, 500); });
    const before = result.current.objects.find((o) => o.id === shape.id).vy;
    act(() => {
      result.current.advance(0.1, { width: 1000, height: 1000 }, new Set());
    });
    const after = result.current.objects.find((o) => o.id === shape.id).vy;
    expect(after).toBeCloseTo(before);
  });

  it('advance accelerates a shape toward an open well', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0])));
    let shape;
    act(() => { shape = result.current.spawnShape(300, 500); });
    // d = 200 from the well at x 500, radius 400 -> falloff 0.5.
    // strength 600 * 0.5 * dt 0.1 = 30 px/s, straight along +x.
    act(() => result.current.advance(
      0.1,
      { width: 1000, height: 1000 },
      null,
      { well: { x: 500, y: 500, radius: 400, strength: 600, maxSpeed: 400 } },
    ));
    const pulled = result.current.objects.find((o) => o.id === shape.id);
    expect(pulled.vx).toBeCloseTo(shape.vx + 30, 6);
    expect(pulled.vy).toBeCloseTo(shape.vy, 6);
  });

  it('advance leaves a shape outside the well radius alone', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0])));
    let shape;
    act(() => { shape = result.current.spawnShape(100, 500); });
    act(() => result.current.advance(
      0.1,
      { width: 1000, height: 1000 },
      null,
      { well: { x: 500, y: 500, radius: 200, strength: 600, maxSpeed: 400 } },
    ));
    const untouched = result.current.objects.find((o) => o.id === shape.id);
    expect(untouched.vx).toBeCloseTo(shape.vx, 6);
    expect(untouched.vy).toBeCloseTo(shape.vy, 6);
  });

  it('advance skips the well for a grabbed shape', () => {
    // A grabbed shape is already infinite mass to resolveCollisions and has
    // its position restored afterwards, so a force applied to it would be
    // discarded anyway. In practice the set is empty during a well, because a
    // second pointer cancels it; the check keeps advance correct on its own.
    const { result } = renderHook(() => useDoodleObjects(seq([0])));
    let shape;
    act(() => { shape = result.current.spawnShape(300, 500); });
    act(() => result.current.advance(
      0.1,
      { width: 1000, height: 1000 },
      new Set([shape.id]),
      { well: { x: 500, y: 500, radius: 400, strength: 600, maxSpeed: 400 } },
    ));
    const held = result.current.objects.find((o) => o.id === shape.id);
    expect(held.vx).toBe(shape.vx);
    expect(held.vy).toBe(shape.vy);
  });

  it('advance with no well argument behaves as it did before', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0])));
    let shape;
    act(() => { shape = result.current.spawnShape(300, 500); });
    act(() => result.current.advance(0.1, { width: 1000, height: 1000 }, null));
    const drifted = result.current.objects.find((o) => o.id === shape.id);
    expect(drifted.vx).toBeCloseTo(shape.vx, 6);
    expect(drifted.x).toBeCloseTo(300 + shape.vx * 0.1, 6);
  });
});
