import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import DoodleCanvas from './DoodleCanvas';

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
    // rng high so the spawned shape is large enough that (100,100) and (120,100)
    // both land on it, isolating "far apart" from "missed the shape".
    const { container } = render(<DoodleCanvas rng={seq([0.99])} sound={sound} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    const g = container.querySelector('svg > g[data-id]');
    const firstId = g.getAttribute('data-id');

    fireEvent.pointerDown(g, { clientX: 100, clientY: 100, pointerId: 2 });
    fireEvent.pointerUp(g, { clientX: 100, clientY: 100, pointerId: 2 });
    // Second tap lands on the same shape but 20px away — beyond MOVE_THRESHOLD (8px).
    fireEvent.pointerDown(g, { clientX: 120, clientY: 100, pointerId: 3 });
    fireEvent.pointerUp(g, { clientX: 120, clientY: 100, pointerId: 3 });

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
    // Second tap 3px away — within MOVE_THRESHOLD — and a different pointerId.
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
    // hand) would leave pointerRef populated forever, permanently locking out
    // every future pointerdown via the single-gesture guard.
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
});
