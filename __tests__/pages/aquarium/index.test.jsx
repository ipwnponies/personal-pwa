import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Aquarium from '../../../pages/aquarium/index';
import { createSound } from '../../../lib/aquarium/sound';

vi.mock('next/router', () => ({
  useRouter: () => ({ basePath: '' }),
}));

// Spyable in place of the real WebAudio-backed implementation, so tests can
// assert a cue actually played rather than only checking resulting state.
vi.mock('../../../lib/aquarium/sound', () => ({
  createSound: vi.fn(() => ({ play: vi.fn(), setEnabled: vi.fn() })),
}));

// createSound is called once per render (mount effect); grabs the play spy
// from the most recent call, since mock.results accumulates across tests.
const latestPlaySpy = () => {
  const { results } = vi.mocked(createSound).mock;
  return results[results.length - 1].value.play;
};

const STORAGE_KEY = 'aquarium-tank';

// Fixed 400x300 tank + a 400x80 palette bar directly below it, so tests can
// convert clientX/clientY into predictable tank-fraction coordinates and
// distinguish "released over the tank" from "released over the palette".
// PALETTE_RECT models just the decoration section of the palette (per KTD4/
// AE2), narrower than the full bar so it starts after where the food/toy
// tool buttons sit — a release over those tools must not fall inside it.
const TANK_RECT = { left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300 };
const PALETTE_RECT = { left: 160, top: 300, right: 400, bottom: 380, width: 240, height: 80 };

const baseTank = (overrides = {}) => ({
  version: 2,
  lastSeen: Date.now(),
  selectedTool: 'food',
  soundOn: false,
  tankCleanliness: 100,
  eggProgress: 0,
  egg: null,
  foodDrops: [],
  toyDrops: [],
  dirtSpots: [],
  creatures: [],
  decorations: [],
  decorationProgress: 0,
  unlockedDecorationTypes: ['seaweed', 'coral'],
  ...overrides,
});

const seedTank = (overrides) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(baseTank(overrides)));
};

const readTank = () => JSON.parse(localStorage.getItem(STORAGE_KEY));

describe('Aquarium page', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the two-tool palette', () => {
    render(<Aquarium />);
    expect(screen.getByRole('button', { name: /food/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /toy/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sponge/i })).not.toBeInTheDocument();
  });

  it('renders starter creatures', () => {
    render(<Aquarium />);
    expect(screen.getAllByTestId('creature').length).toBeGreaterThan(0);
  });

  it('selecting a tool marks it pressed', () => {
    render(<Aquarium />);
    const toy = screen.getByRole('button', { name: /toy/i });
    fireEvent.click(toy);
    expect(toy).toHaveAttribute('aria-pressed', 'true');
  });

  it('mute toggle flips its label', () => {
    render(<Aquarium />);
    const mute = screen.getByRole('button', { name: /sound/i });
    const before = mute.getAttribute('aria-pressed');
    fireEvent.click(mute);
    expect(mute.getAttribute('aria-pressed')).not.toBe(before);
  });

  it('tapping the tank with food selected drops food', () => {
    render(<Aquarium />);
    const tank = screen.getByRole('presentation');
    fireEvent.click(tank, { clientX: 50, clientY: 50 });
    expect(screen.getAllByTestId('foodDrop').length).toBeGreaterThan(0);
  });

  it('tapping the tank with toy selected drops a toy', () => {
    render(<Aquarium />);
    fireEvent.click(screen.getByRole('button', { name: /toy/i }));
    const tank = screen.getByRole('presentation');
    fireEvent.click(tank, { clientX: 50, clientY: 50 });
    expect(screen.getAllByTestId('toyDrop').length).toBeGreaterThan(0);
  });

  it('tapping a creature also drops at that point (no per-creature action left)', () => {
    render(<Aquarium />);
    const first = screen.getAllByTestId('creature')[0];
    fireEvent.click(first, { clientX: 20, clientY: 20 });
    expect(screen.getAllByTestId('foodDrop').length).toBeGreaterThan(0);
  });

  it('shows a want bubble on a creature with a low need', () => {
    localStorage.setItem(
      'aquarium-tank',
      JSON.stringify({
        version: 2,
        lastSeen: Date.now(),
        selectedTool: 'food',
        soundOn: true,
        tankCleanliness: 100,
        eggProgress: 0,
        egg: null,
        foodDrops: [],
        toyDrops: [],
        dirtSpots: [],
        creatures: [{
          id: 'c1', species: 'clownfish', bornAt: 0, stage: 'baby',
          hunger: 20, happiness: 100, wellMetSince: null, seekTargetId: null, x: 0.5, y: 0.5,
        }],
      }),
    );
    render(<Aquarium />);
    const creature = screen.getByTestId('creature');
    expect(creature.textContent).toContain('🍤');
  });
});

