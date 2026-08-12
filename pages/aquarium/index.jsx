import Head from 'next/head';
import { useRouter } from 'next/router';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import styles from './index.module.css';
import { pwaMetaTags } from '../../components/layout';
import { getSpecies } from '../../lib/aquarium/creatures';
import { loadTank, saveTank } from '../../lib/aquarium/storage';
import { clamp, generateId } from '../../lib/random';
import {
  applyElapsed,
  dropFood,
  dropToy,
  wipeDirtSpot,
  hatchEgg,
  assignSeekTargets,
  findDrop,
  consumeDrop,
  MET_THRESHOLD,
  NEED_FLOOR,
  NEED_MAX,
} from '../../lib/aquarium/simulation';
import { createMovementState, stepMovement, wobbleOffset, CONTACT_RADIUS } from '../../lib/aquarium/movement';
import { createSound } from '../../lib/aquarium/sound';

const TICK_MS = 2000;
const DRAG_SAMPLE_MS = 120;
const PULSE_MS = 650;
const EFFECT_MS = 900;
// Touch jitter on a stationary tap can still fire a pointermove; require real
// movement before treating a press as a drag, so a tap never double-acts.
const MIN_DRAG_PX = 12;

const TOOLS = [
  { key: 'food', label: 'Food', emoji: '🍤', effect: '🍤' },
  { key: 'toy', label: 'Toy', emoji: '🎾', effect: '💗' },
];
const TOOLS_BY_KEY = Object.fromEntries(TOOLS.map((t) => [t.key, t]));

// Derived from MET_THRESHOLD so "the bubble is showing" and "the fish will
// actually swim to a drop of that kind" (assignSeekTargets' eligibility test)
// are the same condition — a bubble that appears above the seek cutoff would
// promise the toddler care the fish then refuses to collect.
const WANT_BUBBLE_THRESHOLD = (MET_THRESHOLD - NEED_FLOOR) / (NEED_MAX - NEED_FLOOR);
const needUrgency = (value) => {
  const metFraction = clamp((value - NEED_FLOOR) / (NEED_MAX - NEED_FLOOR), 0, 1);
  if (metFraction >= WANT_BUBBLE_THRESHOLD) return 0;
  return 1 - metFraction / WANT_BUBBLE_THRESHOLD;
};
const wantBubble = (creature) => {
  const hungerUrgency = needUrgency(creature.hunger);
  const happinessUrgency = needUrgency(creature.happiness);
  const urgency = Math.max(hungerUrgency, happinessUrgency);
  if (urgency <= 0) return null;
  return { emoji: hungerUrgency >= happinessUrgency ? '🍤' : '🎾', visible: urgency };
};

// Click position within an element as 0..1 fractions; guards a zero-size rect.
const rectFraction = (el, clientX, clientY) => {
  const rect = el.getBoundingClientRect();
  if (!rect.width || !rect.height) return { x: 0, y: 0 };
  return {
    x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
  };
};

