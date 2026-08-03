import Head from 'next/head';
import { useRouter } from 'next/router';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import styles from './index.module.css';
import { pwaMetaTags } from '../../components/layout';
import { getSpecies } from '../../lib/aquarium/creatures';
import { loadTank, saveTank } from '../../lib/aquarium/storage';
import { generateId } from '../../lib/random';
import {
  applyElapsed,
  wanderCreatures,
  feedTank,
  playTank,
  cleanTank,
  feedCreature,
  playCreature,
  hatchEgg,
  MET_THRESHOLD,
} from '../../lib/aquarium/simulation';
import { createSound } from '../../lib/aquarium/sound';

const TICK_MS = 2000;
const DRAG_SAMPLE_MS = 120;
const LONG_PRESS_MS = 500;
const PULSE_MS = 500;
const EFFECT_MS = 600;
// Touch jitter on a stationary tap can still fire a pointermove; require real
// movement before treating a press as a drag, so a tap never double-acts.
const MIN_DRAG_PX = 12;
const TOOLS = [
  { key: 'food', label: 'Food', emoji: '🍤', effect: '🍤' },
  { key: 'sponge', label: 'Sponge', emoji: '🧽', effect: '✨' },
  { key: 'toy', label: 'Toy', emoji: '🎾', effect: '💗' },
];
const TOOLS_BY_KEY = Object.fromEntries(TOOLS.map((t) => [t.key, t]));

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
  const pressTimerRef = useRef(null);
  const pressFiredRef = useRef(false);

  // Mount: load, catch up offline decay, wire sound.
  useEffect(() => {
    const now = Date.now();
    const loaded = loadTank(now);
    const caughtUp = applyElapsed(loaded, now - loaded.lastSeen, now);
    setTank(caughtUp);
    soundRef.current = createSound(caughtUp.soundOn);
  }, []);

  // Persist + slow decay + wander tick while mounted.
  useEffect(() => {
    if (!tank) return undefined;
    const id = setInterval(() => {
      setTank((prev) => {
        if (!prev) return prev;
        const now = Date.now();
        const decayed = applyElapsed(prev, now - prev.lastSeen, now);
        const wandered = wanderCreatures(decayed);
        return saveTank(wandered, now);
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

  // Brief bounce/flash on the exact creature a directed action touched —
  // visible confirmation even when its needs were already maxed out.
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

  // Ripple at the tap/drag point for tank-wide actions, since which
  // creature(s) actually got fed/played isn't known at this layer.
  const spawnEffect = (x, y, emoji) => {
    const effectId = generateId();
    setEffects((prev) => [...prev, { id: effectId, x, y, emoji }]);
    setTimeout(() => {
      setEffects((prev) => prev.filter((e) => e.id !== effectId));
    }, EFFECT_MS);
  };

  const actOnTank = (x, y) => {
    spawnEffect(x, y, TOOLS_BY_KEY[tank.selectedTool].effect);
    if (tank.selectedTool === 'food') commit((prev) => feedTank(prev, x, y), 'nom');
    else if (tank.selectedTool === 'sponge') commit((prev) => cleanTank(prev), 'sparkle');
    else commit((prev) => playTank(prev, x, y), 'pop');
  };

  const actOnCreature = (id) => {
    pulse(id);
    if (tank.selectedTool === 'food') commit((prev) => feedCreature(prev, id), 'nom');
    else if (tank.selectedTool === 'sponge') commit((prev) => cleanTank(prev), 'sparkle');
    else commit((prev) => playCreature(prev, id), 'pop');
  };

  const handleTankClick = (e) => {
    if (!tank || e.target !== tankRef.current) return;
    const { x, y } = rectFraction(tankRef.current, e.clientX, e.clientY);
    actOnTank(x, y);
  };

  const handleCreatureClick = (e, id) => {
    e.stopPropagation();
    if (!tank) return;
    // A long-press already acted on this press; skip the trailing click it produces.
    if (pressFiredRef.current) {
      pressFiredRef.current = false;
      return;
    }
    actOnCreature(id);
  };

  // Drag with food/sponge/toy selected repeatedly acts on the tank along the
  // pointer path, sampled to avoid flooding state updates.
  const handleTankPointerDown = (e) => {
    if (e.target !== tankRef.current) return;
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
    actOnTank(x, y);
  };

  const endTankDrag = () => {
    dragRef.current.active = false;
  };

  // Long-press on a creature: hold to feed/play/pet without a directed tap.
  const handleCreaturePointerDown = (e, id) => {
    e.stopPropagation();
    pressFiredRef.current = false;
    pressTimerRef.current = setTimeout(() => {
      pressFiredRef.current = true;
      actOnCreature(id);
    }, LONG_PRESS_MS);
  };

  const cancelCreaturePress = (e) => {
    e.stopPropagation();
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
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

  const dirty = tank.tankCleanliness < MET_THRESHOLD;

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
        className={`${styles.tank} ${dirty ? styles.dirty : ''}`}
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
          return (
            <button
              type="button"
              key={c.id}
              data-testid="creature"
              className={classes.join(' ')}
              style={{
                left: `${c.x * 100}%`,
                top: `${c.y * 100}%`,
                fontSize: `${size}px`,
                filter: `hue-rotate(${species.hueDeg}deg)`,
              }}
              aria-label={species.name}
              onClick={(e) => handleCreatureClick(e, c.id)}
              onPointerDown={(e) => handleCreaturePointerDown(e, c.id)}
              onPointerUp={cancelCreaturePress}
              onPointerLeave={cancelCreaturePress}
              onPointerCancel={cancelCreaturePress}
            >
              {species.emoji[c.stage]}
            </button>
          );
        })}

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
