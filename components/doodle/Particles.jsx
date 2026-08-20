import React from 'react';
import PropTypes from 'prop-types';

const LINE_LENGTH = 10;
const DOT_RADIUS = 3;

export default function Particles({ particles }) {
  return (
    <>
      {particles.map((p) => {
        const opacity = Math.max(0, 1 - p.age / p.maxAge);
        if (p.kind === 'burst') {
          const speed = Math.hypot(p.vx, p.vy) || 1;
          const x2 = p.x + (p.vx / speed) * LINE_LENGTH;
          const y2 = p.y + (p.vy / speed) * LINE_LENGTH;
          return (
            <line
              key={p.id}
              x1={p.x}
              y1={p.y}
              x2={x2}
              y2={y2}
              stroke={p.color}
              strokeWidth={2}
              strokeLinecap="round"
              opacity={opacity}
            />
          );
        }
        return (
          <circle key={p.id} cx={p.x} cy={p.y} r={DOT_RADIUS} fill={p.color} opacity={opacity} />
        );
      })}
    </>
  );
}

Particles.propTypes = {
  particles: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    kind: PropTypes.oneOf(['burst', 'spiral', 'squash', 'dust']).isRequired,
    x: PropTypes.number.isRequired,
    y: PropTypes.number.isRequired,
    vx: PropTypes.number.isRequired,
    vy: PropTypes.number.isRequired,
    color: PropTypes.string.isRequired,
    age: PropTypes.number.isRequired,
    maxAge: PropTypes.number.isRequired,
  })).isRequired,
};
