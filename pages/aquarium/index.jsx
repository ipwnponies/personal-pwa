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
  computeAffinity,
  findDrop,
  consumeDrop,
  MET_THRESHOLD,
  NEED_FLOOR,
  NEED_MAX,
  isDecorationCapReached,
  placeDecoration,
  moveDecoration,
  removeDecoration,
} from '../../lib/aquarium/simulation';
import { createMovementState, stepMovement, wobbleOffset, easeToward, CONTACT_RADIUS } from '../../lib/aquarium/movement';
import {
  FISHING_DETECTION_RADIUS,
  BITE_TICK_MS,
  generateHiddenAttraction,
  computeBiteChance,
  catchFish,
} from '../../lib/aquarium/fishing';
import { createSound } from '../../lib/aquarium/sound';
import { getDecorationType } from '../../lib/aquarium/decorations';

const TICK_MS = 2000;
const DRAG_SAMPLE_MS = 120;
const PULSE_MS = 650;
const EFFECT_MS = 900;
const UNLOCK_HIGHLIGHT_MS = 1500;
// Touch jitter on a stationary tap can still fire a pointermove; require real
// movement before treating a press as a drag, so a tap never double-acts.
const MIN_DRAG_PX = 12;
// Sibling to movement.js's CONTACT_RADIUS, but scoped to this page since
// decorations aren't a movement/fish concept — a preschooler's imprecise tap
// still grabs the item.
const GRAB_RADIUS = 0.06;
const FISHING_TOOL_KEY = 'fishing';
const SURFACE_LINE_FRAC = 0.12;
const ROD_EASE_PER_SEC = 3;

// Single source of truth for fishingRef's idle shape, shared by its initial
// value and resetFishing() — a field added to only one of the two would
// silently leave the other path producing a stale/undefined value.
const createIdleFishingState = () => ({
  phase: 'idle', // 'idle' | 'pending' | 'casting' | 'hooked'
  pointerId: null,
  startX: 0,
  startY: 0,
  baitX: 0.5,
  baitY: SURFACE_LINE_FRAC,
  rodTipX: 0.5,
  rodTipY: SURFACE_LINE_FRAC,
  hookedId: null,
  lastBiteTick: 0,
});

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

// Nearest decoration to (x, y) within radius, or null. On overlap the
// nearer one wins.
const nearestDecorationAt = (decorations, x, y, radius) =>
  decorations.reduce((nearest, d) => {
    const dist = Math.hypot(d.x - x, d.y - y);
    if (dist > radius) return nearest;
    if (!nearest || dist < nearest.dist) return { decoration: d, dist };
    return nearest;
  }, null);

