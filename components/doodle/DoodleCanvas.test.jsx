import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
  playChord: vi.fn(),
  setMuted: vi.fn(),
  isMuted: () => false,
});

const dispatchShake = () => {
  const quiet = new Event('devicemotion');
  quiet.accelerationIncludingGravity = { x: 0, y: 0, z: 0 };
  window.dispatchEvent(quiet);
  const jolt = new Event('devicemotion');
  jolt.accelerationIncludingGravity = { x: 0, y: 0, z: 40 };
  window.dispatchEvent(jolt);
};

beforeEach(() => {
  localStorage.clear();
  // Freeze the drift loop so pointer behavior is isolated.
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  delete navigator.vibrate;
});

const stage = (container) => container.querySelector('svg');
const shapeGroups = (container) => container.querySelectorAll('svg > g[data-id]');
const strokes = (container) => container.querySelectorAll('polyline');

const driveOneFrame = () => {
  const cbs = [];
  vi.stubGlobal('requestAnimationFrame', (cb) => { cbs.push(cb); return cbs.length; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  const rect = {
    width: 1000, height: 1000, left: 0, top: 0, right: 1000, bottom: 1000, x: 0, y: 0, toJSON: () => ({}),
  };
  const rectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(rect);
  const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(0);
  return { cbs, rectSpy, nowSpy };
};

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

  it('drag on empty space draws a stroke, in draw mode', () => {
    const sound = mockSound();
    const { container, getByLabelText } = render(<DoodleCanvas rng={seq([0.3])} sound={sound} />);
    fireEvent.click(getByLabelText('Switch to draw mode'));
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 60, clientY: 60, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 80, clientY: 90, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 80, clientY: 90, pointerId: 1 });
    expect(strokes(container)).toHaveLength(1);
    expect(shapeGroups(container)).toHaveLength(0);
    expect(sound.playStroke).toHaveBeenCalledTimes(1);
  });

  it('drag on empty space does nothing in shape mode (the default)', () => {
    const sound = mockSound();
    const { container } = render(<DoodleCanvas rng={seq([0.3])} sound={sound} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 60, clientY: 60, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 80, clientY: 90, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 80, clientY: 90, pointerId: 1 });
    expect(strokes(container)).toHaveLength(0);
    expect(shapeGroups(container)).toHaveLength(0);
    expect(sound.playStroke).not.toHaveBeenCalled();
  });

  it('tap (no movement) in draw mode draws a dot instead of spawning a shape', () => {
    const sound = mockSound();
    const { container, getByLabelText } = render(<DoodleCanvas rng={seq([0.3])} sound={sound} />);
    fireEvent.click(getByLabelText('Switch to draw mode'));
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    expect(shapeGroups(container)).toHaveLength(0);
    const dot = strokes(container);
    expect(dot).toHaveLength(1);
    const points = dot[0].getAttribute('points').trim().split(/\s+/);
    expect(points).toEqual(['100,100', '100,100']);
    expect(sound.playStroke).toHaveBeenCalledTimes(1);
  });

  it('mode toggle flips its label/icon and persists the preference', () => {
    const { getByLabelText } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    fireEvent.click(getByLabelText('Switch to draw mode'));
    expect(getByLabelText('Switch to shape mode')).toBeTruthy();
    expect(localStorage.getItem('doodle-mode')).toBe('draw');
    fireEvent.click(getByLabelText('Switch to shape mode'));
    expect(getByLabelText('Switch to draw mode')).toBeTruthy();
    expect(localStorage.getItem('doodle-mode')).toBe('shape');
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

  it('single tap on a shape spawns a squash poof', () => {
    const { container } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    const g = container.querySelector('svg > g[data-id]');
    fireEvent.pointerDown(g, { clientX: 100, clientY: 100, pointerId: 2 });
    fireEvent.pointerUp(g, { clientX: 100, clientY: 100, pointerId: 2 });
    expect(container.querySelectorAll('circle[cx]').length).toBeGreaterThan(0);
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

  it('double tap pop spawns a spark burst in addition to child scatter', () => {
    const sound = mockSound();
    const { container } = render(<DoodleCanvas rng={seq([0.99])} sound={sound} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    const g = container.querySelector('svg > g[data-id]');
    fireEvent.pointerDown(g, { clientX: 100, clientY: 100, pointerId: 2 });
    fireEvent.pointerUp(g, { clientX: 100, clientY: 100, pointerId: 2 });
    fireEvent.pointerDown(g, { clientX: 100, clientY: 100, pointerId: 3 });
    fireEvent.pointerUp(g, { clientX: 100, clientY: 100, pointerId: 3 });
    expect(sound.playPop).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll('line').length).toBeGreaterThan(0);
  });

  it('clear button in shape mode clears shapes only, leaving strokes untouched', () => {
    const { container, getByLabelText } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    const svg = stage(container);
    // Draw a stroke first (draw mode), then switch back to shape mode and spawn a shape.
    fireEvent.click(getByLabelText('Switch to draw mode'));
    fireEvent.pointerDown(svg, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 60, clientY: 60, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 60, clientY: 60, pointerId: 1 });
    fireEvent.click(getByLabelText('Switch to shape mode'));
    fireEvent.pointerDown(svg, { clientX: 300, clientY: 300, pointerId: 2 });
    fireEvent.pointerUp(svg, { clientX: 300, clientY: 300, pointerId: 2 });
    expect(shapeGroups(container)).toHaveLength(1);
    expect(strokes(container)).toHaveLength(1);

    fireEvent.click(getByLabelText('Clear shapes'));
    expect(shapeGroups(container)).toHaveLength(0);
    expect(strokes(container)).toHaveLength(1); // stroke survives a shape-mode clear
  });

  it('clear button in draw mode clears strokes only, leaving shapes untouched', () => {
    const { container, getByLabelText } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 300, clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 300, clientY: 300, pointerId: 1 });
    fireEvent.click(getByLabelText('Switch to draw mode'));
    fireEvent.pointerDown(svg, { clientX: 10, clientY: 10, pointerId: 2 });
    fireEvent.pointerMove(svg, { clientX: 60, clientY: 60, pointerId: 2 });
    fireEvent.pointerUp(svg, { clientX: 60, clientY: 60, pointerId: 2 });
    expect(shapeGroups(container)).toHaveLength(1);
    expect(strokes(container)).toHaveLength(1);

    fireEvent.click(getByLabelText('Clear doodles'));
    expect(strokes(container)).toHaveLength(0);
    expect(shapeGroups(container)).toHaveLength(1); // shape survives a draw-mode clear
  });

  it('tapping the trash button in shape mode shows an undo toast with shape-scoped wording', () => {
    const { container, getByLabelText, getByRole } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    expect(shapeGroups(container)).toHaveLength(1);

    fireEvent.click(getByLabelText('Clear shapes'));

    expect(getByRole('status')).toHaveTextContent('Shapes cleared');
    expect(getByRole('button', { name: /undo/i })).toBeTruthy();
  });

  it('tapping the trash button in stroke mode shows an undo toast with stroke-scoped wording', () => {
    const { container, getByLabelText, getByRole } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    fireEvent.click(getByLabelText('Switch to draw mode'));
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 60, clientY: 60, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 60, clientY: 60, pointerId: 1 });
    expect(strokes(container)).toHaveLength(1);

    fireEvent.click(getByLabelText('Clear doodles'));

    expect(getByRole('status')).toHaveTextContent('Doodles cleared');
    expect(getByRole('button', { name: /undo/i })).toBeTruthy();
  });

  it('undo restores only the objects cleared for that mode, leaving the other kind untouched', () => {
    const { container, getByLabelText, getByRole } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    const svg = stage(container);
    // Draw a stroke first (draw mode), then switch back to shape mode and spawn a shape.
    fireEvent.click(getByLabelText('Switch to draw mode'));
    fireEvent.pointerDown(svg, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 60, clientY: 60, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 60, clientY: 60, pointerId: 1 });
    fireEvent.click(getByLabelText('Switch to shape mode'));
    fireEvent.pointerDown(svg, { clientX: 300, clientY: 300, pointerId: 2 });
    fireEvent.pointerUp(svg, { clientX: 300, clientY: 300, pointerId: 2 });
    expect(shapeGroups(container)).toHaveLength(1);
    expect(strokes(container)).toHaveLength(1);

    fireEvent.click(getByLabelText('Clear shapes'));
    expect(shapeGroups(container)).toHaveLength(0);
    expect(strokes(container)).toHaveLength(1); // stroke was never touched by a shape-mode clear

    fireEvent.click(getByRole('button', { name: /undo/i }));
    expect(shapeGroups(container)).toHaveLength(1); // shape restored
    expect(strokes(container)).toHaveLength(1); // stroke still untouched
  });

  it('shows no toast when the trash button clears nothing (canvas already empty for that mode)', () => {
    const { getByLabelText, queryByRole } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    fireEvent.click(getByLabelText('Clear shapes'));
    expect(queryByRole('status')).toBeNull();
  });

  it('the undo toast disappears after 5s and the cleared objects are no longer recoverable', () => {
    vi.useFakeTimers();
    const { container, getByLabelText, queryByRole } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.click(getByLabelText('Clear shapes'));
    expect(queryByRole('status')).toBeTruthy();

    act(() => { vi.advanceTimersByTime(5000); });

    expect(queryByRole('status')).toBeNull();
    expect(queryByRole('button', { name: /undo/i })).toBeNull();
    expect(shapeGroups(container)).toHaveLength(0); // still cleared, no way back

    vi.useRealTimers();
  });

  it('mute button toggles its label and tells the sound engine to mute', () => {
    const sound = mockSound();
    const { getByLabelText } = render(<DoodleCanvas rng={seq([0.3])} sound={sound} />);
    fireEvent.click(getByLabelText('Mute'));
    expect(getByLabelText('Unmute')).toBeTruthy();
    expect(sound.setMuted).toHaveBeenCalledWith(true);
  });

  it('trails toggle button flips its label and persists the preference', () => {
    const { getByLabelText } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    fireEvent.click(getByLabelText('Disable trails'));
    expect(getByLabelText('Enable trails')).toBeTruthy();
    expect(localStorage.getItem('doodle-trails')).toBe('false');
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
    const { container, getByLabelText } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    fireEvent.click(getByLabelText('Switch to draw mode'));
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
    // Pinned to phone scale (1x): this test is about the raw DOUBLE_TAP_RADIUS
    // (24px), not viewport-based sizing.
    const widthSpy = vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(375);
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
    widthSpy.mockRestore();
  });

  it('double-tap pops when the second tap lands near the first, from a different pointerId', () => {
    const sound = mockSound();
    // Pinned to phone scale (1x): this test is about the raw DOUBLE_TAP_RADIUS
    // (24px), not viewport-based sizing.
    const widthSpy = vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(375);
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
    widthSpy.mockRestore();
  });

  it('double-tap proximity radius scales with a tablet-scaled shape\'s sizeMultiplier', () => {
    const sound = mockSound();
    const widthSpy = vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1024);
    const { container } = render(<DoodleCanvas rng={seq([0.99])} sound={sound} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    const g = container.querySelector('svg > g[data-id]');
    const firstId = g.getAttribute('data-id');

    fireEvent.pointerDown(g, { clientX: 100, clientY: 100, pointerId: 2 });
    fireEvent.pointerUp(g, { clientX: 100, clientY: 100, pointerId: 2 });
    // 35px apart — beyond the flat 24px radius, but within the tablet-scaled
    // radius (24 * sizeMultiplier(2) = 48px).
    fireEvent.pointerDown(g, { clientX: 135, clientY: 100, pointerId: 3 });
    fireEvent.pointerUp(g, { clientX: 135, clientY: 100, pointerId: 3 });

    expect(container.querySelector(`[data-id="${firstId}"]`)).toBeNull(); // popped
    expect(sound.playPop).toHaveBeenCalledTimes(1);
    widthSpy.mockRestore();
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

  it('pinch resize ceiling is raised to the stage size, not capped at MAX_SIZE', () => {
    // rng=0.1 -> circle, spawn size 33.2 (see earlier tests for the derivation).
    // Stage mocked to 300x500 -> ceiling is min(300,500)=300, radius 150 —
    // far past the old MAX_SIZE/2 (40) clamp.
    const widthSpy = vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(375);
    const rect = {
      width: 300, height: 500, left: 0, top: 0, right: 300, bottom: 500, x: 0, y: 0, toJSON: () => ({}),
    };
    const rectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(rect);
    const { container } = render(<DoodleCanvas rng={seq([0.1])} sound={mockSound()} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 200, clientY: 200, pointerId: 1 });
    const g = container.querySelector('svg > g[data-id]');

    fireEvent.pointerDown(g, { clientX: 195, clientY: 200, pointerId: 10 });
    fireEvent.pointerDown(g, { clientX: 205, clientY: 200, pointerId: 11 });
    fireEvent.pointerMove(svg, { clientX: 0, clientY: 200, pointerId: 10 });
    fireEvent.pointerMove(svg, { clientX: 900, clientY: 200, pointerId: 11 });

    const rAfter = Number(container.querySelector(`[data-id="${g.getAttribute('data-id')}"] circle`).getAttribute('r'));
    expect(rAfter).toBe(150); // min(300, 500) / 2, not MAX_SIZE(80) / 2
    rectSpy.mockRestore();
    widthSpy.mockRestore();
  });

  it('a second finger landing off the shape but near the first finger still starts a pinch', () => {
    const widthSpy = vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(375);
    const { container } = render(<DoodleCanvas rng={seq([0.1])} sound={mockSound()} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 200, clientY: 200, pointerId: 1 });
    const g = container.querySelector('svg > g[data-id]');
    const rBefore = Number(g.querySelector('circle').getAttribute('r'));

    fireEvent.pointerDown(g, { clientX: 200, clientY: 200, pointerId: 10 }); // first finger hits the shape
    // Second finger misses the shape element entirely (lands on bare stage)
    // but within PINCH_PARTNER_RADIUS (60px) of the first finger's point.
    fireEvent.pointerDown(svg, { clientX: 240, clientY: 200, pointerId: 11 });
    fireEvent.pointerMove(svg, { clientX: 170, clientY: 200, pointerId: 10 });
    fireEvent.pointerMove(svg, { clientX: 310, clientY: 200, pointerId: 11 });

    const rAfter = Number(container.querySelector(`[data-id="${g.getAttribute('data-id')}"] circle`).getAttribute('r'));
    expect(rAfter).toBeGreaterThan(rBefore); // pinch resize happened despite the second finger missing the shape
    widthSpy.mockRestore();
  });

  it('a second finger landing far from the first finger does not start a pinch', () => {
    const { container } = render(<DoodleCanvas rng={seq([0.1])} sound={mockSound()} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 200, clientY: 200, pointerId: 1 });
    const g = container.querySelector('svg > g[data-id]');
    const rBefore = g.querySelector('circle').getAttribute('r');

    fireEvent.pointerDown(g, { clientX: 200, clientY: 200, pointerId: 10 });
    fireEvent.pointerDown(svg, { clientX: 700, clientY: 200, pointerId: 11 }); // 500px away, outside PINCH_PARTNER_RADIUS (~378px)
    fireEvent.pointerMove(svg, { clientX: 170, clientY: 200, pointerId: 10 });
    fireEvent.pointerMove(svg, { clientX: 800, clientY: 200, pointerId: 11 });

    const rAfter = container.querySelector(`[data-id="${g.getAttribute('data-id')}"] circle`).getAttribute('r');
    expect(rAfter).toBe(rBefore); // no pinch resize; second finger acted independently
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

  it('a shape being dragged with a single finger does not drift during the drift loop', () => {
    // Same rAF-driving setup as the pinch/drift-loop tests above, exercising
    // the plain single-pointer 'drag' branch of the grabbed-ids wiring.
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

    fireEvent.pointerDown(g, { clientX: 200, clientY: 200, pointerId: 2 });
    fireEvent.pointerMove(svg, { clientX: 260, clientY: 240, pointerId: 2 }); // enter drag
    const before = container.querySelector(`[data-id="${id}"]`).getAttribute('transform');

    act(() => { cbs[cbs.length - 1](500); }); // 0.5s elapsed -> drift loop ticks

    const after = container.querySelector(`[data-id="${id}"]`).getAttribute('transform');
    expect(after).toBe(before); // held still by the drag, not drifted

    nowSpy.mockRestore();
    rectSpy.mockRestore();
  });

  it('bouncing different-color shapes spawns a spark burst and keeps both shapes', () => {
    const sound = mockSound();
    // Two spawns, 7 rng draws each: [angle, speed, shapeType, color,
    // rotation, size, note] — the tuning panel's default driftMin/driftMax
    // (20/100) differ, so createShape always draws a speed value (see
    // driftSpeed in doodleShapes.js), unlike the degenerate default-range
    // case used by lib-level tests.
    // a: angle=0 (drifts +x, toward b), shapeType draw 0 -> 'circle', color
    // draw 0 -> COLORS[0].
    // b: angle draw 0.5 -> angle=pi (drifts -x, toward a — a genuine closing
    // velocity, so the collision produces a real impulse and fires a bounce
    // event; a bounce event only fires when velAlongNormal < 0 — see Fix 3),
    // shapeType draw 0.3 -> 'square' (different from a), color draw 0.2 ->
    // COLORS[1] (different from a) — so this pair shares neither color nor
    // shapeType (merge would otherwise fire under the "same color OR same
    // shapeType" rule).
    const rng = seq([0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0.3, 0.2, 0, 0, 0]);
    const { cbs, rectSpy, nowSpy } = driveOneFrame();
    const { container } = render(<DoodleCanvas rng={rng} sound={sound} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerDown(svg, { clientX: 210, clientY: 200, pointerId: 2 });
    fireEvent.pointerUp(svg, { clientX: 210, clientY: 200, pointerId: 2 });
    expect(shapeGroups(container)).toHaveLength(2);

    act(() => { cbs[cbs.length - 1](16); });

    expect(shapeGroups(container)).toHaveLength(2); // no merge
    expect(container.querySelectorAll('line').length).toBeGreaterThan(0); // spark burst

    nowSpy.mockRestore();
    rectSpy.mockRestore();
  });

  it('merging same-color shapes spawns spiral particles, plays a chime, and reduces shape count', () => {
    const sound = mockSound();
    // Both spawns use color draw 0 -> COLORS[0] for both -> same color.
    const rng = seq([0, 0, 0, 0, 0, 0]);
    const { cbs, rectSpy, nowSpy } = driveOneFrame();
    const { container } = render(<DoodleCanvas rng={rng} sound={sound} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerDown(svg, { clientX: 210, clientY: 200, pointerId: 2 });
    fireEvent.pointerUp(svg, { clientX: 210, clientY: 200, pointerId: 2 });
    expect(shapeGroups(container)).toHaveLength(2);
    sound.playNote.mockClear();

    act(() => { cbs[cbs.length - 1](16); });

    expect(shapeGroups(container)).toHaveLength(1); // merged
    expect(container.querySelectorAll('circle[cx]').length).toBeGreaterThan(0); // spiral particles
    expect(sound.playNote).toHaveBeenCalledTimes(1); // merge chime

    nowSpy.mockRestore();
    rectSpy.mockRestore();
  });

  it('never persists particles to localStorage, only shapes and strokes', () => {
    vi.useFakeTimers();
    const rng = seq([0, 0, 0, 0, 0, 0]); // both spawns same color -> triggers a merge + particles
    const { cbs, rectSpy } = driveOneFrame();
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(0);
    const { container } = render(<DoodleCanvas rng={rng} sound={mockSound()} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerDown(svg, { clientX: 210, clientY: 200, pointerId: 2 });
    fireEvent.pointerUp(svg, { clientX: 210, clientY: 200, pointerId: 2 });

    act(() => { cbs[cbs.length - 1](16); });
    expect(container.querySelectorAll('circle[cx]').length).toBeGreaterThan(0); // particles did spawn
    act(() => { vi.advanceTimersByTime(1000); }); // flush the persistence interval

    const saved = JSON.parse(localStorage.getItem('doodle-objects'));
    expect(saved.length).toBeGreaterThan(0);
    saved.forEach((o) => expect(['shape', 'stroke']).toContain(o.kind));

    nowSpy.mockRestore();
    rectSpy.mockRestore();
    vi.useRealTimers();
  });

  it('moving shapes spawn a dust trail while trails are enabled', () => {
    const { cbs, rectSpy, nowSpy } = driveOneFrame();
    const { container } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 500, clientY: 500, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 500, clientY: 500, pointerId: 1 });

    act(() => { cbs[cbs.length - 1](16); });

    expect(container.querySelectorAll('circle[cx]').length).toBeGreaterThan(0);

    nowSpy.mockRestore();
    rectSpy.mockRestore();
  });

  it('disabling trails stops new dust particles from spawning', () => {
    const { cbs, rectSpy, nowSpy } = driveOneFrame();
    const { container, getByLabelText } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    fireEvent.click(getByLabelText('Disable trails'));
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 500, clientY: 500, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 500, clientY: 500, pointerId: 1 });

    act(() => { cbs[cbs.length - 1](16); });

    expect(container.querySelectorAll('circle[cx]').length).toBe(0);

    nowSpy.mockRestore();
    rectSpy.mockRestore();
  });

  it('dragging a shape still spawns a dust trail (grabbed shape is not skipped)', () => {
    // Fix 2 regression: the drift-loop dust pass used to explicitly skip
    // `o.id === grabbed`, so dragging a shape produced no dust at all.
    const { cbs, rectSpy, nowSpy } = driveOneFrame();
    const { container } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 500, clientY: 500, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 500, clientY: 500, pointerId: 1 });
    const g = container.querySelector('svg > g[data-id]');

    // Start dragging the shape (mode becomes 'drag', so it's the grabbed one
    // for the frame driven below).
    fireEvent.pointerDown(g, { clientX: 500, clientY: 500, pointerId: 2 });
    fireEvent.pointerMove(svg, { clientX: 560, clientY: 500, pointerId: 2 });

    act(() => { cbs[cbs.length - 1](16); });

    expect(container.querySelectorAll('circle[cx]').length).toBeGreaterThan(0);

    nowSpy.mockRestore();
    rectSpy.mockRestore();
  });

  it('tuning panel is closed by default and opens on toggle', () => {
    const { getByLabelText, queryByRole } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    expect(queryByRole('dialog', { name: 'Tuning settings' })).toBeNull();
    fireEvent.click(getByLabelText('Open tuning panel'));
    expect(queryByRole('dialog', { name: 'Tuning settings' })).toBeTruthy();
    fireEvent.click(getByLabelText('Close tuning panel'));
    expect(queryByRole('dialog', { name: 'Tuning settings' })).toBeNull();
  });

  it('changing a tuning value persists it to localStorage under doodle-tuning', () => {
    const { getByLabelText } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    fireEvent.click(getByLabelText('Open tuning panel'));
    fireEvent.change(getByLabelText('Max particles'), { target: { value: '400' } });
    const stored = JSON.parse(localStorage.getItem('doodle-tuning'));
    expect(stored.maxParticles).toBe(400);
  });

  it('reset to defaults restores the original tuning values', () => {
    const { getByLabelText, getByText } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    fireEvent.click(getByLabelText('Open tuning panel'));
    fireEvent.change(getByLabelText('Max particles'), { target: { value: '400' } });
    fireEvent.click(getByText('Reset to defaults'));
    expect(getByLabelText('Max particles').value).toBe('150');
  });

  it('throttles dust spawning instead of spawning it on literally every frame', () => {
    // Fix 4 regression: with DRIFT_SPEED (18px/s) always above
    // DUST_VELOCITY_THRESHOLD (5px/s), dust used to spawn unconditionally
    // every frame for every shape, starving the particle buffer's rarer
    // merge-spiral/collision-spark effects.
    const { cbs, rectSpy, nowSpy } = driveOneFrame();
    const { container } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 500, clientY: 500, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 500, clientY: 500, pointerId: 1 });

    act(() => { cbs[cbs.length - 1](16); }); // frame 1: dust spawns
    const afterFirstFrame = container.querySelectorAll('circle[cx]').length;
    expect(afterFirstFrame).toBeGreaterThan(0);

    act(() => { cbs[cbs.length - 1](32); }); // frame 2: throttled — no new dust
    const afterSecondFrame = container.querySelectorAll('circle[cx]').length;
    expect(afterSecondFrame).toBe(afterFirstFrame); // unchanged: dust did not spawn every frame

    nowSpy.mockRestore();
    rectSpy.mockRestore();
  });

  it('interleaving pointer input with a live rAF loop does not drop stroke points', () => {
    // Fix 1 regression: advance() used to call setObjects(nextArray) with a
    // plain computed value instead of an updater function. React composes
    // queued updater-function setState calls against each other, but a
    // plain-value setState call REPLACES whatever is pending — so a
    // pointermove-dispatched startStroke/appendStrokePoint update not yet
    // committed when a rAF tick's advance() ran could be silently discarded.
    //
    // Each pointermove and the rAF tick that follows it are dispatched
    // inside the SAME act() block (rather than letting each fireEvent flush
    // on its own, as most other tests in this file do) so React batches them
    // together — the tick's advance() call genuinely races the still-
    // uncommitted stroke update, exactly the interleaving the bug depended
    // on. Under the old plain-value setObjects, this reliably wiped the
    // in-progress stroke entirely.
    const { cbs, rectSpy, nowSpy } = driveOneFrame();
    const { container, getByLabelText } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    fireEvent.click(getByLabelText('Switch to draw mode'));
    const svg = stage(container);

    fireEvent.pointerDown(svg, { clientX: 10, clientY: 10, pointerId: 1 });

    act(() => {
      fireEvent.pointerMove(svg, { clientX: 60, clientY: 60, pointerId: 1 }); // starts the stroke
      cbs[cbs.length - 1](16); // live rAF tick, still in the same batch
    });

    act(() => {
      fireEvent.pointerMove(svg, { clientX: 90, clientY: 100, pointerId: 1 }); // continues the stroke
      cbs[cbs.length - 1](32); // another live rAF tick, same batch
    });

    fireEvent.pointerUp(svg, { clientX: 90, clientY: 100, pointerId: 1 });

    const polyline = strokes(container)[0];
    expect(polyline).toBeTruthy();
    const points = polyline.getAttribute('points').trim().split(/\s+/);
    // start (10,10) + move to (60,60) + move to (90,100) = 3 accumulated points.
    expect(points).toHaveLength(3);

    nowSpy.mockRestore();
    rectSpy.mockRestore();
  });

  const persistedShape = () => {
    act(() => { vi.advanceTimersByTime(1000); }); // flush the persistence interval
    return JSON.parse(localStorage.getItem('doodle-objects')).find((o) => o.kind === 'shape');
  };

  // Spawns one shape, then drags it along `path`: pointerdown on the shape
  // group, moves on the stage — the pattern the existing drag tests use. A
  // pointerdown on the svg itself has no [data-id] ancestor, so it would
  // become an inert empty-canvas drag, never a shape drag. Each move sets the
  // fake clock so the drag samples carry distinct timestamps.
  const spawnAndDrag = (container, path) => {
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    const g = container.querySelector('svg > g[data-id]');
    fireEvent.pointerDown(g, { clientX: 100, clientY: 100, pointerId: 2 });
    path.forEach(({ x, y, t }) => {
      vi.setSystemTime(t);
      fireEvent.pointerMove(svg, { clientX: x, clientY: y, pointerId: 2 });
    });
    return svg;
  };

  it('a flick release throws the shape along the flick direction', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { container } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    // First move clears MOVE_THRESHOLD (8px) so the pointer becomes a drag;
    // then 60px in 30ms = 2000px/s raw, clamped down to maxThrowSpeed.
    const svg = spawnAndDrag(container, [
      { x: 140, y: 100, t: 100 },
      { x: 170, y: 100, t: 120 },
      { x: 200, y: 100, t: 130 },
    ]);
    vi.setSystemTime(135);
    fireEvent.pointerUp(svg, { clientX: 200, clientY: 100, pointerId: 2 });

    const shape = persistedShape();
    expect(shape.vx).toBeGreaterThan(0);
    expect(shape.vy).toBeCloseTo(0);
    expect(Math.hypot(shape.vx, shape.vy)).toBeCloseTo(600); // DEFAULT_MAX_THROW_SPEED
    vi.useRealTimers();
  });

  it('a raised max throw speed is not silently re-clamped back down by the per-frame max shape speed', () => {
    // Fix regression: advanceShape's per-frame maxSpeed clamp runs every rAF
    // tick after a throw, not just throwVelocity's one-time release clamp.
    // Before the fix, a shape released above tuning.maxSpeed's default
    // (600, unrelated to and lower than maxThrowSpeed's own usable range up
    // to 3000) got silently re-clamped down to 600 on the very next tick,
    // making a raised "Max throw speed" appear to do nothing.
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { container, getByLabelText } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    fireEvent.click(getByLabelText('Open tuning panel'));
    fireEvent.change(getByLabelText('Max throw speed (px/s)'), { target: { value: '2500' } });
    fireEvent.click(getByLabelText('Close tuning panel'));

    // Same flick as above: 60px in 30ms = 2000px/s raw — now under the
    // raised 2500 throw ceiling, so throwVelocity itself doesn't clamp it.
    const svg = spawnAndDrag(container, [
      { x: 140, y: 100, t: 100 },
      { x: 170, y: 100, t: 120 },
      { x: 200, y: 100, t: 130 },
    ]);
    vi.setSystemTime(135);
    fireEvent.pointerUp(svg, { clientX: 200, clientY: 100, pointerId: 2 });

    // persistedShape() advances 1000ms of (faked) rAF ticks, which is where
    // the bug fired: the per-frame clamp is not tilt's clamp to preserve.
    const shape = persistedShape();
    expect(Math.hypot(shape.vx, shape.vy)).toBeCloseTo(2000);
    vi.useRealTimers();
  });

  it('a release after the finger stops moving parks the shape', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { container } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    const svg = spawnAndDrag(container, [
      { x: 140, y: 100, t: 100 },
      { x: 200, y: 100, t: 130 },
    ]);
    // Finger held still for 400ms: no pointermove fires, so every sample ages
    // out of the window that ends at the release.
    vi.setSystemTime(530);
    fireEvent.pointerUp(svg, { clientX: 200, clientY: 100, pointerId: 2 });

    const shape = persistedShape();
    expect(shape.vx).toBe(0);
    expect(shape.vy).toBe(0);
    vi.useRealTimers();
  });

  it('pointercancel parks the shape instead of throwing it', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { container } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    const svg = spawnAndDrag(container, [
      { x: 140, y: 100, t: 100 },
      { x: 200, y: 100, t: 130 },
    ]);
    vi.setSystemTime(135);
    fireEvent.pointerCancel(svg, { clientX: 200, clientY: 100, pointerId: 2 });

    const shape = persistedShape();
    expect(shape.vx).toBe(0);
    expect(shape.vy).toBe(0);
    vi.useRealTimers();
  });

  it('ending a pinch with no intervening move leaves the shape\'s drift velocity untouched', () => {
    // Regression: endPinchMember promotes the pinch survivor to 'drag' with a
    // fresh, empty samples buffer (the fix for a crash on release). Releasing
    // that pointer immediately — no pointermove in between — must NOT be
    // read as "held still, throw at zero speed": that would silently
    // overwrite the shape's pre-pinch ambient drift with (0, 0), even though
    // the user never made a throwing gesture.
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { container } = render(<DoodleCanvas rng={seq([0.1])} sound={mockSound()} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 200, clientY: 200, pointerId: 1 });
    const g = container.querySelector('svg > g[data-id]');
    const before = persistedShape();

    fireEvent.pointerDown(g, { clientX: 190, clientY: 200, pointerId: 10 });
    fireEvent.pointerDown(g, { clientX: 210, clientY: 200, pointerId: 11 });
    fireEvent.pointerMove(svg, { clientX: 170, clientY: 200, pointerId: 10 }); // actually pinch-resize it
    fireEvent.pointerMove(svg, { clientX: 230, clientY: 200, pointerId: 11 });

    fireEvent.pointerUp(svg, { clientX: 170, clientY: 200, pointerId: 10 }); // one finger lifts: ends the pinch,
    // promoting pointer 11 to 'drag' with samples reset to [].
    fireEvent.pointerUp(svg, { clientX: 230, clientY: 200, pointerId: 11 }); // survivor lifts with NO intervening
    // pointermove, so its samples buffer is still empty.

    const after = persistedShape();
    expect(after.vx).toBe(before.vx);
    expect(after.vy).toBe(before.vy);
    vi.useRealTimers();
  });

  it('ending a pinch with pointercancel instead of pointerup also leaves drift velocity untouched', () => {
    // Same regression as the pointerup version above, but via pointercancel:
    // onPointerCancel's 'drag' branch used to call throwShape(id, 0, 0)
    // unconditionally, even when the promoted pinch survivor's samples
    // buffer was still empty (no intervening pointermove) — e.g. palm
    // rejection cancelling the survivor's pointer right after the handoff.
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { container } = render(<DoodleCanvas rng={seq([0.1])} sound={mockSound()} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 200, clientY: 200, pointerId: 1 });
    const g = container.querySelector('svg > g[data-id]');
    const before = persistedShape();

    fireEvent.pointerDown(g, { clientX: 190, clientY: 200, pointerId: 10 });
    fireEvent.pointerDown(g, { clientX: 210, clientY: 200, pointerId: 11 });
    fireEvent.pointerMove(svg, { clientX: 170, clientY: 200, pointerId: 10 }); // actually pinch-resize it
    fireEvent.pointerMove(svg, { clientX: 230, clientY: 200, pointerId: 11 });

    fireEvent.pointerUp(svg, { clientX: 170, clientY: 200, pointerId: 10 }); // one finger lifts: ends the pinch,
    // promoting pointer 11 to 'drag' with samples reset to [].
    fireEvent.pointerCancel(svg, { clientX: 230, clientY: 200, pointerId: 11 }); // survivor is CANCELLED (not
    // released), with NO intervening pointermove, so its samples buffer is
    // still empty.

    const after = persistedShape();
    expect(after.vx).toBe(before.vx);
    expect(after.vy).toBe(before.vy);
    vi.useRealTimers();
  });

  it('passes the shape type to playNote on spawn and on tap', () => {
    const sound = mockSound();
    const { container } = render(<DoodleCanvas rng={seq([0.3])} sound={sound} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 100, clientY: 100, pointerId: 1 });

    const [, spawnType] = sound.playNote.mock.calls[0];
    expect(['circle', 'square', 'triangle', 'star']).toContain(spawnType);

    // Tap the shape itself: a pointerdown on the svg has no [data-id]
    // ancestor and would spawn a second shape instead of tapping this one.
    sound.playNote.mockClear();
    const g = container.querySelector('svg > g[data-id]');
    fireEvent.pointerDown(g, { clientX: 100, clientY: 100, pointerId: 2 });
    fireEvent.pointerUp(g, { clientX: 100, clientY: 100, pointerId: 2 });
    const [, tapType] = sound.playNote.mock.calls[0];
    expect(tapType).toBe(spawnType);
  });

  it('passes the merged shape type to playNote on a merge chime', () => {
    const sound = mockSound();
    const rng = seq([0, 0, 0, 0, 0, 0]);
    const { cbs, rectSpy, nowSpy } = driveOneFrame();
    const { container } = render(<DoodleCanvas rng={rng} sound={sound} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerDown(svg, { clientX: 210, clientY: 200, pointerId: 2 });
    fireEvent.pointerUp(svg, { clientX: 210, clientY: 200, pointerId: 2 });
    sound.playNote.mockClear();

    act(() => { cbs[cbs.length - 1](16); });

    expect(sound.playNote).toHaveBeenCalledTimes(1);
    const [, mergeType] = sound.playNote.mock.calls[0];
    expect(['circle', 'square', 'triangle', 'star']).toContain(mergeType);

    nowSpy.mockRestore();
    rectSpy.mockRestore();
  });

  // jsdom has no navigator.vibrate, so define it per test rather than
  // stubbing the whole navigator object.
  const installVibrate = () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    return vibrate;
  };

  // Spawns one shape and double-taps it to pop. rng high so the shape is
  // large enough to split, matching the existing pop tests. pointerdown and
  // pointerup both fire on the shape group — a pointerdown on the svg has no
  // [data-id] ancestor and would spawn another shape instead of tapping this
  // one. Both taps land inside DOUBLE_TAP_MS (300ms) because fireEvent is
  // synchronous under real timers.
  const spawnAndPop = (container) => {
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    const g = container.querySelector('svg > g[data-id]');
    fireEvent.pointerDown(g, { clientX: 100, clientY: 100, pointerId: 2 });
    fireEvent.pointerUp(g, { clientX: 100, clientY: 100, pointerId: 2 });
    fireEvent.pointerDown(g, { clientX: 100, clientY: 100, pointerId: 3 });
    fireEvent.pointerUp(g, { clientX: 100, clientY: 100, pointerId: 3 });
  };

  it('vibrates on a pop', () => {
    const vibrate = installVibrate();
    const { container } = render(<DoodleCanvas rng={seq([0.99])} sound={mockSound()} />);
    spawnAndPop(container);
    expect(vibrate).toHaveBeenCalled();
  });

  it('stays silent on a pop while muted', () => {
    const vibrate = installVibrate();
    const { container, getByLabelText } = render(
      <DoodleCanvas rng={seq([0.99])} sound={mockSound()} />,
    );
    fireEvent.click(getByLabelText('Mute'));
    spawnAndPop(container);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('runs without navigator.vibrate', () => {
    const { container } = render(<DoodleCanvas rng={seq([0.99])} sound={mockSound()} />);
    expect(() => spawnAndPop(container)).not.toThrow();
  });

  it('vibrates on a merge chime', () => {
    // Near-identical to 'passes the merged shape type to playNote on a merge
    // chime' above — closes the gap that haptics' merge-vibration wiring
    // (DoodleCanvas.jsx's advance-loop 'merge' event handler) had no
    // component-level test.
    const vibrate = installVibrate();
    const rng = seq([0, 0, 0, 0, 0, 0]);
    const { cbs, rectSpy, nowSpy } = driveOneFrame();
    const { container } = render(<DoodleCanvas rng={rng} sound={mockSound()} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerDown(svg, { clientX: 210, clientY: 200, pointerId: 2 });
    fireEvent.pointerUp(svg, { clientX: 210, clientY: 200, pointerId: 2 });
    expect(shapeGroups(container)).toHaveLength(2);

    act(() => { cbs[cbs.length - 1](16); });

    expect(shapeGroups(container)).toHaveLength(1); // merged
    expect(vibrate).toHaveBeenCalled();

    nowSpy.mockRestore();
    rectSpy.mockRestore();
  });

  it('cycles the toolbar speed button through slow motion, freeze and normal', () => {
    const { getByLabelText } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    fireEvent.click(getByLabelText('Slow motion'));
    expect(localStorage.getItem('doodle-time-scale')).toBe('0.25');
    fireEvent.click(getByLabelText('Freeze'));
    expect(localStorage.getItem('doodle-time-scale')).toBe('0');
    fireEvent.click(getByLabelText('Normal speed'));
    expect(localStorage.getItem('doodle-time-scale')).toBe('1');
  });

  it('restores a stored slow-motion choice but never opens frozen', () => {
    localStorage.setItem('doodle-time-scale', '0.25');
    const { getByLabelText, unmount } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    expect(getByLabelText('Freeze')).toBeInTheDocument(); // next action from 0.25
    unmount();

    localStorage.setItem('doodle-time-scale', '0');
    const second = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    // A child cannot diagnose why nothing moves, so a stored freeze opens at 1.
    expect(second.getByLabelText('Slow motion')).toBeInTheDocument();
  });

  it('freezing stops the shape moving but leaves pointer interaction working', () => {
    const { cbs, rectSpy, nowSpy } = driveOneFrame();
    const { container, getByLabelText } = render(
      <DoodleCanvas rng={seq([0.3])} sound={mockSound()} />,
    );
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 500, clientY: 500, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 500, clientY: 500, pointerId: 1 });

    fireEvent.click(getByLabelText('Slow motion'));
    fireEvent.click(getByLabelText('Freeze'));

    const before = shapeGroups(container)[0].getAttribute('transform');
    act(() => { cbs[cbs.length - 1](16); });
    act(() => { cbs[cbs.length - 1](32); });
    expect(shapeGroups(container)[0].getAttribute('transform')).toBe(before);
    // No dust accumulates either: advanceParticles(p, 0) would age nothing,
    // so the tick must skip the body rather than pass a zero delta.
    expect(container.querySelectorAll('circle[cx]')).toHaveLength(0);

    // Pointer interaction still works while frozen.
    fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 2 });
    fireEvent.pointerUp(svg, { clientX: 100, clientY: 100, pointerId: 2 });
    expect(shapeGroups(container)).toHaveLength(2);

    nowSpy.mockRestore();
    rectSpy.mockRestore();
  });

  it('caps particles at tuning.maxParticles even while frozen', () => {
    // Regression: advanceParticles (the only place maxParticles is enforced)
    // never runs on a frozen tick, but addParticles (tap-spawned squash
    // poofs) is still reachable while frozen — so without a trim in the
    // freeze branch itself, particles would accumulate unbounded for as
    // long as the freeze lasts.
    const { cbs, rectSpy, nowSpy } = driveOneFrame();
    const { container, getByLabelText } = render(
      <DoodleCanvas rng={seq([0.3])} sound={mockSound()} />,
    );
    fireEvent.click(getByLabelText('Open tuning panel'));
    fireEvent.change(getByLabelText('Max particles'), { target: { value: '3' } });
    fireEvent.click(getByLabelText('Close tuning panel'));

    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 500, clientY: 500, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 500, clientY: 500, pointerId: 1 });

    fireEvent.click(getByLabelText('Slow motion'));
    fireEvent.click(getByLabelText('Freeze'));

    const g = container.querySelector('svg > g[data-id]');
    // A single tap-squash spawns 5 particles — already past the 3-particle
    // cap — while frozen.
    fireEvent.pointerDown(g, { clientX: 500, clientY: 500, pointerId: 2 });
    fireEvent.pointerUp(g, { clientX: 500, clientY: 500, pointerId: 2 });
    // Drive one frozen tick: this is where the trim must happen. The tick
    // itself triggers no state update, so it won't force a re-render by
    // itself — toggling mute afterwards forces one, surfacing whatever the
    // (now-trimmed) particle ref actually holds.
    act(() => { cbs[cbs.length - 1](16); });
    fireEvent.click(getByLabelText('Mute'));

    expect(container.querySelectorAll('circle[cx]').length).toBe(3);

    nowSpy.mockRestore();
    rectSpy.mockRestore();
  });

  it('a frozen tick keeps re-arming itself and motion resumes after unfreezing', () => {
    // Regression: if the freeze branch's requestAnimationFrame(tick) call
    // were ever deleted, cbs would stop growing and driving "the latest
    // frame" would silently keep re-running the same already-early-returning
    // callback — the existing freeze tests would still pass despite the loop
    // being permanently stuck.
    const { cbs, rectSpy, nowSpy } = driveOneFrame();
    const { container, getByLabelText } = render(
      <DoodleCanvas rng={seq([0.3])} sound={mockSound()} />,
    );
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 500, clientY: 500, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 500, clientY: 500, pointerId: 1 });

    fireEvent.click(getByLabelText('Slow motion'));
    fireEvent.click(getByLabelText('Freeze'));

    const cbsCountBeforeFrozenTick = cbs.length;
    act(() => { cbs[cbs.length - 1](16); });
    expect(cbs.length).toBeGreaterThan(cbsCountBeforeFrozenTick); // re-armed itself while frozen

    fireEvent.click(getByLabelText('Normal speed')); // unfreeze

    const before = shapeGroups(container)[0].getAttribute('transform');
    act(() => { cbs[cbs.length - 1](32); }); // first tick after unfreezing
    const after = shapeGroups(container)[0].getAttribute('transform');
    expect(after).not.toBe(before); // motion actually resumed, not just the loop ticking

    // Bounded displacement: if `last` weren't correctly recorded during the
    // freeze, unfreezing would apply one huge stale delta and the shape
    // would jump far more than one normal frame's worth of drift.
    const parse = (t) => t.match(/^translate\(([-\d.]+) ([-\d.]+)\)/).slice(1, 3).map(Number);
    const [xBefore, yBefore] = parse(before);
    const [xAfter, yAfter] = parse(after);
    expect(Math.hypot(xAfter - xBefore, yAfter - yBefore)).toBeLessThan(20);

    nowSpy.mockRestore();
    rectSpy.mockRestore();
  });

  it('keeps advancing shapes at normal speed', () => {
    const { cbs, rectSpy, nowSpy } = driveOneFrame();
    const { container } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 500, clientY: 500, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 500, clientY: 500, pointerId: 1 });

    const before = shapeGroups(container)[0].getAttribute('transform');
    act(() => { cbs[cbs.length - 1](16); });
    expect(shapeGroups(container)[0].getAttribute('transform')).not.toBe(before);

    nowSpy.mockRestore();
    rectSpy.mockRestore();
  });

  it('slow motion (0.25x) produces roughly a quarter of normal speed\'s displacement', () => {
    // Since dt = rawDt * timeScaleRef.current is the identity at scale 1,
    // and the freeze branch (scale 0) never reaches this line at all, the
    // multiplication itself is otherwise never exercised by a behavioral
    // assertion — deleting it would not fail any other test.
    const parse = (t) => t.match(/^translate\(([-\d.]+) ([-\d.]+)\)/).slice(1, 3).map(Number);

    const driveAndMeasure = (scaleButtonLabels) => {
      const { cbs, rectSpy, nowSpy } = driveOneFrame();
      const { container, getByLabelText, unmount } = render(
        <DoodleCanvas rng={seq([0.3])} sound={mockSound()} />,
      );
      const svg = stage(container);
      fireEvent.pointerDown(svg, { clientX: 500, clientY: 500, pointerId: 1 });
      fireEvent.pointerUp(svg, { clientX: 500, clientY: 500, pointerId: 1 });
      scaleButtonLabels.forEach((label) => fireEvent.click(getByLabelText(label)));

      const [xBefore, yBefore] = parse(shapeGroups(container)[0].getAttribute('transform'));
      act(() => { cbs[cbs.length - 1](16); });
      const [xAfter, yAfter] = parse(shapeGroups(container)[0].getAttribute('transform'));

      unmount();
      nowSpy.mockRestore();
      rectSpy.mockRestore();
      return Math.hypot(xAfter - xBefore, yAfter - yBefore);
    };

    const normalDisplacement = driveAndMeasure([]);
    const slowDisplacement = driveAndMeasure(['Slow motion']);

    expect(normalDisplacement).toBeGreaterThan(0);
    expect(slowDisplacement).toBeGreaterThan(0);
    expect(slowDisplacement).toBeLessThan(normalDisplacement * 0.5); // meaningfully smaller
    // Roughly a quarter, with generous tolerance — physics-integrated
    // motion, not a pure arithmetic check.
    expect(Math.abs(slowDisplacement - normalDisplacement * 0.25)).toBeLessThan(normalDisplacement * 0.1);
  });

  it('captures a flick throw while frozen, taking effect once unfrozen', () => {
    // Cross-feature composition: pointer sampling (onPointerMove/onPointerUp)
    // happens outside the rAF drift loop, so it isn't gated on timeScale —
    // a flick performed while frozen should still compute and persist a
    // real throw velocity, even though the shape never visibly moved.
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { container, getByLabelText } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    fireEvent.click(getByLabelText('Slow motion'));
    fireEvent.click(getByLabelText('Freeze'));
    expect(getByLabelText('Normal speed')).toBeInTheDocument(); // confirms frozen (timeScale 0)

    // Same flick sequence as 'a flick release throws the shape along the
    // flick direction': first move clears MOVE_THRESHOLD, then 60px in 30ms.
    const svg = spawnAndDrag(container, [
      { x: 140, y: 100, t: 100 },
      { x: 170, y: 100, t: 120 },
      { x: 200, y: 100, t: 130 },
    ]);
    vi.setSystemTime(135);
    fireEvent.pointerUp(svg, { clientX: 200, clientY: 100, pointerId: 2 });

    const shape = persistedShape();
    expect(Math.hypot(shape.vx, shape.vy)).toBeGreaterThan(0);
    vi.useRealTimers();
  });
  it('releasing a drag grants the shape wall immunity so it is not ejected', () => {
    vi.useFakeTimers();
    const { cbs, rectSpy, nowSpy } = driveOneFrame();
    const { container } = render(<DoodleCanvas rng={seq([0])} sound={mockSound()} />);
    const svg = stage(container);

    fireEvent.pointerDown(svg, { clientX: 300, clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 300, clientY: 300, pointerId: 1 });
    const g = container.querySelector('svg > g[data-id]');
    const id = g.getAttribute('data-id');

    fireEvent.pointerDown(g, { clientX: 300, clientY: 300, pointerId: 2 });
    fireEvent.pointerMove(svg, { clientX: 400, clientY: 400, pointerId: 2 });
    fireEvent.pointerUp(svg, { clientX: 400, clientY: 400, pointerId: 2 });

    act(() => { cbs[cbs.length - 1](16); });
    act(() => { vi.advanceTimersByTime(1000); });

    const saved = JSON.parse(localStorage.getItem('doodle-objects'));
    const shape = saved.find((o) => o.id === id);
    expect(shape.wallImmunityRemaining).toBeGreaterThan(0);

    nowSpy.mockRestore();
    rectSpy.mockRestore();
    vi.useRealTimers();
  });

  it('a shape drifting into a drawn stroke spawns a bounce burst', () => {
    // seq([0]) -> createShape draws [angle 0, speed, shapeType, color,
    // rotation, size, note]: angle 0 gives vx = +driftMin (20px/s, +x), size
    // is the 2x tablet floor (56 -> r 28), so contact with a line at x = 560
    // begins 32px out. Spawning at x = 535 starts it already overlapping and
    // moving into the line.
    const widthSpy = vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1024);
    const { cbs, rectSpy, nowSpy } = driveOneFrame();
    const { container, getByLabelText } = render(
      <DoodleCanvas rng={seq([0])} sound={mockSound()} />,
    );
    const svg = stage(container);

    fireEvent.click(getByLabelText('Switch to draw mode'));
    fireEvent.pointerDown(svg, { clientX: 560, clientY: 400, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 560, clientY: 600, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 560, clientY: 600, pointerId: 1 });
    fireEvent.click(getByLabelText('Switch to shape mode'));
    fireEvent.pointerDown(svg, { clientX: 535, clientY: 500, pointerId: 2 });
    fireEvent.pointerUp(svg, { clientX: 535, clientY: 500, pointerId: 2 });

    act(() => { cbs[cbs.length - 1](16); });

    expect(container.querySelectorAll('line').length).toBeGreaterThan(0);

    widthSpy.mockRestore();
    nowSpy.mockRestore();
    rectSpy.mockRestore();
  });


  it('shows no motion-permission button when the platform does not gate motion', () => {
    const { queryByLabelText } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    expect(queryByLabelText('Enable motion controls')).toBeNull();
  });

  it('shows a motion-permission button when the platform gates motion', () => {
    vi.stubGlobal('DeviceMotionEvent', { requestPermission: vi.fn().mockResolvedValue('granted') });
    const { getByLabelText } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    expect(getByLabelText('Enable motion controls')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('tapping the motion-permission button requests permission and hides the button', async () => {
    const requestPermission = vi.fn().mockResolvedValue('granted');
    vi.stubGlobal('DeviceMotionEvent', { requestPermission });
    vi.stubGlobal('DeviceOrientationEvent', { requestPermission });
    const { getByLabelText, queryByLabelText } = render(
      <DoodleCanvas rng={seq([0.3])} sound={mockSound()} />,
    );
    await act(async () => {
      fireEvent.click(getByLabelText('Enable motion controls'));
    });
    expect(requestPermission).toHaveBeenCalledTimes(2);
    expect(queryByLabelText('Enable motion controls')).toBeNull();
    vi.unstubAllGlobals();
  });

  it('keeps a labelled button visible when motion permission is denied', async () => {
    vi.stubGlobal('DeviceMotionEvent', { requestPermission: vi.fn().mockResolvedValue('denied') });
    const { getByLabelText } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    await act(async () => {
      fireEvent.click(getByLabelText('Enable motion controls'));
    });
    expect(getByLabelText('Motion controls blocked')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('a shake plays a chord and spawns a burst per shape', () => {
    const sound = mockSound();
    const { container } = render(<DoodleCanvas rng={seq([0.3])} sound={sound} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    expect(shapeGroups(container)).toHaveLength(1);

    act(() => dispatchShake());

    expect(sound.playChord).toHaveBeenCalledTimes(1);
    // spawnBurst emits 8 'burst' particles, each rendered as an svg <line>.
    expect(container.querySelectorAll('svg line')).toHaveLength(8);
    // The shape survives a shake — it is pushed, not popped.
    expect(shapeGroups(container)).toHaveLength(1);
  });

  it('a shake on an empty canvas plays nothing', () => {
    const sound = mockSound();
    render(<DoodleCanvas rng={seq([0.3])} sound={sound} />);
    act(() => dispatchShake());
    expect(sound.playChord).not.toHaveBeenCalled();
  });

  it('a shake leaves strokes alone', () => {
    const { container, getByLabelText } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    fireEvent.click(getByLabelText('Switch to draw mode'));
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 10, clientY: 10, pointerId: 1 });
    expect(strokes(container)).toHaveLength(1);
    act(() => dispatchShake());
    expect(strokes(container)).toHaveLength(1);
  });

  it('shows the tilt toggle, off by default, when motion needs no permission', () => {
    const { getByLabelText } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    expect(getByLabelText('Enable tilt gravity')).toBeInTheDocument();
  });

  it('hides the tilt toggle until motion permission is granted', () => {
    vi.stubGlobal('DeviceMotionEvent', { requestPermission: vi.fn().mockResolvedValue('granted') });
    const { queryByLabelText } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    expect(queryByLabelText('Enable tilt gravity')).toBeNull();
    vi.unstubAllGlobals();
  });

  it('shows the tilt toggle once motion permission is granted', async () => {
    const requestPermission = vi.fn().mockResolvedValue('granted');
    vi.stubGlobal('DeviceMotionEvent', { requestPermission });
    const { getByLabelText } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    await act(async () => {
      fireEvent.click(getByLabelText('Enable motion controls'));
    });
    expect(getByLabelText('Enable tilt gravity')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('toggling tilt flips the label and persists the preference', () => {
    const { getByLabelText } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    fireEvent.click(getByLabelText('Enable tilt gravity'));
    expect(getByLabelText('Disable tilt gravity')).toBeInTheDocument();
    expect(localStorage.getItem('doodle-tilt')).toBe('true');
  });

  it('restores a stored tilt preference on mount', () => {
    localStorage.setItem('doodle-tilt', 'true');
    const { getByLabelText } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    expect(getByLabelText('Disable tilt gravity')).toBeInTheDocument();
  });

  it('tilt gravity pulls a shape further down than plain drift over the same frame', () => {
    // Shape.jsx renders transform="translate(x y) rotate(r)" — space
    // separated, no comma.
    const shapeY = (container) => Number(
      shapeGroups(container)[0].getAttribute('transform').match(/translate\(([-\d.]+) ([-\d.]+)\)/)[2],
    );

    // Same rng seed and same frame both times, so the only difference is
    // gravity. Asserting "y went up" on a single run would pass on the
    // shape's own downward drift alone.
    const runFrame = (tiltOn) => {
      localStorage.clear(); // don't hydrate the previous run's shape or toggle
      const { cbs, rectSpy, nowSpy } = driveOneFrame(); // must precede render
      const { container, getByLabelText, unmount } = render(
        <DoodleCanvas rng={seq([0.3])} sound={mockSound()} />,
      );
      const svg = stage(container);
      fireEvent.pointerDown(svg, { clientX: 500, clientY: 500, pointerId: 1 });
      fireEvent.pointerUp(svg, { clientX: 500, clientY: 500, pointerId: 1 });
      if (tiltOn) {
        fireEvent.click(getByLabelText('Enable tilt gravity'));
        act(() => {
          const event = new Event('deviceorientation');
          event.beta = 45;
          event.gamma = 0;
          window.dispatchEvent(event);
        });
      }
      act(() => { cbs[cbs.length - 1](500); });
      const y = shapeY(container);
      unmount();
      rectSpy.mockRestore();
      nowSpy.mockRestore();
      return y;
    };

    expect(runFrame(true)).toBeGreaterThan(runFrame(false));
  });

  it('a raised max throw speed does not also raise the ceiling for sustained tilt gravity', () => {
    // Regression: the fix that let a coasting flick-throw keep its raised
    // maxThrowSpeed (instead of being re-clamped to maxSpeed on the very
    // next frame) took the higher of maxSpeed and maxThrowSpeed
    // unconditionally. That let tilt's CONTINUOUS acceleration reach a
    // throw-sized ceiling too, defeating the reason maxSpeed exists at all
    // (see DEFAULT_MAX_SPEED in doodleShapes.js): a hard ceiling so
    // sustained force can't accelerate a shape past the point where it
    // tunnels through a wall in one frame. The ceiling must stay at the
    // lower maxSpeed value while tilt is on, regardless of maxThrowSpeed.
    vi.useFakeTimers();
    const { cbs, rectSpy, nowSpy } = driveOneFrame(); // must precede render
    // A very tall stage: the shape must never reach the bottom wall during
    // the frames below, so a bounce (which flips vy's sign but leaves the
    // clamped magnitude unchanged) can't be mistaken for the cap breaking.
    rectSpy.mockReturnValue({
      width: 1000, height: 1000000, left: 0, top: 0, right: 1000, bottom: 1000000, x: 0, y: 0, toJSON: () => ({}),
    });
    const { container, getByLabelText } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 500, clientY: 500, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 500, clientY: 500, pointerId: 1 });

    fireEvent.click(getByLabelText('Open tuning panel'));
    // Push every relevant field to the setting that would expose the bug:
    // a much higher throw ceiling, full tilt strength, and zero damping so
    // velocity keeps climbing every frame instead of settling below the cap.
    fireEvent.change(getByLabelText('Max throw speed (px/s)'), { target: { value: '3000' } });
    fireEvent.change(getByLabelText('Tilt strength (px/s²)'), { target: { value: '2000' } });
    fireEvent.change(getByLabelText('Tilt damping (1/s)'), { target: { value: '0' } });
    fireEvent.click(getByLabelText('Close tuning panel'));

    fireEvent.click(getByLabelText('Enable tilt gravity'));
    act(() => {
      const event = new Event('deviceorientation');
      event.beta = 45; // full tilt
      event.gamma = 0;
      window.dispatchEvent(event);
    });

    // 20 frames at the clamped 0.05s each, zero damping: unclamped velocity
    // would reach tiltStrength * dt * frames = 2000 * 0.05 * 20 = 2000px/s —
    // comfortably past the default maxSpeed (600) this test must prove still
    // holds, and past what the pre-fix bug would have let through too (which
    // maxed out around here, well under maxThrowSpeed's 3000 ceiling).
    for (let frame = 1; frame <= 20; frame += 1) {
      act(() => { cbs[cbs.length - 1](frame * 1000); });
    }
    act(() => { vi.advanceTimersByTime(1000); }); // flush the persistence interval

    const shape = JSON.parse(localStorage.getItem('doodle-objects')).find((o) => o.kind === 'shape');
    expect(Math.hypot(shape.vx, shape.vy)).toBeCloseTo(600);

    rectSpy.mockRestore();
    nowSpy.mockRestore();
    vi.useRealTimers();
  });

  it('a level device (tilt toggle on, beta=0 gamma=0) does not damp ordinary drift toward zero', () => {
    // Fix 2 regression: damping used to apply at full configured strength
    // whenever the tilt toggle was merely on, regardless of actual tilt
    // magnitude. On a flat desktop/tablet (beta=gamma=0), that silently
    // killed drift within a few seconds even though gravity itself
    // contributes nothing. Damping must now scale with how much the device
    // is actually tilted, so a level device drifts identically to tilt-off.
    const shapeY = (container) => Number(
      shapeGroups(container)[0].getAttribute('transform').match(/translate\(([-\d.]+) ([-\d.]+)\)/)[2],
    );

    const runFrame = (tiltOn) => {
      localStorage.clear(); // don't hydrate the previous run's shape or toggle
      const { cbs, rectSpy, nowSpy } = driveOneFrame(); // must precede render
      const { container, getByLabelText, unmount } = render(
        <DoodleCanvas rng={seq([0.3])} sound={mockSound()} />,
      );
      const svg = stage(container);
      fireEvent.pointerDown(svg, { clientX: 500, clientY: 500, pointerId: 1 });
      fireEvent.pointerUp(svg, { clientX: 500, clientY: 500, pointerId: 1 });
      if (tiltOn) {
        fireEvent.click(getByLabelText('Enable tilt gravity'));
        act(() => {
          const event = new Event('deviceorientation');
          event.beta = 0;
          event.gamma = 0;
          window.dispatchEvent(event);
        });
      }
      act(() => { cbs[cbs.length - 1](500); });
      const y = shapeY(container);
      unmount();
      rectSpy.mockRestore();
      nowSpy.mockRestore();
      return y;
    };

    expect(runFrame(true)).toBeCloseTo(runFrame(false));
  });
});
