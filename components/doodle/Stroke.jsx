import React from 'react';
import PropTypes from 'prop-types';

function Stroke({ stroke }) {
  const points = stroke.points.map((p) => `${p.x},${p.y}`).join(' ');
  return (
    <polyline
      points={points}
      fill="none"
      stroke={stroke.color}
      strokeWidth={8}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

// The drift loop re-renders the canvas every frame but returns unchanged stroke
// object references (advance only remaps shapes), so memoizing skips redundant
// polyline work as strokes accumulate.
export default React.memo(Stroke);

Stroke.propTypes = {
  stroke: PropTypes.shape({
    color: PropTypes.string.isRequired,
    points: PropTypes.arrayOf(PropTypes.shape({
      x: PropTypes.number.isRequired,
      y: PropTypes.number.isRequired,
    })).isRequired,
  }).isRequired,
};
