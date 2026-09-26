import React from 'react';
import PropTypes from 'prop-types';
import styles from './doodle.module.css';

// The long-press gravity well's overlay: a ring under the finger that fills as
// the hold charges, then a breathing ring at the well's radius once it opens.
// A plain, prop-driven function component — no refs or state of its own,
// just `well`/`progress` in and an SVG <circle> (or null) out. (It's meant to
// be composed like Particles — a plain sibling, last inside the canvas
// <svg> — with the caller passing it a ref's current value as a prop rather
// than React state, so a ref mutation alone can still change what renders;
// see DoodleCanvas's own comment at the <Well> call site.)

// A press shorter than this renders nothing, so an ordinary tap-to-spawn never
// flashes a ring. A gesture-recognition threshold like MOVE_THRESHOLD, not a
// feel knob, so it stays out of the tuning panel.
export const WELL_CHARGE_VISIBLE_MS = 150;

// The charging ring reads as shape-sized rather than well-sized: it marks the
// finger, and the well's own radius only becomes meaningful once it opens.
// 28 is MIN_SIZE's value from lib/doodleShapes.js, reused here as a rough
// stand-in rather than an exact match — MIN_SIZE is a shape's smallest
// DIAMETER, but CHARGE_RADIUS is used as a RADIUS, so this ring is actually
// drawn roughly twice that size (56px across). It's also hardcoded here
// rather than imported from lib/doodleShapes.js, and doesn't scale with a
// tablet's sizeMultiplier the way an actually-spawned shape would.
const CHARGE_RADIUS = 28;
const CHARGE_CIRCUMFERENCE = 2 * Math.PI * CHARGE_RADIUS;

export default function Well({
  well, progress, radius, holdMs,
}) {
  if (!well) return null;

  if (well.engaged) {
    return (
      <circle
        className={styles.wellRing}
        data-testid="well-engaged"
        cx={well.x}
        cy={well.y}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        opacity={0.45}
      />
    );
  }

  if (progress * holdMs < WELL_CHARGE_VISIBLE_MS) return null;

  // Starts at twelve o'clock and fills clockwise, which is what a child
  // reading a loading ring expects.
  const filled = CHARGE_CIRCUMFERENCE * Math.min(progress, 1);
  return (
    <circle
      data-testid="well-charging"
      cx={well.x}
      cy={well.y}
      r={CHARGE_RADIUS}
      fill="none"
      stroke="currentColor"
      strokeWidth={4}
      strokeLinecap="round"
      strokeDasharray={`${filled} ${CHARGE_CIRCUMFERENCE}`}
      transform={`rotate(-90 ${well.x} ${well.y})`}
      opacity={0.7}
    />
  );
}

Well.propTypes = {
  well: PropTypes.shape({
    x: PropTypes.number.isRequired,
    y: PropTypes.number.isRequired,
    engaged: PropTypes.bool.isRequired,
  }),
  progress: PropTypes.number.isRequired,
  radius: PropTypes.number.isRequired,
  holdMs: PropTypes.number.isRequired,
};

Well.defaultProps = {
  well: null,
};