export default function Aquarium() {
  const { basePath } = useRouter();
  const [tank, setTank] = useState(null);
  const [pulsingIds, setPulsingIds] = useState(() => new Set());
  const [effects, setEffects] = useState([]);
  const soundRef = useRef(null);
  const tankRef = useRef(null);
  const dragRef = useRef({ active: false, lastSample: 0 });
  const moveStatesRef = useRef(new Map());

  // Mount: load, catch up offline decay, wire sound.
  useEffect(() => {
    const now = Date.now();
    const loaded = loadTank(now);
    const caughtUp = applyElapsed(loaded, now - loaded.lastSeen, now);
    setTank(caughtUp);
    soundRef.current = createSound(caughtUp.soundOn);
  }, []);

  // Persist + slow decay tick while mounted.
  useEffect(() => {
    if (!tank) return undefined;
    const id = setInterval(() => {
      setTank((prev) => {
        if (!prev) return prev;
        const now = Date.now();
        const next = applyElapsed(prev, now - prev.lastSeen, now);
        return saveTank(next, now);
      });
    }, TICK_MS);
    return () => clearInterval(id);
    // Deliberately depends on presence, not identity: the interval only needs
    // to start once tank first loads, and setTank/applyElapsed/saveTank are
    // stable across renders.
  }, [tank !== null]);

  const commit = useCallback((updater, cue) => {
    setTank((prev) => {
      if (!prev) return prev;
      const next = updater(prev);
      if (cue && soundRef.current) soundRef.current.play(cue);
      return saveTank(next, Date.now());
    });
  }, []);

  const selectTool = (key) => commit((prev) => ({ ...prev, selectedTool: key }), null);

  // Brief bounce/flash on the exact creature/spot a directed action touched.
  const pulse = (id) => {
    setPulsingIds((prev) => new Set(prev).add(id));
    setTimeout(() => {
      setPulsingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, PULSE_MS);
  };

  // Ripple at the tap/drag point, since which creature will eventually reach
  // a drop isn't known at drop time.
  const spawnEffect = (x, y, emoji) => {
    const effectId = generateId();
    setEffects((prev) => [...prev, { id: effectId, x, y, emoji }]);
    setTimeout(() => {
      setEffects((prev) => prev.filter((e) => e.id !== effectId));
    }, EFFECT_MS);
  };

  // requestAnimationFrame movement loop: steers each fish toward its claimed
  // drop (or idle wander), consuming a drop on contact. Position updates every
  // frame in React state; only the existing 2s tick (above) writes to storage.
  useEffect(() => {
    if (!tank) return undefined;
    let frameId;
    let lastTime = null;
    const loop = (time) => {
      const dt = lastTime == null ? 0 : Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;
      const boundsWidth = tankRef.current
        ? tankRef.current.getBoundingClientRect().width || 1
        : 1;
      const now = Date.now();
      const events = [];
      setTank((prev) => {
        if (!prev) return prev;
        const claimed = assignSeekTargets(prev);
        const positioned = claimed.creatures.map((c) => {
          if (!moveStatesRef.current.has(c.id)) {
            moveStatesRef.current.set(c.id, createMovementState(c.x, c.y));
          }
          const found = c.seekTargetId ? findDrop(claimed, c.seekTargetId) : null;
          const targetPoint = found ? { x: found.drop.x, y: found.drop.y } : null;
          const stepped = stepMovement(
            moveStatesRef.current.get(c.id),
            dt,
            now,
            boundsWidth,
            targetPoint,
          );
          moveStatesRef.current.set(c.id, stepped);
          if (targetPoint && Math.hypot(stepped.x - targetPoint.x, stepped.y - targetPoint.y)
            <= CONTACT_RADIUS) {
            events.push({
              creatureId: c.id,
              dropId: c.seekTargetId,
              dropType: found.type,
              x: stepped.x,
              y: stepped.y,
            });
          }
          return { ...c, x: stepped.x, y: stepped.y };
        });
        let next = { ...claimed, creatures: positioned };
        events.forEach((ev) => {
          next = consumeDrop(next, ev.creatureId, ev.dropId);
        });
        return next;
      });
      events.forEach((ev) => {
        pulse(ev.creatureId);
        spawnEffect(ev.x, ev.y, ev.dropType === 'food' ? '🍤' : '💗');
        if (soundRef.current) soundRef.current.play(ev.dropType === 'food' ? 'nom' : 'pop');
      });
      frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
    // Deliberately depends on presence, not identity, same as the decay tick.
  }, [tank !== null]);

  const dropAt = (x, y) => {
    spawnEffect(x, y, TOOLS_BY_KEY[tank.selectedTool].effect);
    if (tank.selectedTool === 'food') commit((prev) => dropFood(prev, x, y), 'pop');
    else commit((prev) => dropToy(prev, x, y), 'pop');
  };

  const wipeSpot = (id, x, y) => {
    pulse(id);
    spawnEffect(x, y, '✨');
    commit((prev) => wipeDirtSpot(prev, id), 'sparkle');
  };

  // Any tap inside the tank drops the selected tool's item at that point —
  // including a tap that lands on a fish, per the "guaranteed feed this one"
  // interaction. Dirt spots stop this from bubbling up (see their own
  // onClick) so tapping a spot always wipes it instead of dropping.
  const handleTankClick = (e) => {
    if (!tank) return;
    const { x, y } = rectFraction(tankRef.current, e.clientX, e.clientY);
    dropAt(x, y);
  };

  const handleDirtSpotClick = (e, spot) => {
    e.stopPropagation();
    wipeSpot(spot.id, spot.x, spot.y);
  };

  // Drag repeatedly acts along the pointer path, sampled to avoid flooding
  // state updates; a real browser gets drag-wipe-across-spots via
  // elementFromPoint since jsdom doesn't implement it meaningfully.
  // Deliberately unguarded on e.target: fish are large plain divs with no press
  // handler of their own, so a drag that starts on top of one must still count
  // as a drag — matching handleTankClick, which already accepts taps anywhere.
  const handleTankPointerDown = (e) => {
    dragRef.current = {
      active: true,
      dragging: false,
      lastSample: 0,
      startX: e.clientX,
      startY: e.clientY,
    };
  };

  const handleTankPointerMove = (e) => {
    if (!tank || !dragRef.current.active) return;
    const drag = dragRef.current;
    if (!drag.dragging) {
      const moved = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
      if (moved < MIN_DRAG_PX) return;
      drag.dragging = true;
    }
    const now = Date.now();
    if (now - drag.lastSample < DRAG_SAMPLE_MS) return;
    drag.lastSample = now;
    const { x, y } = rectFraction(tankRef.current, e.clientX, e.clientY);
    const hit = typeof document.elementFromPoint === 'function'
      ? document.elementFromPoint(e.clientX, e.clientY)
      : null;
    const spotId = hit && hit.dataset ? hit.dataset.spotId : undefined;
    if (spotId) wipeSpot(spotId, x, y);
    else dropAt(x, y);
  };

  const endTankDrag = () => {
    dragRef.current.active = false;
  };

  const handleHatch = (e) => {
    e.stopPropagation();
    commit((prev) => hatchEgg(prev, Date.now()), 'pop');
  };

  const toggleSound = () =>
    commit((prev) => {
      const soundOn = !prev.soundOn;
      if (soundRef.current) soundRef.current.setEnabled(soundOn);
      return { ...prev, soundOn };
    }, null);

  if (!tank) {
    return (
      <div className={styles.page}>
        <Head>{pwaMetaTags(basePath)}</Head>
      </div>
    );
  }

  const dirtiness = clamp((NEED_MAX - tank.tankCleanliness) / (NEED_MAX - NEED_FLOOR), 0, 1);
  const tankFilter = `sepia(${(0.55 * dirtiness).toFixed(2)}) `
    + `saturate(${(1 + 0.5 * dirtiness).toFixed(2)}) `
    + `brightness(${(1 - 0.15 * dirtiness).toFixed(2)})`;

  return (
    <div className={styles.page}>
      <Head>{pwaMetaTags(basePath)}</Head>

      <button
        type="button"
        className={styles.muteToggle}
        aria-pressed={tank.soundOn}
        aria-label={tank.soundOn ? 'Sound on' : 'Sound off'}
        onClick={toggleSound}
      >
        {tank.soundOn ? '🔊' : '🔇'}
      </button>

      <div
        ref={tankRef}
        className={styles.tank}
        style={{ filter: tankFilter }}
        onClick={handleTankClick}
        onPointerDown={handleTankPointerDown}
        onPointerMove={handleTankPointerMove}
        onPointerUp={endTankDrag}
        onPointerLeave={endTankDrag}
        onPointerCancel={endTankDrag}
        role="presentation"
      >
        {tank.creatures.map((c) => {
          const species = getSpecies(c.species);
          const size = species.sizePx[c.stage];
          const classes = [styles.creature];
          if (c.hunger < MET_THRESHOLD) classes.push(styles.hungry);
          if (c.happiness < MET_THRESHOLD) classes.push(styles.sad);
          if (pulsingIds.has(c.id)) classes.push(styles.pulse);
          const bubble = wantBubble(c);
          const moveState = moveStatesRef.current.get(c.id);
          const wobble = moveState
            ? wobbleOffset(moveState.heading, moveState.wobblePhase, Date.now())
            : { x: 0, y: 0 };
          return (
            <div
              key={c.id}
              data-testid="creature"
              className={classes.join(' ')}
              style={{
                left: `${(c.x + wobble.x) * 100}%`,
                top: `${(c.y + wobble.y) * 100}%`,
                fontSize: `${size}px`,
                filter: `hue-rotate(${species.hueDeg}deg)`,
              }}
              aria-label={species.name}
            >
              {species.emoji[c.stage]}
              {bubble && (
                <span
                  className={styles.wantBubble}
                  style={{
                    opacity: bubble.visible,
                    // Keeps the class's own centering translate — an inline
                    // transform replaces it outright rather than composing.
                    transform: `translateX(-50%) scale(${0.6 + 0.4 * bubble.visible})`,
                  }}
                  aria-hidden="true"
                >
                  {bubble.emoji}
                </span>
              )}
            </div>
          );
        })}

        {tank.foodDrops.map((d) => (
          <span
            key={d.id}
            data-testid="foodDrop"
            className={styles.foodDrop}
            style={{ left: `${d.x * 100}%`, top: `${d.y * 100}%` }}
            aria-hidden="true"
          >
            🍤
          </span>
        ))}

        {tank.toyDrops.map((d) => (
          <span
            key={d.id}
            data-testid="toyDrop"
            className={styles.toyDrop}
            style={{ left: `${d.x * 100}%`, top: `${d.y * 100}%` }}
            aria-hidden="true"
          >
            🎾
          </span>
        ))}

        {tank.dirtSpots.map((spot) => (
          <button
            type="button"
            key={spot.id}
            data-testid="dirtSpot"
            data-spot-id={spot.id}
            className={`${styles.dirtSpot} ${pulsingIds.has(spot.id) ? styles.pulse : ''}`}
            style={{ left: `${spot.x * 100}%`, top: `${spot.y * 100}%` }}
            aria-label="Wipe dirt spot"
            onClick={(e) => handleDirtSpotClick(e, spot)}
          >
            💩
          </button>
        ))}

        {effects.map((e) => (
          <span
            key={e.id}
            className={styles.effect}
            style={{ left: `${e.x * 100}%`, top: `${e.y * 100}%` }}
            aria-hidden="true"
          >
            {e.emoji}
          </span>
        ))}

        {tank.egg && (
          <button
            type="button"
            data-testid="egg"
            className={styles.egg}
            aria-label="Hatch egg"
            onClick={handleHatch}
          >
            🥚
          </button>
        )}
      </div>

      <div className={styles.palette} role="group" aria-label="Care tools">
        {TOOLS.map((tool) => (
          <button
            type="button"
            key={tool.key}
            className={`${styles.tool} ${tank.selectedTool === tool.key ? styles.selected : ''}`}
            aria-pressed={tank.selectedTool === tool.key}
            aria-label={tool.label}
            onClick={() => selectTool(tool.key)}
          >
            <span aria-hidden="true">{tool.emoji}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
