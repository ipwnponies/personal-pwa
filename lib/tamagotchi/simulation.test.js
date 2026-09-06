import { describe, it, expect } from 'vitest';
import {
  createDefaultPet,
  feedPet,
  playWithPet,
  toggleSleep,
  cleanPoop,
  applyElapsed,
  NEED_FLOOR,
  NEED_MAX,
  MET_THRESHOLD,
  HUNGER_DECAY_PER_MIN,
  POOP_INTERVAL_MIN,
  STAGE_DURATIONS_MS,
  FEED_AMOUNT,
  PLAY_AMOUNT,
  PLAY_ENERGY_COST,
} from './simulation';

describe('createDefaultPet', () => {
  it('starts full and awake in the baby stage', () => {
    const pet = createDefaultPet(1000);
    expect(pet.stage).toBe('baby');
    expect(pet.hunger).toBe(NEED_MAX);
    expect(pet.happiness).toBe(NEED_MAX);
    expect(pet.energy).toBe(NEED_MAX);
    expect(pet.asleep).toBe(false);
    expect(pet.hasPoop).toBe(false);
  });
});

describe('feedPet', () => {
  it('raises hunger without exceeding NEED_MAX', () => {
    const pet = { ...createDefaultPet(0), hunger: NEED_MAX - 10 };
    expect(feedPet(pet).hunger).toBe(NEED_MAX);
    expect(feedPet({ ...pet, hunger: 0 }, FEED_AMOUNT).hunger).toBe(FEED_AMOUNT);
  });
});

describe('playWithPet', () => {
  it('raises happiness and spends energy', () => {
    const pet = { ...createDefaultPet(0), happiness: 0, energy: NEED_MAX };
    const played = playWithPet(pet);
    expect(played.happiness).toBe(PLAY_AMOUNT);
    expect(played.energy).toBe(NEED_MAX - PLAY_ENERGY_COST);
  });

  it('does not drop energy below NEED_FLOOR', () => {
    const pet = { ...createDefaultPet(0), energy: 2 };
    expect(playWithPet(pet).energy).toBe(NEED_FLOOR);
  });
});

describe('toggleSleep', () => {
  it('flips the asleep flag', () => {
    const pet = createDefaultPet(0);
    expect(toggleSleep(pet).asleep).toBe(true);
    expect(toggleSleep(toggleSleep(pet)).asleep).toBe(false);
  });
});

describe('cleanPoop', () => {
  it('clears hasPoop only when set', () => {
    const dirty = { ...createDefaultPet(0), hasPoop: true };
    expect(cleanPoop(dirty).hasPoop).toBe(false);
    const clean = createDefaultPet(0);
    expect(cleanPoop(clean)).toBe(clean);
  });
});

describe('applyElapsed', () => {
  it('decays hunger and happiness over elapsed minutes', () => {
    const pet = createDefaultPet(0);
    const next = applyElapsed(pet, 10 * 60e3, 10 * 60e3);
    expect(next.hunger).toBe(NEED_MAX - HUNGER_DECAY_PER_MIN * 10);
    expect(next.lastSeen).toBe(10 * 60e3);
  });

  it('clamps decay at NEED_FLOOR for very long elapsed spans', () => {
    const pet = createDefaultPet(0);
    const next = applyElapsed(pet, 100 * 24 * 3600e3, 100 * 24 * 3600e3);
    expect(next.hunger).toBe(NEED_FLOOR);
  });

  it('recovers energy instead of draining it while asleep', () => {
    const pet = { ...createDefaultPet(0), asleep: true, energy: 0 };
    const next = applyElapsed(pet, 5 * 60e3, 5 * 60e3);
    expect(next.energy).toBeGreaterThan(0);
  });

  it('spawns poop once enough unclean minutes accumulate', () => {
    const pet = createDefaultPet(0);
    const elapsed = (POOP_INTERVAL_MIN + 1) * 60e3;
    const next = applyElapsed(pet, elapsed, elapsed);
    expect(next.hasPoop).toBe(true);
  });

  it('does not spawn poop before the interval elapses', () => {
    const pet = createDefaultPet(0);
    const elapsed = (POOP_INTERVAL_MIN - 1) * 60e3;
    const next = applyElapsed(pet, elapsed, elapsed);
    expect(next.hasPoop).toBe(false);
  });

  it('grows to the next stage once needs stay met for the full stage duration', () => {
    const pet = createDefaultPet(0);
    const duration = STAGE_DURATIONS_MS.baby;
    const next = applyElapsed(pet, duration, duration);
    expect(next.stage).toBe('child');
  });

  it('resets the growth streak once a need drops back below threshold', () => {
    const pet = { ...createDefaultPet(0), hunger: MET_THRESHOLD - 1, wellMetSince: null };
    const next = applyElapsed(pet, 0, 0);
    expect(next.wellMetSince).toBeNull();
    expect(next.stage).toBe('baby');
  });
});