describe('Aquarium page decoration pointer dispatch', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function mockRect() {
      const isDecorationPalette = this.getAttribute('data-testid') === 'decorationPalette';
      return isDecorationPalette ? PALETTE_RECT : TANK_RECT;
    });
  });

  it('placing a decoration: pointer-down with a decoration type selected adds it (no drag)', () => {
    seedTank({ selectedTool: 'seaweed' });
    render(<Aquarium />);
    const tank = screen.getByRole('presentation');
    fireEvent.pointerDown(tank, { clientX: 200, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(tank, { clientX: 200, clientY: 150, pointerId: 1 });
    fireEvent.click(tank, { clientX: 200, clientY: 150 });
    const tank2 = readTank();
    expect(tank2.decorations).toHaveLength(1);
    expect(tank2.decorations[0]).toMatchObject({ type: 'seaweed', x: 0.5, y: 0.5 });
  });

  it('grabbing and dragging a placed decoration repositions it without creating a new one', () => {
    seedTank({
      selectedTool: 'seaweed',
      decorations: [{ id: 'd1', type: 'seaweed', x: 0.5, y: 0.5 }],
    });
    render(<Aquarium />);
    const tank = screen.getByRole('presentation');
    fireEvent.pointerDown(tank, { clientX: 200, clientY: 150, pointerId: 1 });
    fireEvent.pointerMove(tank, { clientX: 320, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(tank, { clientX: 320, clientY: 150, pointerId: 1 });
    const result = readTank();
    expect(result.decorations).toHaveLength(1);
    expect(result.decorations[0].id).toBe('d1');
    expect(result.decorations[0].x).toBeCloseTo(0.8, 5);
  });

  it('the nearer of two overlapping decorations grabs', () => {
    // Both decorations sit within GRAB_RADIUS (0.06) of the pointer-down
    // point (0.5, 0.5) — 'near' at distance 0.02, 'far' at distance 0.05 —
    // so this genuinely exercises the nearest-wins tie-break, not just the
    // radius cutoff.
    seedTank({
      selectedTool: 'seaweed',
      decorations: [
        { id: 'near', type: 'seaweed', x: 0.52, y: 0.5 },
        { id: 'far', type: 'coral', x: 0.55, y: 0.5 },
      ],
    });
    render(<Aquarium />);
    const tank = screen.getByRole('presentation');
    fireEvent.pointerDown(tank, { clientX: 200, clientY: 150, pointerId: 1 });
    fireEvent.pointerMove(tank, { clientX: 280, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(tank, { clientX: 280, clientY: 150, pointerId: 1 });
    const result = readTank();
    const near = result.decorations.find((d) => d.id === 'near');
    const far = result.decorations.find((d) => d.id === 'far');
    expect(near.x).toBeCloseTo(0.7, 5);
    expect(far.x).toBe(0.55);
  });

  it('dragging a grabbed decoration onto the decoration palette section and releasing removes it', () => {
    seedTank({
      selectedTool: 'seaweed',
      soundOn: true,
      decorations: [{ id: 'd1', type: 'seaweed', x: 0.5, y: 0.5 }],
    });
    render(<Aquarium />);
    const play = latestPlaySpy();
    const tank = screen.getByRole('presentation');
    // PALETTE_RECT (the decoration-section mock) starts at x=160, so land the
    // release well inside it.
    fireEvent.pointerDown(tank, { clientX: 200, clientY: 150, pointerId: 1 });
    fireEvent.pointerMove(tank, { clientX: 200, clientY: 340, pointerId: 1 });
    fireEvent.pointerUp(tank, { clientX: 200, clientY: 340, pointerId: 1 });
    const result = readTank();
    expect(result.decorations).toHaveLength(0);
    expect(play).toHaveBeenCalledWith('sparkle');
  });

  it('dragging a grabbed decoration and releasing over the food/toy tools does not remove it', () => {
    // The delete zone is scoped to just the decoration section (KTD4/AE2),
    // not the whole palette bar — a release over the food/toy tools (outside
    // PALETTE_RECT's x=160..400 in this mock) must not delete.
    seedTank({
      selectedTool: 'seaweed',
      decorations: [{ id: 'd1', type: 'seaweed', x: 0.5, y: 0.5 }],
    });
    render(<Aquarium />);
    const tank = screen.getByRole('presentation');
    fireEvent.pointerDown(tank, { clientX: 200, clientY: 150, pointerId: 1 });
    fireEvent.pointerMove(tank, { clientX: 50, clientY: 340, pointerId: 1 });
    fireEvent.pointerUp(tank, { clientX: 50, clientY: 340, pointerId: 1 });
    const result = readTank();
    expect(result.decorations).toHaveLength(1);
  });

  it('a tap (no movement) on a placed decoration does not move or remove it', () => {
    seedTank({
      selectedTool: 'seaweed',
      decorations: [{ id: 'd1', type: 'seaweed', x: 0.5, y: 0.5 }],
    });
    render(<Aquarium />);
    const tank = screen.getByRole('presentation');
    fireEvent.pointerDown(tank, { clientX: 200, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(tank, { clientX: 200, clientY: 150, pointerId: 1 });
    const result = readTank();
    expect(result.decorations).toEqual([{ id: 'd1', type: 'seaweed', x: 0.5, y: 0.5 }]);
  });

  it('a grab-and-move sequence does not also place a duplicate via the trailing click', () => {
    seedTank({
      selectedTool: 'seaweed',
      decorations: [{ id: 'd1', type: 'seaweed', x: 0.5, y: 0.5 }],
    });
    render(<Aquarium />);
    const tank = screen.getByRole('presentation');
    fireEvent.pointerDown(tank, { clientX: 200, clientY: 150, pointerId: 1 });
    fireEvent.pointerMove(tank, { clientX: 250, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(tank, { clientX: 250, clientY: 150, pointerId: 1 });
    // Real browsers fire a trailing native click after this sequence; jsdom
    // does not synthesize it, so the test fires it explicitly.
    fireEvent.click(tank, { clientX: 250, clientY: 150 });
    const result = readTank();
    expect(result.decorations).toHaveLength(1);
    expect(result.foodDrops).toHaveLength(0);
  });

  it('dragging a decoration past the tank edge clamps its position', () => {
    seedTank({
      selectedTool: 'seaweed',
      decorations: [{ id: 'd1', type: 'seaweed', x: 0.5, y: 0.5 }],
    });
    render(<Aquarium />);
    const tank = screen.getByRole('presentation');
    fireEvent.pointerDown(tank, { clientX: 200, clientY: 150, pointerId: 1 });
    fireEvent.pointerMove(tank, { clientX: 5000, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(tank, { clientX: 5000, clientY: 150, pointerId: 1 });
    const result = readTank();
    expect(result.decorations[0].x).toBe(1);
  });

  it('placing at a type already at its per-type cap does not add one', () => {
    const capped = Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, type: 'seaweed', x: 0.1, y: 0.1 }));
    seedTank({ selectedTool: 'seaweed', decorations: capped });
    render(<Aquarium />);
    const tank = screen.getByRole('presentation');
    fireEvent.pointerDown(tank, { clientX: 200, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(tank, { clientX: 200, clientY: 150, pointerId: 1 });
    fireEvent.click(tank, { clientX: 200, clientY: 150 });
    const result = readTank();
    expect(result.decorations).toHaveLength(6);
  });

  it('a pointercancel during a decoration grab does not suppress the next unrelated click', () => {
    // pointercancel fires INSTEAD OF pointerup (e.g. a scroll/multi-touch
    // takeover aborts the gesture) and no trailing click follows it per
    // spec. handleTankPointerUp — wired to both pointerup and pointercancel
    // — still sets suppressClickRef when a decoration grab is in progress,
    // so without a reset that flag would otherwise survive into the next,
    // wholly unrelated interaction and silently swallow its click.
    seedTank({
      selectedTool: 'food',
      decorations: [{ id: 'd1', type: 'seaweed', x: 0.5, y: 0.5 }],
    });
    render(<Aquarium />);
    const tank = screen.getByRole('presentation');
    // Grab the decoration, then have the gesture cancelled instead of released.
    fireEvent.pointerDown(tank, { clientX: 200, clientY: 150, pointerId: 1 });
    fireEvent.pointerCancel(tank, { clientX: 200, clientY: 150, pointerId: 1 });
    // A new, unrelated tap elsewhere on the tank — nowhere near the decoration.
    fireEvent.pointerDown(tank, { clientX: 100, clientY: 50, pointerId: 2 });
    fireEvent.pointerUp(tank, { clientX: 100, clientY: 50, pointerId: 2 });
    fireEvent.click(tank, { clientX: 100, clientY: 50 });
    const result = readTank();
    expect(result.foodDrops).toHaveLength(1);
  });

  it('a pointercancel during a drag-to-remove does not delete the decoration, even with stale coordinates over the delete zone', () => {
    // pointercancel carries stale/last-known coordinates (the gesture was
    // aborted, e.g. an OS scroll takeover) — those coordinates are often
    // exactly over the delete zone mid drag-to-remove, but a cancel must
    // never be treated as an intentional release (KTD3: no surprise loss).
    seedTank({
      selectedTool: 'seaweed',
      decorations: [{ id: 'd1', type: 'seaweed', x: 0.5, y: 0.5 }],
    });
    render(<Aquarium />);
    const tank = screen.getByRole('presentation');
    fireEvent.pointerDown(tank, { clientX: 200, clientY: 150, pointerId: 1 });
    // Drag over the decoration section (delete zone) as if about to drop it there.
    fireEvent.pointerMove(tank, { clientX: 200, clientY: 340, pointerId: 1 });
    // The gesture is aborted here instead of released.
    fireEvent.pointerCancel(tank, { clientX: 200, clientY: 340, pointerId: 1 });
    const result = readTank();
    expect(result.decorations).toHaveLength(1);
    expect(result.decorations[0].id).toBe('d1');
  });

  it('a refused cue fires at most once per continuous paint-drag gesture, even across many throttled samples', () => {
    vi.useFakeTimers();
    try {
      const capped = Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, type: 'seaweed', x: 0.1, y: 0.1 }));
      seedTank({ selectedTool: 'seaweed', soundOn: true, decorations: capped });
      render(<Aquarium />);
      const play = latestPlaySpy();
      const tank = screen.getByRole('presentation');
      // Start away from the existing decorations so this is a paint-drag, not
      // a grab, and give the first sample enough elapsed time to pass the
      // DRAG_SAMPLE_MS throttle.
      vi.setSystemTime(1000);
      fireEvent.pointerDown(tank, { clientX: 50, clientY: 250, pointerId: 1 });
      fireEvent.pointerMove(tank, { clientX: 70, clientY: 250, pointerId: 1 });
      vi.setSystemTime(1200);
      fireEvent.pointerMove(tank, { clientX: 90, clientY: 250, pointerId: 1 });
      vi.setSystemTime(1400);
      fireEvent.pointerMove(tank, { clientX: 110, clientY: 250, pointerId: 1 });
      fireEvent.pointerUp(tank, { clientX: 110, clientY: 250, pointerId: 1 });
      const refusedCalls = play.mock.calls.filter((call) => call[0] === 'refused');
      expect(refusedCalls).toHaveLength(1);
      expect(readTank().decorations).toHaveLength(6);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Aquarium page decoration rendering and feedback', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function mockRect() {
      const isDecorationPalette = this.getAttribute('data-testid') === 'decorationPalette';
      return isDecorationPalette ? PALETTE_RECT : TANK_RECT;
    });
  });

  it('renders a placed decoration at its x/y position', () => {
    seedTank({ decorations: [{ id: 'd1', type: 'coral', x: 0.3, y: 0.4 }] });
    render(<Aquarium />);
    const deco = screen.getByTestId('decoration');
    expect(deco.style.left).toBe('30%');
    expect(deco.style.top).toBe('40%');
    expect(deco.textContent).toContain('🪸');
  });

  it('hides the decoration palette section when nothing is unlocked', () => {
    seedTank({ unlockedDecorationTypes: [] });
    render(<Aquarium />);
    expect(screen.queryByRole('button', { name: /seaweed/i })).not.toBeInTheDocument();
  });

  it('shows unlocked decoration types in the palette, after the toy tool', () => {
    seedTank({ unlockedDecorationTypes: ['seaweed', 'coral'] });
    render(<Aquarium />);
    const seaweed = screen.getByRole('button', { name: /seaweed/i });
    const coral = screen.getByRole('button', { name: /coral/i });
    expect(seaweed).toBeInTheDocument();
    expect(coral).toBeInTheDocument();
  });

  it('selecting an unlocked decoration type from the palette marks it pressed', () => {
    seedTank({ unlockedDecorationTypes: ['seaweed'] });
    render(<Aquarium />);
    const seaweed = screen.getByRole('button', { name: /seaweed/i });
    fireEvent.click(seaweed);
    expect(seaweed).toHaveAttribute('aria-pressed', 'true');
  });

  it('crossing the decoration-unlock threshold reveals the newly unlocked palette icon', () => {
    seedTank({
      unlockedDecorationTypes: [],
      soundOn: true,
      decorationProgress: 90,
      tankCleanliness: 50,
      dirtSpots: [{ id: 'spot1', x: 0.5, y: 0.5, createdAt: 0 }],
    });
    render(<Aquarium />);
    const play = latestPlaySpy();
    expect(screen.queryByRole('button', { name: /seaweed/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('dirtSpot'));
    expect(screen.getByRole('button', { name: /seaweed/i })).toBeInTheDocument();
    expect(play).toHaveBeenCalledWith('unlock');
  });

  it('a cap-refused placement attempt does not add a decoration', () => {
    const capped = Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, type: 'seaweed', x: 0.1, y: 0.1 }));
    seedTank({
      selectedTool: 'seaweed',
      soundOn: true,
      unlockedDecorationTypes: ['seaweed'],
      decorations: capped,
    });
    render(<Aquarium />);
    const play = latestPlaySpy();
    const tank = screen.getByRole('presentation');
    fireEvent.click(tank, { clientX: 200, clientY: 150 });
    expect(readTank().decorations).toHaveLength(6);
    expect(play).toHaveBeenCalledWith('refused');
  });
});