export default function Aquarium() {
  const { basePath } = useRouter();
  const [tank, setTank] = useState(null);
  const [pulsingIds, setPulsingIds] = useState(() => new Set());
  const [effects, setEffects] = useState([]);
  const [unlockHighlightKey, setUnlockHighlightKey] = useState(null);
  // fishingRef below is mutated in place (like moveStatesRef/dragRef) rather
  // than replaced via setState, so a pointer-driven phase/position change
  // doesn't cause React to re-render on its own — the movement loop's own
  // setTank ticks would eventually catch it up, but the gesture needs the
  // surface line/bait to reflect it immediately, not on the next animation
  // frame. This counter's value is never read; bumping it is only ever used
  // to ask React to re-render with the ref's latest values.
  const [, bumpFishingRender] = useState(0);
  const soundRef = useRef(null);
  const tankRef = useRef(null);
  const decorationPaletteRef = useRef(null);
  const dragRef = useRef({ active: false, lastSample: 0 });
  const suppressClickRef = useRef(false);
  // Pointers rejected by handleTankPointerDown (a second concurrent touch)
  // while another gesture owns dragRef — tracked so it's each ignored
  // pointer's own eventual release, not its touch-down, that suppresses its
  // trailing click (see handleTankPointerUp).
  const ignoredPointersRef = useRef(new Set());
  const moveStatesRef = useRef(new Map());
  const fishingRef = useRef(createIdleFishingState());
  // Per-fish bite-race state for the current cast, kept outside React state
  // for the same reason as moveStatesRef: it changes on every bite tick and is
  // never persisted. hiddenAttraction is the fishing-side stand-in for
  // computeAffinity (a fish's unadvertised interest in the bait), prevDist
  // feeds computeBiteChance's "got closer since last tick" snowball.
  const biteStatesRef = useRef(new Map());

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

  const resetFishing = () => {
    // The whole bite race belongs to the cast that just ended: every fish gets
    // a fresh hidden attraction next time out, so one unlucky roll can't make
    // a fish uncatchable for the rest of the page's lifetime.
    biteStatesRef.current.clear();
    fishingRef.current = createIdleFishingState();
    bumpFishingRender((n) => n + 1);
  };

  // Switching tools reassigns which branch handles an in-flight pointer's
  // up/cancel/leave (the fishing guards check selectedTool before dragRef) —
  // without this reset, a decoration/paint drag left active on another
  // finger would never see its own release once the tool changes out from
  // under it, permanently stranding dragRef.current.active and freezing the
  // tank until reload.
  //
  // Switching away from Fishing needs the same treatment: once selectedTool
  // is no longer 'fishing', the tank handlers stop routing to
  // handleFishingPointerMove/Up at all, so a still-active cast (or a hooked
  // fish) would otherwise never reach resetFishing — leaving a stuck bait/
  // line on screen and, if a fish was hooked, that fish locked onto the
  // frozen bait forever. resetFishing() is a no-op from 'idle', so calling
  // it unconditionally is safe even when no cast was in progress.
  const selectTool = (key) => {
    // A pointer stranded mid-gesture by this reset still gets its own
    // pointerup/click later — route it through the same "ignored pointer"
    // suppression as a rejected second touch (handleTankPointerDown) so that
    // trailing click doesn't fall through to a plain tap-to-drop and place an
    // item at wherever the stranded pointer happens to release.
    if (dragRef.current.active) ignoredPointersRef.current.add(dragRef.current.pointerId);
    if (fishingRef.current.pointerId != null) ignoredPointersRef.current.add(fishingRef.current.pointerId);
    dragRef.current = { active: false, lastSample: 0 };
    resetFishing();
    commit((prev) => ({ ...prev, selectedTool: key }), null);
  };

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

  // Brief glow on the newly revealed palette icon (KTD7) — palette-local,
  // not the tank-relative pulse/spawnEffect, which target the tank's own
  // bounding box and can't address a palette element.
  const flashUnlock = (key) => {
    setUnlockHighlightKey(key);
    setTimeout(() => {
      setUnlockHighlightKey((current) => (current === key ? null : current));
    }, UNLOCK_HIGHLIGHT_MS);
  };

  // Reels the hooked fish out of the tank and into the bucket. Defined here
  // rather than beside resetFishing so it sits after the pulse/spawnEffect
  // cue helpers it calls. The bite state is dropped along with the cast by
  // resetFishing's clear() — a caught fish has no stake in the next cast's
  // race, and the fish left behind get fresh hidden attractions next time out.
  const landCatch = (creatureId) => {
    const { baitX, baitY } = fishingRef.current;
    pulse(creatureId);
    spawnEffect(baitX, baitY, '🎣');
    resetFishing();
    commit((prev) => catchFish(prev, creatureId), 'sparkle');
  };

  // requestAnimationFrame movement loop: steers each fish toward the bait of
  // an active cast, else its claimed drop, else an idle wander — consuming a
  // drop on contact, and running the cast's bite rolls. Position updates every
  // frame in React state; only the existing 2s tick (above) writes to storage.
  useEffect(() => {
    if (!tank) return undefined;
    let frameId;
    let lastTime = null;
    const loop = (time) => {
      const dt = lastTime == null ? 0 : Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;
      const fishing = fishingRef.current;
      if (fishing.phase !== 'idle') {
        // Only the horizontal lag eases toward the bait — the rod tip is
        // anchored to the surface line (handleFishingPointerDown/
        // createIdleFishingState both pin rodTipY there), so easing Y too
        // would visibly collapse the line to nothing the moment the bait
        // holds still, well before any bite.
        fishing.rodTipX = easeToward(fishing.rodTipX, fishing.baitX, ROD_EASE_PER_SEC * dt);
      }
      const boundsWidth = tankRef.current
        ? tankRef.current.getBoundingClientRect().width || 1
        : 1;
      const now = Date.now();
      const events = [];
      let unlockedThisFrame = null;
      setTank((prev) => {
        if (!prev) return prev;
        const claimed = assignSeekTargets(prev);
        const positioned = claimed.creatures.map((c) => {
          if (!moveStatesRef.current.has(c.id)) {
            moveStatesRef.current.set(c.id, createMovementState(c.x, c.y));
          }
          const isHooked = fishing.phase === 'hooked' && fishing.hookedId === c.id;
          const dist = fishing.phase !== 'idle'
            ? Math.hypot(c.x - fishing.baitX, c.y - fishing.baitY)
            : Infinity;
          const isLured = fishing.phase === 'casting' && dist <= FISHING_DETECTION_RADIUS;
          let targetPoint = null;
          // A creature not currently seeking never reaches stepMovement's
          // seek branch, so this value is unused wander-side — 1 just keeps
          // the call self-explanatory without a misleading "0".
          let affinity = 1;
          // Only a food/toy drop is edible; the bait is a target the fish
          // steers at but never consumes, so `found` stays null while lured or
          // hooked and the contact/consume check below skips it.
          let found = null;
          if (isHooked) {
            targetPoint = { x: fishing.baitX, y: fishing.baitY };
            affinity = 1;
          } else if (isLured) {
            if (!biteStatesRef.current.has(c.id)) {
              biteStatesRef.current.set(c.id, {
                hiddenAttraction: generateHiddenAttraction(Math.random),
                prevDist: dist,
              });
            }
            targetPoint = { x: fishing.baitX, y: fishing.baitY };
            // The bait outranks whatever drop this fish had claimed: a lure
            // that loses to a shrimp already in the tank would never read as
            // a race.
            affinity = biteStatesRef.current.get(c.id).hiddenAttraction;
          } else {
            found = c.seekTargetId ? findDrop(claimed, c.seekTargetId) : null;
            targetPoint = found ? { x: found.drop.x, y: found.drop.y } : null;
            affinity = found
              ? computeAffinity(found.type === 'food' ? c.hunger : c.happiness)
              : 1;
          }
          const stepped = stepMovement(
            moveStatesRef.current.get(c.id),
            dt,
            now,
            boundsWidth,
            targetPoint,
            Math.random,
            affinity,
          );
          moveStatesRef.current.set(c.id, stepped);
          if (found && Math.hypot(stepped.x - targetPoint.x, stepped.y - targetPoint.y)
            <= CONTACT_RADIUS) {
            events.push({
              creatureId: c.id,
              dropId: c.seekTargetId,
              dropType: found.type,
              x: stepped.x,
              y: stepped.y,
            });
          }
          // A fish diverted by the bait (lured or hooked) isn't pursuing its
          // previously claimed drop — release that claim so assignSeekTargets
          // can hand the drop to another hungry/bored fish instead of leaving
          // it reserved-but-untouched for the whole cast.
          return {
            ...c,
            x: stepped.x,
            y: stepped.y,
            seekTargetId: (isHooked || isLured) ? null : c.seekTargetId,
          };
        });

        // The bite race: every BITE_TICK_MS each in-range fish rolls for the
        // hook, nearest first, and the first success ends the round —
        // there's one line in the water, so only one fish can be hooked.
        if (fishing.phase === 'casting' && now - fishing.lastBiteTick >= BITE_TICK_MS) {
          fishing.lastBiteTick = now;
          const eligible = positioned
            .map((c) => ({ c, dist: Math.hypot(c.x - fishing.baitX, c.y - fishing.baitY) }))
            .filter(({ dist }) => dist <= FISHING_DETECTION_RADIUS)
            .sort((a, b) => a.dist - b.dist);
          eligible.some(({ c, dist }) => {
            // A fish that only just entered range this frame has no seeded
            // state yet; treat this tick as its first, with no snowball.
            const prior = biteStatesRef.current.get(c.id)
              || { hiddenAttraction: generateHiddenAttraction(Math.random), prevDist: dist };
            const gotCloser = dist < prior.prevDist;
            const chance = computeBiteChance(
              dist,
              FISHING_DETECTION_RADIUS,
              prior.hiddenAttraction,
              gotCloser,
            );
            biteStatesRef.current.set(c.id, {
              hiddenAttraction: prior.hiddenAttraction,
              prevDist: dist,
            });
            if (Math.random() < chance) {
              fishing.phase = 'hooked';
              fishing.hookedId = c.id;
              return true;
            }
            return false;
          });
        }

        let next = { ...claimed, creatures: positioned };
        events.forEach((ev) => {
          const before = next.unlockedDecorationTypes.length;
          next = consumeDrop(next, ev.creatureId, ev.dropId);
          if (next.unlockedDecorationTypes.length > before) {
            unlockedThisFrame = next.unlockedDecorationTypes[next.unlockedDecorationTypes.length - 1];
          }
        });
        return next;
      });
      events.forEach((ev) => {
        pulse(ev.creatureId);
        spawnEffect(ev.x, ev.y, ev.dropType === 'food' ? '🍤' : '💗');
        if (soundRef.current) soundRef.current.play(ev.dropType === 'food' ? 'nom' : 'pop');
      });
      if (unlockedThisFrame) {
        flashUnlock(unlockedThisFrame);
        if (soundRef.current) soundRef.current.play('unlock');
      }
      frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
    // Deliberately depends on presence, not identity, same as the decay tick.
  }, [tank !== null]);

  const dropAt = (x, y) => {
    const tool = TOOLS_BY_KEY[tank.selectedTool];
    if (tool) {
      spawnEffect(x, y, tool.effect);
      commit(
        (prev) => (tank.selectedTool === 'food' ? dropFood(prev, x, y) : dropToy(prev, x, y)),
        'pop',
      );
      return;
    }
    if (isDecorationCapReached(tank, tank.selectedTool)) {
      spawnEffect(x, y, '🚫');
      if (soundRef.current) soundRef.current.play('refused');
      return;
    }
    spawnEffect(x, y, getDecorationType(tank.selectedTool).emoji);
    commit((prev) => placeDecoration(prev, tank.selectedTool, x, y), 'pop');
  };

  const wipeSpot = (id, x, y) => {
    pulse(id);
    spawnEffect(x, y, '✨');
    const projected = wipeDirtSpot(tank, id);
    const unlocked = projected.unlockedDecorationTypes.length > tank.unlockedDecorationTypes.length;
    if (unlocked) {
      flashUnlock(projected.unlockedDecorationTypes[projected.unlockedDecorationTypes.length - 1]);
    }
    commit((prev) => wipeDirtSpot(prev, id), unlocked ? 'unlock' : 'sparkle');
  };

  const handleFishingPointerDown = (e) => {
    if (fishingRef.current.phase !== 'idle') return;
    const { x, y } = rectFraction(tankRef.current, e.clientX, e.clientY);
    if (y > SURFACE_LINE_FRAC) return;
    if (typeof tankRef.current.setPointerCapture === 'function') {
      tankRef.current.setPointerCapture(e.pointerId);
    }
    fishingRef.current = {
      ...fishingRef.current,
      phase: 'pending',
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      baitX: x,
      baitY: y,
      rodTipX: x,
      rodTipY: SURFACE_LINE_FRAC,
      hookedId: null,
      lastBiteTick: Date.now(),
    };
    bumpFishingRender((n) => n + 1);
  };

  const handleFishingPointerMove = (e) => {
    const fishing = fishingRef.current;
    if (fishing.pointerId !== e.pointerId || fishing.phase === 'idle') return;
    if (fishing.phase === 'pending') {
      if (e.clientY - fishing.startY < MIN_DRAG_PX) return;
      fishing.phase = 'casting';
    }
    const { x, y } = rectFraction(tankRef.current, e.clientX, e.clientY);
    fishing.baitX = x;
    fishing.baitY = y;
    // Reeling the bait back up through the surface band lands whatever is on
    // the hook. Only 'hooked' lands: an empty line crossing back up is just a
    // recast, and releasing instead (handleFishingPointerUp, which resets
    // unconditionally) frees the fish at any phase.
    if (fishing.phase === 'hooked' && y <= SURFACE_LINE_FRAC) {
      landCatch(fishing.hookedId);
      return;
    }
    bumpFishingRender((n) => n + 1);
  };

  const handleFishingPointerUp = (e) => {
    if (fishingRef.current.pointerId !== e.pointerId) return;
    resetFishing();
  };

  // Any tap inside the tank drops the selected tool's item at that point —
  // including a tap that lands on a fish, per the "guaranteed feed this one"
  // interaction. Dirt spots stop this from bubbling up (see their own
  // onClick) so tapping a spot always wipes it instead of dropping.
  const handleTankClick = (e) => {
    if (!tank) return;
    if (tank.selectedTool === FISHING_TOOL_KEY) return;
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
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
    if (!tank) return;
    if (tank.selectedTool === FISHING_TOOL_KEY) {
      handleFishingPointerDown(e);
      return;
    }
    // dragRef tracks a single gesture, not one per pointerId — ignore a
    // second concurrent pointer (e.g. a resting palm, or multi-touch) rather
    // than letting it hijack the first pointer's in-progress drag/grab.
    if (dragRef.current.active) {
      // That ignored pointer still gets its own trailing click once it
      // lifts — remember it so handleTankPointerUp can suppress that click
      // when it actually happens. Setting suppressClickRef here instead
      // (at touch-down) would hold it true for the ignored pointer's whole
      // dwell time and could wrongly swallow the real gesture's own
      // legitimate click if that fires first (e.g. a palm resting through
      // an otherwise plain tap-to-drop).
      ignoredPointersRef.current.add(e.pointerId);
      return;
    }
    // Clear any stale suppression left by a pointercancel'd prior gesture
    // (no trailing click follows a cancel, so the flag can otherwise get
    // stuck true and silently swallow this new interaction's own click).
    suppressClickRef.current = false;
    const { x, y } = rectFraction(tankRef.current, e.clientX, e.clientY);
    const hit = nearestDecorationAt(tank.decorations, x, y, GRAB_RADIUS);
    if (hit) {
      // Pointer capture keeps pointermove/pointerup targeting the tank even
      // once the pointer crosses into the (sibling, not nested) palette —
      // without it, onPointerLeave clears drag state before a
      // drag-to-remove release is ever observed (KTD4). Feature-detected
      // rather than try/catch'd: jsdom simply lacks the method (the only
      // known gap), and a real exception from a supported call should
      // surface rather than being swallowed.
      if (typeof tankRef.current.setPointerCapture === 'function') {
        tankRef.current.setPointerCapture(e.pointerId);
      }
      dragRef.current = {
        active: true,
        dragging: false,
        mode: 'decoration',
        decorationId: hit.decoration.id,
        pointerId: e.pointerId,
        lastSample: 0,
        startX: e.clientX,
        startY: e.clientY,
        refusalFired: false,
      };
      return;
    }
    dragRef.current = {
      active: true,
      dragging: false,
      mode: 'paint',
      pointerId: e.pointerId,
      lastSample: 0,
      startX: e.clientX,
      startY: e.clientY,
      refusalFired: false,
    };
  };

  // Shared ownership check for the four handlers below: an up/move/cancel/
  // leave from a pointer we never tracked (ignored at pointer-down because
  // another gesture was already active) must not touch the in-progress
  // gesture's state or coordinates.
  const isActiveGesturePointer = (e) => dragRef.current.active && e.pointerId === dragRef.current.pointerId;

  const handleTankPointerMove = (e) => {
    if (tank && tank.selectedTool === FISHING_TOOL_KEY) {
      handleFishingPointerMove(e);
      return;
    }
    if (!tank || !isActiveGesturePointer(e)) return;
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
    if (drag.mode === 'decoration') {
      commit((prev) => moveDecoration(prev, drag.decorationId, x, y), null);
      return;
    }
    const hit = typeof document.elementFromPoint === 'function'
      ? document.elementFromPoint(e.clientX, e.clientY)
      : null;
    const spotId = hit && hit.dataset ? hit.dataset.spotId : undefined;
    if (spotId) {
      wipeSpot(spotId, x, y);
      return;
    }
    // A cap-reached refusal cue is meant for one discrete tap attempt, not a
    // continuous drag: once it has fired for this gesture, further throttled
    // samples that would also hit the cap are dropped entirely rather than
    // re-triggering the refusal cue/effect on every sample.
    const tool = TOOLS_BY_KEY[tank.selectedTool];
    if (!tool && isDecorationCapReached(tank, tank.selectedTool)) {
      if (drag.refusalFired) return;
      drag.refusalFired = true;
    }
    dropAt(x, y);
  };

  const isPointInRect = (el, clientX, clientY) => {
    const rect = el.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  };

  const handleTankPointerUp = (e) => {
    // A previously-ignored second pointer releasing: suppress its own
    // trailing click right here, at the moment it's actually about to fire,
    // instead of for its whole dwell time (see handleTankPointerDown). Checked
    // before the fishing branch below so this suppression always applies,
    // regardless of which tool ends up selected by the time the pointer
    // actually releases.
    if (ignoredPointersRef.current.delete(e.pointerId)) {
      suppressClickRef.current = true;
      return;
    }
    if (tank && tank.selectedTool === FISHING_TOOL_KEY) {
      handleFishingPointerUp(e);
      return;
    }
    if (!isActiveGesturePointer(e)) return;
    const drag = dragRef.current;
    if (drag.mode === 'decoration') {
      suppressClickRef.current = true;
      const overDecorationPalette = decorationPaletteRef.current
        && isPointInRect(decorationPaletteRef.current, e.clientX, e.clientY);
      if (overDecorationPalette) {
        commit((prev) => removeDecoration(prev, drag.decorationId), 'sparkle');
      }
    }
    dragRef.current = { active: false, lastSample: 0 };
  };

  // pointercancel means the gesture was ABORTED (scroll takeover, multi-touch,
  // an incoming call, ...), not a real release — it can carry stale/last-known
  // coordinates that happen to sit over the delete zone. Treating it like
  // pointerup would silently delete a decoration mid-abort, so cancel only
  // ever clears drag state and never checks the delete zone or removes
  // anything (KTD3's no-punishment, no-surprise-loss design).
  const handleTankPointerCancel = (e) => {
    // No trailing click follows a cancel, so an ignored pointer cancelling
    // just needs its tracked entry cleared, not a suppression — checked
    // before the fishing branch so this cleanup always runs regardless of
    // whatever tool is selected by the time the cancel arrives.
    ignoredPointersRef.current.delete(e.pointerId);
    if (tank && tank.selectedTool === FISHING_TOOL_KEY) {
      handleFishingPointerUp(e);
      return;
    }
    if (!isActiveGesturePointer(e)) return;
    dragRef.current = { active: false, lastSample: 0 };
  };

  const handleTankPointerLeave = (e) => {
    ignoredPointersRef.current.delete(e.pointerId);
    if (tank && tank.selectedTool === FISHING_TOOL_KEY) {
      // Pointer capture (set in handleFishingPointerDown) keeps move/up
      // targeting the tank even after the pointer physically leaves its
      // bounds, so a leave here isn't a real end-of-gesture signal and must
      // not abort an in-progress cast or free a hooked fish. Only fall
      // through to reset when capture isn't supported (the same jsdom/
      // legacy-browser gap handleTankPointerDown already feature-detects) —
      // there, move events may not survive the boundary either, so ending
      // the gesture here matches what up/cancel would otherwise never get
      // the chance to do.
      if (typeof tankRef.current.setPointerCapture === 'function') return;
      handleFishingPointerUp(e);
      return;
    }
    if (!isActiveGesturePointer(e)) return;
    // A decoration grab stays active through pointer capture (see
    // handleTankPointerDown) — only a plain paint-drag ends on leave.
    if (dragRef.current.mode === 'decoration') return;
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
        onPointerUp={handleTankPointerUp}
        onPointerLeave={handleTankPointerLeave}
        onPointerCancel={handleTankPointerCancel}
        role="presentation"
      >
        {tank.selectedTool === FISHING_TOOL_KEY && (
          <div
            className={styles.surfaceLine}
            style={{ top: `${SURFACE_LINE_FRAC * 100}%` }}
            aria-hidden="true"
          />
        )}
        {/* Deliberately 'casting' || 'hooked', not !== 'idle' — the bait must
            stay hidden during 'pending', the brief window between
            pointer-down in the surface band and the drag actually crossing
            MIN_DRAG_PX downward. Showing it on pointer-down alone would make
            a tap-and-release inside the band flash a bait sprite even though
            no cast happened. */}
        {(fishingRef.current.phase === 'casting' || fishingRef.current.phase === 'hooked') && (
          <>
            <svg className={styles.line} data-testid="line" aria-hidden="true">
              <line
                x1={`${fishingRef.current.rodTipX * 100}%`}
                y1={`${fishingRef.current.rodTipY * 100}%`}
                x2={`${fishingRef.current.baitX * 100}%`}
                y2={`${fishingRef.current.baitY * 100}%`}
              />
            </svg>
            <span
              data-testid="bait"
              className={styles.bait}
              style={{
                left: `${fishingRef.current.baitX * 100}%`,
                top: `${fishingRef.current.baitY * 100}%`,
              }}
              aria-hidden="true"
            >
              🪱
            </span>
          </>
        )}
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

        {tank.decorations.map((d) => (
          <button
            type="button"
            key={d.id}
            data-testid="decoration"
            className={styles.decoration}
            style={{ left: `${d.x * 100}%`, top: `${d.y * 100}%` }}
            aria-label={getDecorationType(d.type).name}
            onClick={(e) => e.stopPropagation()}
          >
            {getDecorationType(d.type).emoji}
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
        <button
          type="button"
          className={`${styles.tool} ${tank.selectedTool === FISHING_TOOL_KEY ? styles.selected : ''}`}
          aria-pressed={tank.selectedTool === FISHING_TOOL_KEY}
          aria-label="Fishing"
          onClick={() => selectTool(FISHING_TOOL_KEY)}
        >
          <span aria-hidden="true">🎣</span>
        </button>
        <div
          className={styles.decorationPalette}
          data-testid="decorationPalette"
          ref={decorationPaletteRef}
        >
          {tank.unlockedDecorationTypes.map((key) => {
            const deco = getDecorationType(key);
            const classes = [styles.tool];
            if (tank.selectedTool === key) classes.push(styles.selected);
            if (unlockHighlightKey === key) classes.push(styles.unlockHighlight);
            return (
              <button
                type="button"
                key={key}
                className={classes.join(' ')}
                aria-pressed={tank.selectedTool === key}
                aria-label={deco.name}
                onClick={() => selectTool(key)}
              >
                <span aria-hidden="true">{deco.emoji}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
