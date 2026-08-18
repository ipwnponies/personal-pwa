import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import DoodleCanvas from './DoodleCanvas';
import styles from './doodle.module.css';

const seq = (values) => {
  let i = 0;
  return () => {
    const v = values[i % values.length];
    i += 1;
    return v;
  };
};

const mockSound = () => ({
  playNote: vi.fn(),
  playStroke: vi.fn(),
  playPop: vi.fn(),
  setMuted: vi.fn(),
  isMuted: () => false,
});

beforeEach(() => {
  localStorage.clear();
  // Freeze the drift loop so pointer behavior is isolated.
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

const stage = (container) => container.querySelector('svg');
const shapeGroups = (container) => container.querySelectorAll('svg > g[data-id]');
const strokes = (container) => container.querySelectorAll('polyline');

describe('DoodleCanvas', () => {
  it('tap on empty space spawns one shape and plays a note', () => {
    const sound = mockSound();
    const { container } = render(<DoodleCanvas rng={seq([0.3])} sound={sound} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    expect(shapeGroups(container)).toHaveLength(1);
    expect(sound.playNote).toHaveBeenCalledTimes(1);
  });

  it('spawns tablet-scaled shapes (2x) on tablet+ viewports', () => {
    const widthSpy = vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1024);
    const { container } = render(<DoodleCanvas rng={seq([0])} sound={mockSound()} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    const circle = container.querySelector('svg > g[data-id] circle');
    expect(circle.getAttribute('r')).toBe('28'); // MIN_SIZE(28) * 2 / 2
    widthSpy.mockRestore();
  });

  it('spawns phone-scaled shapes (1x) below the tablet breakpoint', () => {
    const widthSpy = vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(375);
    const { container } = render(<DoodleCanvas rng={seq([0])} sound={mockSound()} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    const circle = container.querySelector('svg > g[data-id] circle');
    expect(circle.getAttribute('r')).toBe('14'); // MIN_SIZE(28) * 1 / 2
    widthSpy.mockRestore();
  });

  it('drag on empty space draws a stroke', () => {
    const sound = mockSound();
    const { container } = render(<DoodleCanvas rng={seq([0.3])} sound={sound} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 60, clientY: 60, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 80, clientY: 90, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 80, clientY: 90, pointerId: 1 });
    expect(strokes(container)).toHaveLength(1);
    expect(shapeGroups(container)).toHaveLength(0);
    expect(sound.playStroke).toHaveBeenCalledTimes(1);
  });

  it('drag starting on a shape moves it instead of drawing', () => {
    const { container } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    const g = container.querySelector('svg > g[data-id]');
    const before = g.getAttribute('transform');

    fireEvent.pointerDown(g, { clientX: 100, clientY: 100, pointerId: 2 });
    fireEvent.pointerMove(svg, { clientX: 160, clientY: 170, pointerId: 2 });
    fireEvent.pointerUp(svg, { clientX: 160, clientY: 170, pointerId: 2 });

    expect(strokes(container)).toHaveLength(0);
    const after = container.querySelector('svg > g[data-id]').getAttribute('transform');
    expect(after).not.toBe(before);
  });

  it('single tap on a shape plays its note', () => {
    const sound = mockSound();
    const { container } = render(<DoodleCanvas rng={seq([0.3])} sound={sound} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    sound.playNote.mockClear();
    const g = container.querySelector('svg > g[data-id]');
    fireEvent.pointerDown(g, { clientX: 100, clientY: 100, pointerId: 2 });
    fireEvent.pointerUp(g, { clientX: 100, clientY: 100, pointerId: 2 });
    expect(sound.playNote).toHaveBeenCalledTimes(1);
  });

  it('double tap on a shape pops it', () => {
    const sound = mockSound();
    // rng high so the spawned shape is large enough to split.
    const { container } = render(<DoodleCanvas rng={seq([0.99])} sound={sound} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    const g = container.querySelector('svg > g[data-id]');
    const firstId = g.getAttribute('data-id');
    fireEvent.pointerDown(g, { clientX: 100, clientY: 100, pointerId: 2 });
    fireEvent.pointerUp(g, { clientX: 100, clientY: 100, pointerId: 2 });
    fireEvent.pointerDown(g, { clientX: 100, clientY: 100, pointerId: 3 });
    fireEvent.pointerUp(g, { clientX: 100, clientY: 100, pointerId: 3 });
    expect(container.querySelector(`[data-id="${firstId}"]`)).toBeNull();
    expect(sound.playPop).toHaveBeenCalledTimes(1);
    expect(shapeGroups(container).length).toBeGreaterThanOrEqual(3);
  });

  it('clear button empties the canvas', () => {
    const { container, getByLabelText } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 30, clientY: 30, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 30, clientY: 30, pointerId: 1 });
    expect(shapeGroups(container)).toHaveLength(1);
    fireEvent.click(getByLabelText('Clear canvas'));
    expect(shapeGroups(container)).toHaveLength(0);
  });

  it('mute button toggles its label and tells the sound engine to mute', () => {
    const sound = mockSound();
    const { getByLabelText } = render(<DoodleCanvas rng={seq([0.3])} sound={sound} />);
    fireEvent.click(getByLabelText('Mute'));
    expect(getByLabelText('Unmute')).toBeTruthy();
    expect(sound.setMuted).toHaveBeenCalledWith(true);
  });

  it('runs a drift loop that moves shapes over time', () => {
    // Drive rAF manually so the loop actually ticks (the other tests stub it
    // to a no-op). Without this, the loop -> advance -> re-render integration
    // is never exercised.
    const cbs = [];
    vi.stubGlobal('requestAnimationFrame', (cb) => { cbs.push(cb); return cbs.length; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    // jsdom returns an all-zero rect (which would skip advance); give the stage
    // real dimensions and control the clock for a deterministic dt.
    const rect = {
      width: 1000, height: 1000, left: 0, top: 0, right: 1000, bottom: 1000, x: 0, y: 0, toJSON: () => ({}),
    };
    const rectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(rect);
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(0);

    const { container } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    const before = container.querySelector('svg > g[data-id]').getAttribute('transform');

    act(() => { cbs[cbs.length - 1](500); }); // 0.5s elapsed -> shapes drift

    const after = container.querySelector('svg > g[data-id]').getAttribute('transform');
    expect(after).not.toBe(before);

    nowSpy.mockRestore();
    rectSpy.mockRestore();
  });

  it('a second finger acts independently while the first gesture is still active', () => {
    // Multi-touch: a second finger is no longer locked out by an in-progress
    // first gesture — each pointerId tracks its own independent state.
    const sound = mockSound();
    const { container } = render(<DoodleCanvas rng={seq([0.3])} sound={sound} />);
    const svg = stage(container);

    // Finger 1: start dragging the first shape.
    fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    const g = container.querySelector('svg > g[data-id]');
    fireEvent.pointerDown(g, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 150, clientY: 100, pointerId: 1 });

    // Finger 2 taps empty space mid-drag — now spawns its own shape independently.
    fireEvent.pointerDown(svg, { clientX: 400, clientY: 400, pointerId: 2 });
    fireEvent.pointerUp(svg, { clientX: 400, clientY: 400, pointerId: 2 });
    expect(shapeGroups(container)).toHaveLength(2); // finger 1's shape + finger 2's new spawn

    // Finger 1 continues and completes its drag normally, unaffected by finger 2.
    fireEvent.pointerMove(svg, { clientX: 170, clientY: 130, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 170, clientY: 130, pointerId: 1 });
    expect(strokes(container)).toHaveLength(0); // finger 1 was dragging, never drew
    const transform = container.querySelector(`[data-id="${g.getAttribute('data-id')}"]`).getAttribute('transform');
    expect(transform).toMatch(/^translate\(170 130\)/);
  });

  it('two fingers on empty space draw two independent strokes concurrently', () => {
    const { container } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    const svg = stage(container);

    fireEvent.pointerDown(svg, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerDown(svg, { clientX: 500, clientY: 500, pointerId: 2 });
    fireEvent.pointerMove(svg, { clientX: 60, clientY: 60, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 540, clientY: 540, pointerId: 2 });
    fireEvent.pointerMove(svg, { clientX: 80, clientY: 90, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 560, clientY: 520, pointerId: 2 });
    fireEvent.pointerUp(svg, { clientX: 80, clientY: 90, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 560, clientY: 520, pointerId: 2 });

    expect(strokes(container)).toHaveLength(2);
    expect(shapeGroups(container)).toHaveLength(0);
  });

  it('double-tap requires the second tap near the first — far-apart taps do not pop', () => {
    const sound = mockSound();
    // rng high so the spawned shape is large enough that (100,100) and (135,100)
    // both land on it (radius ~40), isolating "far apart" from "missed the shape".
    const { container } = render(<DoodleCanvas rng={seq([0.99])} sound={sound} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    const g = container.querySelector('svg > g[data-id]');
    const firstId = g.getAttribute('data-id');

    fireEvent.pointerDown(g, { clientX: 100, clientY: 100, pointerId: 2 });
    fireEvent.pointerUp(g, { clientX: 100, clientY: 100, pointerId: 2 });
    // Second tap lands on the same shape but 35px away — beyond DOUBLE_TAP_RADIUS (24px).
    fireEvent.pointerDown(g, { clientX: 135, clientY: 100, pointerId: 3 });
    fireEvent.pointerUp(g, { clientX: 135, clientY: 100, pointerId: 3 });

    expect(container.querySelector(`[data-id="${firstId}"]`)).not.toBeNull(); // not popped
    expect(sound.playPop).not.toHaveBeenCalled();
  });

  it('double-tap pops when the second tap lands near the first, from a different pointerId', () => {
    const sound = mockSound();
    const { container } = render(<DoodleCanvas rng={seq([0.99])} sound={sound} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    const g = container.querySelector('svg > g[data-id]');
    const firstId = g.getAttribute('data-id');

    fireEvent.pointerDown(g, { clientX: 100, clientY: 100, pointerId: 2 });
    fireEvent.pointerUp(g, { clientX: 100, clientY: 100, pointerId: 2 });
    // Second tap 3px away — within DOUBLE_TAP_RADIUS (24px) — and a different pointerId.
    fireEvent.pointerDown(g, { clientX: 103, clientY: 100, pointerId: 3 });
    fireEvent.pointerUp(g, { clientX: 103, clientY: 100, pointerId: 3 });

    expect(container.querySelector(`[data-id="${firstId}"]`)).toBeNull(); // popped
    expect(sound.playPop).toHaveBeenCalledTimes(1);
  });

  it('caps concurrent pointers and ignores extras beyond the limit', () => {
    const sound = mockSound();
    const { container } = render(<DoodleCanvas rng={seq([0.1])} sound={sound} />);
    const svg = stage(container);
    for (let id = 1; id <= 10; id += 1) {
      fireEvent.pointerDown(svg, { clientX: 10 * id, clientY: 10, pointerId: id });
    }
    fireEvent.pointerDown(svg, { clientX: 999, clientY: 999, pointerId: 11 }); // 11th dropped, cap already reached
    for (let id = 1; id <= 11; id += 1) {
      fireEvent.pointerUp(svg, { clientX: 10 * id, clientY: 10, pointerId: id });
    }
    expect(shapeGroups(container)).toHaveLength(10); // pointer 11's up finds no tracked entry, no-ops
  });

  it('clears the tracked gesture on pointercancel, not just pointerup', () => {
    // Regression: without an onPointerCancel handler, a cancelled touch (palm
    // rejection, edge-swipe, OS reclaiming it — all plausible for a toddler's
    // hand) would leave a stale entry in pointersRef (a Map capped at
    // MAX_POINTERS) forever, permanently occupying one of the 10 pointer slots.
    const { container } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    const svg = stage(container);

    fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 150, clientY: 100, pointerId: 1 }); // start a stroke
    fireEvent.pointerCancel(svg, { clientX: 150, clientY: 100, pointerId: 1 });

    // A brand-new pointerdown must not be locked out by the cancelled gesture.
    fireEvent.pointerDown(svg, { clientX: 300, clientY: 300, pointerId: 2 });
    fireEvent.pointerUp(svg, { clientX: 300, clientY: 300, pointerId: 2 });
    expect(shapeGroups(container)).toHaveLength(1);
  });

  it('maps pointer coordinates using the stage offset (non-zero rect)', () => {
    // jsdom's default rect is all-zeros; a non-origin stage must still place a
    // spawned shape at (client - rect.left/top) in SVG user units.
    const rect = {
      width: 1000, height: 1000, left: 40, top: 20, right: 1040, bottom: 1020, x: 40, y: 20, toJSON: () => ({}),
    };
    const rectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(rect);
    const { container } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 140, clientY: 120, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 140, clientY: 120, pointerId: 1 });
    const transform = container.querySelector('svg > g[data-id]').getAttribute('transform');
    expect(transform).toMatch(/^translate\(100 100\)/); // 140-40, 120-20
    rectSpy.mockRestore();
  });

  it('two fingers landing together on the same shape pinch-resizes and rotates it', () => {
    // rng=0.1 -> shapeType index floor(0.1*4)=0 ('circle'), size=28+52*0.1=33.2,
    // rotation=0.1*360=36 — a circle keeps the size assertion simple (its `r`
    // attribute is size/2 directly, no polygon-point math needed). Pinned to
    // phone scale (1x): this test is about the pinch clamp bounds, not
    // viewport-based sizing.
    const widthSpy = vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(375);
    const { container } = render(<DoodleCanvas rng={seq([0.1])} sound={mockSound()} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 200, clientY: 200, pointerId: 1 });
    const g = container.querySelector('svg > g[data-id]');
    const circleBefore = g.querySelector('circle');
    const rBefore = Number(circleBefore.getAttribute('r'));
    const transformBefore = g.getAttribute('transform');

    // Two fingers touch down together on the shape, 20px apart horizontally.
    fireEvent.pointerDown(g, { clientX: 190, clientY: 200, pointerId: 10 });
    fireEvent.pointerDown(g, { clientX: 210, clientY: 200, pointerId: 11 });
    // Spread apart AND offset vertically -> both distance and angle change.
    fireEvent.pointerMove(svg, { clientX: 170, clientY: 180, pointerId: 10 });
    fireEvent.pointerMove(svg, { clientX: 230, clientY: 220, pointerId: 11 });

    const circleAfter = container.querySelector(`[data-id="${g.getAttribute('data-id')}"] circle`);
    const rAfter = Number(circleAfter.getAttribute('r'));
    const transformAfter = container.querySelector(`[data-id="${g.getAttribute('data-id')}"]`).getAttribute('transform');

    expect(rAfter).toBeGreaterThan(rBefore); // grew
    expect(rAfter).toBeLessThanOrEqual(40); // clamped to MAX_SIZE/2
    expect(transformAfter).not.toBe(transformBefore); // rotation (and translate string) changed
    expect(transformAfter).toMatch(/^translate\(200 200\)/); // center did not move
    widthSpy.mockRestore();
  });

  it('pinch resize clamps at MIN_SIZE/MAX_SIZE instead of overshooting', () => {
    // Pinned to phone scale (1x): this test is about the pinch clamp bounds,
    // not viewport-based sizing.
    const widthSpy = vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(375);
    const { container } = render(<DoodleCanvas rng={seq([0.1])} sound={mockSound()} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 200, clientY: 200, pointerId: 1 });
    const g = container.querySelector('svg > g[data-id]');

    fireEvent.pointerDown(g, { clientX: 195, clientY: 200, pointerId: 10 });
    fireEvent.pointerDown(g, { clientX: 205, clientY: 200, pointerId: 11 });
    // Enormous spread -> would far exceed MAX_SIZE without clamping.
    fireEvent.pointerMove(svg, { clientX: 0, clientY: 200, pointerId: 10 });
    fireEvent.pointerMove(svg, { clientX: 900, clientY: 200, pointerId: 11 });

    const rAfter = Number(container.querySelector(`[data-id="${g.getAttribute('data-id')}"] circle`).getAttribute('r'));
    expect(rAfter).toBe(40); // MAX_SIZE / 2
    widthSpy.mockRestore();
  });

  it('pinch resize on a tablet-scaled shape clamps to its own 2x bounds, not the 1x range', () => {
    const widthSpy = vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1024);
    const { container } = render(<DoodleCanvas rng={seq([0.1])} sound={mockSound()} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 200, clientY: 200, pointerId: 1 });
    const g = container.querySelector('svg > g[data-id]');

    fireEvent.pointerDown(g, { clientX: 195, clientY: 200, pointerId: 10 });
    fireEvent.pointerDown(g, { clientX: 205, clientY: 200, pointerId: 11 });
    // Enormous spread -> would far exceed the 1x MAX_SIZE (80) but should
    // clamp at the shape's own 2x range (160) instead.
    fireEvent.pointerMove(svg, { clientX: 0, clientY: 200, pointerId: 10 });
    fireEvent.pointerMove(svg, { clientX: 900, clientY: 200, pointerId: 11 });

    const rAfter = Number(container.querySelector(`[data-id="${g.getAttribute('data-id')}"] circle`).getAttribute('r'));
    expect(rAfter).toBe(80); // MAX_SIZE(80) * sizeMultiplier(2) / 2
    widthSpy.mockRestore();
  });

  it('lifting one pinch finger hands off to a plain drag on the other, no jump', () => {
    const { container } = render(<DoodleCanvas rng={seq([0.1])} sound={mockSound()} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 200, clientY: 200, pointerId: 1 });
    const g = container.querySelector('svg > g[data-id]');
    const id = g.getAttribute('data-id');

    fireEvent.pointerDown(g, { clientX: 190, clientY: 200, pointerId: 10 });
    fireEvent.pointerDown(g, { clientX: 210, clientY: 200, pointerId: 11 });
    fireEvent.pointerMove(svg, { clientX: 170, clientY: 200, pointerId: 10 });
    fireEvent.pointerMove(svg, { clientX: 230, clientY: 200, pointerId: 11 });
    const sizeAfterPinch = container.querySelector(`[data-id="${id}"] circle`).getAttribute('r');

    fireEvent.pointerUp(svg, { clientX: 170, clientY: 200, pointerId: 10 }); // one finger lifts
    fireEvent.pointerMove(svg, { clientX: 260, clientY: 240, pointerId: 11 }); // survivor drags on

    const after = container.querySelector(`[data-id="${id}"]`);
    expect(after.getAttribute('transform')).toMatch(/^translate\(260 240\)/);
    expect(after.querySelector('circle').getAttribute('r')).toBe(sizeAfterPinch); // size held from the pinch, not reset
  });

  it('a third finger touching an already-pinched shape is inert, not a third gesture', () => {
    const { container } = render(<DoodleCanvas rng={seq([0.1])} sound={mockSound()} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 200, clientY: 200, pointerId: 1 });
    const g = container.querySelector('svg > g[data-id]');
    const id = g.getAttribute('data-id');

    fireEvent.pointerDown(g, { clientX: 190, clientY: 200, pointerId: 10 });
    fireEvent.pointerDown(g, { clientX: 210, clientY: 200, pointerId: 11 });
    fireEvent.pointerDown(g, { clientX: 200, clientY: 190, pointerId: 12 }); // third finger, same shape
    fireEvent.pointerMove(svg, { clientX: 200, clientY: 260, pointerId: 12 }); // moved a lot

    const after = container.querySelector(`[data-id="${id}"]`);
    expect(after.getAttribute('transform')).toMatch(/^translate\(200 200\)/); // unmoved by finger 3
    expect(() => fireEvent.pointerUp(svg, { clientX: 200, clientY: 260, pointerId: 12 })).not.toThrow();
  });

  it('a second finger landing on an already-dragged shape does not start a second drag', () => {
    const { container } = render(<DoodleCanvas rng={seq([0.1])} sound={mockSound()} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 200, clientY: 200, pointerId: 1 });
    const g = container.querySelector('svg > g[data-id]');
    const id = g.getAttribute('data-id');

    fireEvent.pointerDown(g, { clientX: 200, clientY: 200, pointerId: 20 });
    fireEvent.pointerMove(svg, { clientX: 220, clientY: 200, pointerId: 20 }); // finger 20 is now dragging

    fireEvent.pointerDown(g, { clientX: 200, clientY: 200, pointerId: 21 }); // finger 21 lands late (outside pinch window)
    fireEvent.pointerMove(svg, { clientX: 200, clientY: 400, pointerId: 21 }); // tries to move it elsewhere

    fireEvent.pointerMove(svg, { clientX: 240, clientY: 200, pointerId: 20 }); // finger 20 keeps dragging

    const transform = container.querySelector(`[data-id="${id}"]`).getAttribute('transform');
    expect(transform).toMatch(/^translate\(240 200\)/); // driven only by finger 20
  });

  it('two fingers on the same shape outside PINCH_WINDOW_MS do not pinch — first mover just drags', () => {
    const { container } = render(<DoodleCanvas rng={seq([0.1])} sound={mockSound()} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 200, clientY: 200, pointerId: 1 });
    const g = container.querySelector('svg > g[data-id]');
    const id = g.getAttribute('data-id');
    const rBefore = g.querySelector('circle').getAttribute('r');

    const nowSpy = vi.spyOn(Date, 'now');
    nowSpy.mockReturnValue(0);
    fireEvent.pointerDown(g, { clientX: 190, clientY: 200, pointerId: 30 }); // finger A, t=0
    nowSpy.mockReturnValue(500); // 500ms later — well outside the 150ms pinch window
    fireEvent.pointerDown(g, { clientX: 210, clientY: 200, pointerId: 31 }); // finger B, t=500

    fireEvent.pointerMove(svg, { clientX: 150, clientY: 200, pointerId: 30 }); // A moves first -> claims the shape as a drag
    fireEvent.pointerMove(svg, { clientX: 400, clientY: 400, pointerId: 31 }); // B tries to move too -> inert, shape already claimed

    const after = container.querySelector(`[data-id="${id}"]`);
    expect(after.getAttribute('transform')).toMatch(/^translate\(150 200\)/); // driven only by finger A's drag
    expect(after.querySelector('circle').getAttribute('r')).toBe(rBefore); // no pinch resize happened
    nowSpy.mockRestore();
  });

  it('pinching a shard smaller than MIN_SIZE does not snap its size up to MIN_SIZE', () => {
    // rng=0.3 -> shapeType index floor(0.3*4)=1 ('square'), spawn size
    // 28+52*0.3=43.6. Popping it yields children at half that size (~21.8px),
    // below MIN_SIZE (28px) — the spawn floor, which should not apply to
    // already-split shards. Pinned to phone scale (1x): this test is about
    // the MIN_SIZE floor, not viewport-based sizing.
    const widthSpy = vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(375);
    const { container } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    const parent = container.querySelector('svg > g[data-id]');
    const parentId = parent.getAttribute('data-id');

    fireEvent.pointerDown(parent, { clientX: 100, clientY: 100, pointerId: 2 });
    fireEvent.pointerUp(parent, { clientX: 100, clientY: 100, pointerId: 2 });
    fireEvent.pointerDown(parent, { clientX: 100, clientY: 100, pointerId: 3 });
    fireEvent.pointerUp(parent, { clientX: 100, clientY: 100, pointerId: 3 });
    expect(container.querySelector(`[data-id="${parentId}"]`)).toBeNull(); // popped

    const child = container.querySelector('svg > g[data-id]');
    const childId = child.getAttribute('data-id');
    const sizeBefore = Number(child.querySelector('rect').getAttribute('width'));
    expect(sizeBefore).toBeLessThan(28); // shard is below MIN_SIZE, as expected

    // Pinch the shard inward slightly -> the raw formula computes a size even
    // smaller than sizeBefore, so it should clamp at sizeBefore (its own
    // starting size) rather than snap up to the unrelated spawn floor of 28.
    fireEvent.pointerDown(child, { clientX: 190, clientY: 200, pointerId: 10 });
    fireEvent.pointerDown(child, { clientX: 210, clientY: 200, pointerId: 11 });
    fireEvent.pointerMove(svg, { clientX: 195, clientY: 200, pointerId: 10 });
    fireEvent.pointerMove(svg, { clientX: 205, clientY: 200, pointerId: 11 });

    const sizeAfter = Number(container.querySelector(`[data-id="${childId}"] rect`).getAttribute('width'));
    expect(sizeAfter).toBeLessThan(28); // did not jump up to MIN_SIZE
    expect(sizeAfter).toBeCloseTo(sizeBefore, 5); // clamped at its own starting size
    widthSpy.mockRestore();
  });

  it('two shapes tapped concurrently by different fingers both pulse without cancelling each other', () => {
    const { container } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerDown(svg, { clientX: 400, clientY: 400, pointerId: 2 });
    fireEvent.pointerUp(svg, { clientX: 400, clientY: 400, pointerId: 2 });
    const [shapeA, shapeB] = container.querySelectorAll('svg > g[data-id]');

    // Tap shape A, then shape B, with different pointerIds, before either
    // pulse (DOUBLE_TAP_MS) could have expired.
    fireEvent.pointerDown(shapeA, { clientX: 100, clientY: 100, pointerId: 3 });
    fireEvent.pointerUp(shapeA, { clientX: 100, clientY: 100, pointerId: 3 });
    fireEvent.pointerDown(shapeB, { clientX: 400, clientY: 400, pointerId: 4 });
    fireEvent.pointerUp(shapeB, { clientX: 400, clientY: 400, pointerId: 4 });

    const innerA = container.querySelector(`[data-id="${shapeA.getAttribute('data-id')}"] > g`);
    const innerB = container.querySelector(`[data-id="${shapeB.getAttribute('data-id')}"] > g`);
    // Both shapes must carry the pulse class simultaneously — tapping B must
    // not have cancelled A's still-running pulse timer.
    expect(innerA.getAttribute('class')).toBe(styles.pulse);
    expect(innerB.getAttribute('class')).toBe(styles.pulse);
  });

  it('a pinched shape does not drift during the drift loop', () => {
    // Drive rAF manually (as in 'runs a drift loop that moves shapes over
    // time') so the pinch-member grabbed-ids wiring into advance() is
    // actually exercised, not just the pointer-handler math.
    const cbs = [];
    vi.stubGlobal('requestAnimationFrame', (cb) => { cbs.push(cb); return cbs.length; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const rect = {
      width: 1000, height: 1000, left: 0, top: 0, right: 1000, bottom: 1000, x: 0, y: 0, toJSON: () => ({}),
    };
    const rectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(rect);
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(0);

    const { container } = render(<DoodleCanvas rng={seq([0.1])} sound={mockSound()} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 200, clientY: 200, pointerId: 1 });
    const g = container.querySelector('svg > g[data-id]');
    const id = g.getAttribute('data-id');

    fireEvent.pointerDown(g, { clientX: 190, clientY: 200, pointerId: 10 });
    fireEvent.pointerDown(g, { clientX: 210, clientY: 200, pointerId: 11 });
    fireEvent.pointerMove(svg, { clientX: 170, clientY: 180, pointerId: 10 }); // enter pinch
    const before = container.querySelector(`[data-id="${id}"]`).getAttribute('transform');

    act(() => { cbs[cbs.length - 1](500); }); // 0.5s elapsed -> drift loop ticks

    const after = container.querySelector(`[data-id="${id}"]`).getAttribute('transform');
    expect(after).toBe(before); // held still by the pinch, not drifted

    nowSpy.mockRestore();
    rectSpy.mockRestore();
  });
});
