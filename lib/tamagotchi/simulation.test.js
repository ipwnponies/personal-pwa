import { describe, it, expect } from 'vitest';
import {
  createDefaultPet,
  feedPet,
  playWithPet,
  toggleSleep,
  cleanPoop,
  giveMedicine,
  applyElapsed,
  determineAdultForm,
  NEED_FLOOR,
  NEED_MAX,
  MET_THRESHOLD,
  HUNGER_DECAY_PER_MIN,
  POOP_INTERVAL_MIN,
  STAGE_DURATIONS_MS,
  FEED_AMOUNT,
  PLAY_AMOUNT,
  PLAY_ENERGY_COST,
  SICKNESS_THRESHOLD_MIN,
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

  it('increments feedCount', () => {
    const pet = createDefaultPet(0);
    expect(feedPet(pet).feedCount).toBe(1);
    expect(feedPet(feedPet(pet)).feedCount).toBe(2);
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

  it('increments playCount', () => {
    const pet = createDefaultPet(0);
    expect(playWithPet(pet).playCount).toBe(1);
    expect(playWithPet(playWithPet(pet)).playCount).toBe(2);
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

  it('resets poopUncleanMinutes when cleaning', () => {
    const dirty = { ...createDefaultPet(0), hasPoop: true, poopUncleanMinutes: 20 };
    expect(cleanPoop(dirty).poopUncleanMinutes).toBe(0);
  });

  it('leaves poopUncleanMinutes untouched when there is nothing to clean', () => {
    const clean = { ...createDefaultPet(0), poopUncleanMinutes: 5 };
    expect(cleanPoop(clean)).toBe(clean);
  });

  it('does not cure sickness — medicine is the only cure', () => {
    const dirty = { ...createDefaultPet(0), hasPoop: true, sick: true };
    expect(cleanPoop(dirty).sick).toBe(true);
  });
});

describe('giveMedicine', () => {
  it('clears sick without resetting poopUncleanMinutes', () => {
    const pet = { ...createDefaultPet(0), sick: true, poopUncleanMinutes: 20 };
    const treated = giveMedicine(pet);
    expect(treated.sick).toBe(false);
    expect(treated.poopUncleanMinutes).toBe(20);
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

  it('accumulates sleepMinutes only while asleep', () => {
    const awake = createDefaultPet(0);
    const awakeNext = applyElapsed(awake, 5 * 60e3, 5 * 60e3);
    expect(awakeNext.sleepMinutes).toBe(0);

    const asleep = { ...createDefaultPet(0), asleep: true };
    const asleepNext = applyElapsed(asleep, 5 * 60e3, 5 * 60e3);
    expect(asleepNext.sleepMinutes).toBe(5);
  });
});

describe('applyElapsed sickness', () => {
  it('accumulates poopUncleanMinutes for the whole gap when poop was already sitting there', () => {
    const pet = { ...createDefaultPet(0), hasPoop: true, poopUncleanMinutes: 0 };
    const next = applyElapsed(pet, 10 * 60e3, 10 * 60e3);
    expect(next.poopUncleanMinutes).toBe(10);
  });

  it('only counts minutes since a poop that spawns partway through the gap', () => {
    const pet = { ...createDefaultPet(0), hasPoop: false, poopMinutes: 0 };
    const elapsed = (POOP_INTERVAL_MIN + 5) * 60e3;
    const next = applyElapsed(pet, elapsed, elapsed);
    expect(next.hasPoop).toBe(true);
    expect(next.poopUncleanMinutes).toBe(5);
  });

  it('becomes sick once poopUncleanMinutes exceeds the threshold', () => {
    const pet = { ...createDefaultPet(0), hasPoop: true, poopUncleanMinutes: 0 };
    const elapsed = (SICKNESS_THRESHOLD_MIN + 1) * 60e3;
    expect(applyElapsed(pet, elapsed, elapsed).sick).toBe(true);
  });

  it('does not become sick exactly at the threshold', () => {
    const pet = { ...createDefaultPet(0), hasPoop: true, poopUncleanMinutes: 0 };
    const elapsed = SICKNESS_THRESHOLD_MIN * 60e3;
    expect(applyElapsed(pet, elapsed, elapsed).sick).toBe(false);
  });

  it('stays sick once sick, even if this tick alone would not cross the threshold', () => {
    const pet = { ...createDefaultPet(0), sick: true, hasPoop: false, poopUncleanMinutes: 0 };
    expect(applyElapsed(pet, 60e3, 60e3).sick).toBe(true);
  });

  it('doubles happiness decay while sick', () => {
    const elapsed = 5 * 60e3;
    const healthyNext = applyElapsed(createDefaultPet(0), elapsed, elapsed);
    const sickNext = applyElapsed({ ...createDefaultPet(0), sick: true }, elapsed, elapsed);
    const healthyLoss = NEED_MAX - healthyNext.happiness;
    const sickLoss = NEED_MAX - sickNext.happiness;
    expect(sickLoss).toBe(healthyLoss * 2);
  });

  it('clamps both sick and healthy happiness decay at NEED_FLOOR over a long gap', () => {
    const elapsed = 60 * 60e3;
    const healthyNext = applyElapsed(createDefaultPet(0), elapsed, elapsed);
    const sickNext = applyElapsed({ ...createDefaultPet(0), sick: true }, elapsed, elapsed);
    expect(healthyNext.happiness).toBe(NEED_FLOOR);
    expect(sickNext.happiness).toBe(NEED_FLOOR);
  });

  it('freezes growth while sick, even once care needs and stage duration are met', () => {
    const pet = { ...createDefaultPet(0), wellMetSince: 0, sick: true };
    const duration = STAGE_DURATIONS_MS.baby;
    const next = applyElapsed(pet, duration, duration);
    expect(next.stage).toBe('baby');
    // The anchor rides forward with the sick interval rather than going
    // stale, so the frozen time banks nothing toward the stage clock.
    expect(next.wellMetSince).toBe(duration);
  });

  it('banks no stage progress for time spent sick', () => {
    const duration = STAGE_DURATIONS_MS.baby;
    const sickMs = duration - 60e3;
    const afterSickTick = applyElapsed(
      { ...createDefaultPet(0), wellMetSince: 0, sick: true },
      sickMs,
      sickMs,
    );
    const recovered = { ...afterSickTick, sick: false };

    // A short healthy tick right after recovery must not instantly grow,
    // even though wall-clock time since the original anchor now exceeds the
    // stage duration.
    expect(applyElapsed(recovered, 60e3, sickMs + 60e3).stage).toBe('baby');

    // A full stage duration of healthy time still grows it.
    expect(applyElapsed(recovered, duration, sickMs + duration).stage).toBe('child');
  });

  it('still grows normally when not sick', () => {
    const pet = { ...createDefaultPet(0), wellMetSince: 0 };
    const duration = STAGE_DURATIONS_MS.baby;
    expect(applyElapsed(pet, duration, duration).stage).toBe('child');
  });
});

describe('determineAdultForm', () => {
  const pet = (feedCount, playCount, sleepMinutes) => ({ feedCount, playCount, sleepMinutes });

  it('is efficient when total care actions are below the threshold', () => {
    expect(determineAdultForm(pet(2, 1, 0))).toBe('efficient');
  });

  it('is fedHeavy when feeding dominates', () => {
    expect(determineAdultForm(pet(5, 1, 0))).toBe('fedHeavy');
  });

  it('is playHeavy when playing dominates', () => {
    expect(determineAdultForm(pet(1, 5, 0))).toBe('playHeavy');
  });

  it('is sleepHeavy when sleep minutes dominate', () => {
    // sleepMinutes 25 / SLEEP_MINUTES_PER_TALLY_UNIT (5) = 5 tally units
    expect(determineAdultForm(pet(1, 1, 25))).toBe('sleepHeavy');
  });

  it('is balanced when no single tally dominates', () => {
    // feedCount 2, playCount 2, sleepMinutes 10 -> sleep tally 2; total 6, each third
    expect(determineAdultForm(pet(2, 2, 10))).toBe('balanced');
  });
});
