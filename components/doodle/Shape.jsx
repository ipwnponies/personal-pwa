import React from 'react';
import PropTypes from 'prop-types';
import styles from './doodle.module.css';

// Points for a primitive centered at the origin; the parent <g> handles
// placement (translate) and rotation so the pulse animation on the inner
// <g> never clobbers position.
function primitive(shape) {
  const r = shape.size / 2;
  switch (shape.shapeType) {
    case 'square':
      return <rect x={-r} y={-r} width={shape.size} height={shape.size} fill={shape.color} rx={4} />;
    case 'triangle': {
      const pts = `0,${-r} ${r},${r} ${-r},${r}`;
      return <polygon points={pts} fill={shape.color} />;
    }
    case 'star': {
      const spikes = 5;
      const inner = r * 0.5;
      let d = '';
      for (let i = 0; i < spikes * 2; i += 1) {
        const radius = i % 2 === 0 ? r : inner;
        const a = (Math.PI / spikes) * i - Math.PI / 2;
        d += `${Math.cos(a) * radius},${Math.sin(a) * radius} `;
      }
      return <polygon points={d.trim()} fill={shape.color} />;
    }
    case 'circle':
    default:
      return <circle r={r} fill={shape.color} />;
  }
}

export default function Shape({ shape, pulsing }) {
  return (
    <g data-id={shape.id} transform={`translate(${shape.x} ${shape.y}) rotate(${shape.rotation})`}>
      <g className={pulsing ? styles.pulse : undefined}>{primitive(shape)}</g>
    </g>
  );
}

Shape.propTypes = {
  shape: PropTypes.shape({
    id: PropTypes.string.isRequired,
    shapeType: PropTypes.string.isRequired,
    x: PropTypes.number.isRequired,
    y: PropTypes.number.isRequired,
    color: PropTypes.string.isRequired,
    rotation: PropTypes.number.isRequired,
    size: PropTypes.number.isRequired,
  }).isRequired,
  pulsing: PropTypes.bool,
};

Shape.defaultProps = {
  pulsing: false,
};
