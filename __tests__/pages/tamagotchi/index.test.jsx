import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import Tamagotchi from '../../../pages/tamagotchi/index';
import { createSound } from '../../../lib/tamagotchi/sound';
import { NEED_MAX } from '../../../lib/tamagotchi/simulation';
import { MIN_PLAY_AMOUNT } from '../../../lib/tamagotchi/minigame';

vi.mock('next/router', () => ({
  useRouter: () => ({ basePath: '' }),
}));

// Spyable in place of the real WebAudio-backed implementation, so tests can
// assert a cue actually played rather than only checking resulting state.
vi.mock('../../../lib/tamagotchi/sound', () => ({
  createSound: vi.fn(() => ({ play: vi.fn(), setEnabled: vi.fn() })),
}));

const latestPlaySpy = () => {
  const { results } = vi.mocked(createSound).mock;
  return results[results.length - 1].value.play;
};

const STORAGE_KEY = 'tamagotchi-pet';

const basePet = (overrides = {}) => ({
  version: 1,
  lastSeen: Date.now(),
  petType: 'blob',
  bornAt: Date.now(),
  stage: 'baby',
  hunger: NEED_MAX,
  happiness: NEED_MAX,
  energy: NEED_MAX,
  asleep: false,
  wellMetSince: null,
  poopMinutes: 0,
  hasPoop: false,
  soundOn: false,
  feedCount: 0,
  playCount: 0,
  sleepMinutes: 0,
  adultForm: null,
  sick: false,
  poopUncleanMinutes: 0,
  ...overrides,
});

const seedPet = (overrides) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(basePet(overrides)));
};

const readPet = () => JSON.parse(localStorage.getItem(STORAGE_KEY));

