import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import Shape from './Shape';
import Stroke from './Stroke';

const wrap = (node) => render(<svg>{node}</svg>);

describe('Shape', () => {
  it('renders a group carrying the shape id', () => {
    const shape = {
      id: 'abc', kind: 'shape', shapeType: 'circle',
      x: 10, y: 20, color: '#123456', rotation: 0, size: 40, note: 440, vx: 0, vy: 0,
    };
    const { container } = wrap(<Shape shape={shape} pulsing={false} />);
    const g = container.querySelector('[data-id="abc"]');
    expect(g).toBeTruthy();
    expect(container.querySelector('circle')).toBeTruthy();
  });

  it('renders a rect for a square shape', () => {
    const shape = {
      id: 's', kind: 'shape', shapeType: 'square',
      x: 0, y: 0, color: '#000', rotation: 0, size: 20, note: 440, vx: 0, vy: 0,
    };
    const { container } = wrap(<Shape shape={shape} pulsing={false} />);
    expect(container.querySelector('rect')).toBeTruthy();
  });
});

describe('Stroke', () => {
  it('renders a polyline from points', () => {
    const stroke = { id: 'k', kind: 'stroke', color: '#f00', points: [{ x: 0, y: 0 }, { x: 5, y: 5 }] };
    const { container } = wrap(<Stroke stroke={stroke} />);
    const line = container.querySelector('polyline');
    expect(line).toBeTruthy();
    expect(line.getAttribute('points')).toBe('0,0 5,5');
  });
});
