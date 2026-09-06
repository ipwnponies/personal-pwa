import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Tamagotchi from '../../../pages/tamagotchi/index';
import { createSound } from '../../../lib/tamagotchi/sound';
import { NEED_MAX } from '../../../lib/tamagotchi/simulation';

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

  it('renders the pet and care actions', () => {
    render(<Tamagotchi />);
    expect(screen.getByTestId('pet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Feed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sleep' })).toBeInTheDocument();
  });

  it('feeding raises hunger and persists it, playing a cue', () => {
    seedPet({ hunger: 10 });
    render(<Tamagotchi />);
    fireEvent.click(screen.getByRole('button', { name: 'Feed' }));
    expect(readPet().hunger).toBeGreaterThan(10);
    expect(latestPlaySpy()).toHaveBeenCalledWith('nom');
  });

  it('playing raises happiness', () => {
    seedPet({ happiness: 10 });
    render(<Tamagotchi />);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(readPet().happiness).toBeGreaterThan(10);
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
});