describe('Tamagotchi page', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the pet and care actions', () => {
    seedPet();
    render(<Tamagotchi />);
    expect(screen.getByTestId('pet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Feed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sleep' })).toBeInTheDocument();
  });

  it('shows the species chooser when there is no saved pet', () => {
    render(<Tamagotchi />);
    expect(screen.getByRole('button', { name: 'Blob' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sprout' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ember' })).toBeInTheDocument();
    expect(screen.queryByTestId('pet')).not.toBeInTheDocument();
  });

  it('hatches the chosen species and persists it', () => {
    render(<Tamagotchi />);
    fireEvent.click(screen.getByRole('button', { name: 'Ember' }));
    expect(readPet().petType).toBe('ember');
    expect(readPet().stage).toBe('baby');
    expect(screen.getByTestId('pet')).toBeInTheDocument();
    expect(screen.getByTestId('pet')).toHaveTextContent('🕯️');
  });

  it('plays the evolve cue as the hatch sound', () => {
    render(<Tamagotchi />);
    fireEvent.click(screen.getByRole('button', { name: 'Sprout' }));
    expect(latestPlaySpy()).toHaveBeenCalledWith('evolve');
  });

  it('skips the chooser when a saved pet exists', () => {
    seedPet({ petType: 'sprout' });
    render(<Tamagotchi />);
    expect(screen.queryByRole('button', { name: 'Ember' })).not.toBeInTheDocument();
    expect(screen.getByTestId('pet')).toHaveTextContent('🌰');
  });

  it('feeding raises hunger and persists it, playing a cue', () => {
    seedPet({ hunger: 10 });
    render(<Tamagotchi />);
    fireEvent.click(screen.getByRole('button', { name: 'Feed' }));
    expect(readPet().hunger).toBeGreaterThan(10);
    expect(latestPlaySpy()).toHaveBeenCalledWith('nom');
  });

  it('tapping the pet raises happiness', () => {
    seedPet({ happiness: 10 });
    render(<Tamagotchi />);
    fireEvent.click(screen.getByTestId('pet'));
    expect(readPet().happiness).toBeGreaterThan(10);
  });

  it('opens the minigame overlay from the palette Play button', () => {
    seedPet();
    render(<Tamagotchi />);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(screen.getByTestId('minigame-overlay')).toBeInTheDocument();
  });

  it('completing a minigame session with every round missed still raises happiness by the minimum amount', () => {
    vi.useFakeTimers();
    seedPet({ happiness: 0 });
    render(<Tamagotchi />);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(readPet().happiness).toBe(MIN_PLAY_AMOUNT);
    expect(screen.queryByTestId('minigame-overlay')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('a well-timed tap scores above the minimum reward', () => {
    vi.useFakeTimers();
    seedPet({ happiness: 0 });
    render(<Tamagotchi />);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    act(() => {
      vi.advanceTimersByTime(700);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tap' }));
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(readPet().happiness).toBeGreaterThan(MIN_PLAY_AMOUNT);
    vi.useRealTimers();
  });

  it('canceling the minigame overlay does not change happiness', () => {
    vi.useFakeTimers();
    seedPet({ happiness: 50 });
    render(<Tamagotchi />);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(readPet().happiness).toBe(50);
    expect(screen.queryByTestId('minigame-overlay')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('toggling sleep flips the button label and persisted state', () => {
    seedPet({ asleep: false });
    render(<Tamagotchi />);
    const sleepButton = screen.getByRole('button', { name: 'Sleep' });
    fireEvent.click(sleepButton);
    expect(readPet().asleep).toBe(true);
    expect(screen.getByRole('button', { name: 'Wake' })).toBeInTheDocument();
  });

  it('shows a poop pile that can be cleaned', () => {
    seedPet({ hasPoop: true });
    render(<Tamagotchi />);
    const poop = screen.getByTestId('poop');
    fireEvent.click(poop);
    expect(readPet().hasPoop).toBe(false);
    expect(screen.queryByTestId('poop')).not.toBeInTheDocument();
  });

  it('toggling sound updates aria-pressed and mutes the sound engine', () => {
    seedPet({ soundOn: false });
    render(<Tamagotchi />);
    const muteToggle = screen.getByRole('button', { name: 'Sound off' });
    fireEvent.click(muteToggle);
    expect(screen.getByRole('button', { name: 'Sound on' })).toBeInTheDocument();
    expect(readPet().soundOn).toBe(true);
  });

  it('giving medicine clears sick and hides the medicine button, playing a cue', () => {
    seedPet({ sick: true });
    render(<Tamagotchi />);
    const medicineButton = screen.getByRole('button', { name: 'Medicine' });
    fireEvent.click(medicineButton);
    expect(readPet().sick).toBe(false);
    expect(screen.queryByRole('button', { name: 'Medicine' })).not.toBeInTheDocument();
    expect(latestPlaySpy()).toHaveBeenCalledWith('medicine');
  });

  it('hides the medicine button while poop is still uncleaned', () => {
    seedPet({ sick: true, hasPoop: true });
    render(<Tamagotchi />);
    expect(screen.queryByRole('button', { name: 'Medicine' })).toBeNull();
  });

  it('requires two taps to start a new pet, then returns to the chooser', () => {
    seedPet({ petType: 'sprout', hunger: 42 });
    render(<Tamagotchi />);
    fireEvent.click(screen.getByRole('button', { name: 'New pet' }));
    expect(readPet().hunger).toBe(42);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm new pet' }));
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(screen.getByRole('button', { name: 'Blob' })).toBeInTheDocument();
    expect(screen.queryByTestId('pet')).not.toBeInTheDocument();
  });

  it('cancels a pending restart when another care action is taken', () => {
    seedPet({ hunger: 10 });
    render(<Tamagotchi />);
    fireEvent.click(screen.getByRole('button', { name: 'New pet' }));
    fireEvent.click(screen.getByRole('button', { name: 'Feed' }));
    expect(screen.queryByRole('button', { name: 'Confirm new pet' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New pet' })).toBeInTheDocument();
    expect(readPet().hunger).toBeGreaterThan(10);
  });

  it('cancels a pending restart from the arming button position', () => {
    seedPet();
    render(<Tamagotchi />);
    fireEvent.click(screen.getByRole('button', { name: 'New pet' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel new pet' }));
    expect(screen.queryByRole('button', { name: 'Confirm new pet' })).not.toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it('drops a pending restart left unconfirmed', () => {
    vi.useFakeTimers();
    seedPet();
    render(<Tamagotchi />);
    fireEvent.click(screen.getByRole('button', { name: 'New pet' }));
    act(() => {
      vi.advanceTimersByTime(5000); // RESTART_CONFIRM_MS
    });
    expect(screen.queryByRole('button', { name: 'Confirm new pet' })).not.toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    vi.useRealTimers();
  });

  it('renders both restart-confirm buttons alongside Medicine for a sick pet', () => {
    seedPet({ sick: true, hasPoop: false });
    render(<Tamagotchi />);
    expect(screen.getByRole('button', { name: 'Medicine' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New pet' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New pet' }));
    expect(screen.getByRole('button', { name: 'Cancel new pet' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm new pet' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Medicine' })).toBeInTheDocument();
  });

  it('disarms a pending restart when Medicine disappears mid-arm, so Confirm cannot land on the arming button spot', () => {
    // Regression for: the 2s background tick recomputes hasPoop/sick
    // independently of confirmRestart. If a poop pile spawns while restart
    // is armed and the pet is sick-but-clean, Medicine (rendered just before
    // the restart control) disappears and every button after it shifts back
    // one slot — sliding Confirm onto the exact spot the arming "New pet"
    // tap sat on. poopMinutes is seeded just under POOP_INTERVAL_MIN so a
    // single 2s tick (well inside the 5s RESTART_CONFIRM_MS window) crosses
    // the threshold and spawns the poop, mirroring a real in-game tick
    // rather than only asserting on the effect's existence.
    vi.useFakeTimers();
    seedPet({ sick: true, hasPoop: false, poopMinutes: 19.98 });
    render(<Tamagotchi />);
    expect(screen.getByRole('button', { name: 'Medicine' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'New pet' }));
    expect(screen.getByRole('button', { name: 'Confirm new pet' })).toBeInTheDocument();

    // One background tick (2s), well short of the 5s auto-disarm timeout,
    // is enough to cross the poop-spawn threshold from the seeded state.
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // The poop pile spawned (proves the tick actually changed Medicine's
    // visibility, not just that some unrelated timer fired)...
    expect(readPet().hasPoop).toBe(true);
    expect(screen.queryByRole('button', { name: 'Medicine' })).not.toBeInTheDocument();
    // ...and the restart control was disarmed back to its safe, unarmed
    // shape rather than left armed with Confirm shifted into Cancel's old
    // (and the original arming button's) slot.
    expect(screen.queryByRole('button', { name: 'Confirm new pet' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel new pet' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New pet' })).toBeInTheDocument();
    // Not destroyed: this was a disarm, not an accidental confirm.
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    vi.useRealTimers();
  });

  it('gives a new pet a fresh sound engine instead of the old pet mute', () => {
    seedPet({ soundOn: false });
    render(<Tamagotchi />);
    fireEvent.click(screen.getByRole('button', { name: 'New pet' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm new pet' }));
    fireEvent.click(screen.getByRole('button', { name: 'Blob' }));
    expect(screen.getByRole('button', { name: 'Sound on' })).toBeInTheDocument();
    // createSound is re-invoked for the hatched pet, enabled per its soundOn.
    expect(vi.mocked(createSound).mock.calls.at(-1)[0]).toBe(true);
  });
});
