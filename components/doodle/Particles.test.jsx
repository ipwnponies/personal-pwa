import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import Particles from './Particles';

const wrap = (node) => render(<svg>{node}</svg>);

describe('Particles', () => {
  it('renders burst particles as lines', () => {
    const particles = [{
      id: 'a', kind: 'burst', x: 0, y: 0, vx: 10, vy: 0, color: '#e63946', age: 0, maxAge: 0.15,
    }];
    const { container } = wrap(<Particles particles={particles} />);
    expect(container.querySelectorAll('line')).toHaveLength(1);
    expect(container.querySelectorAll('circle[cx]')).toHaveLength(0);
  });

  it('renders dust/spiral/squash particles as circles with cx/cy', () => {
    const particles = [
      {
        id: 'a', kind: 'dust', x: 1, y: 2, vx: 0, vy: 0, color: '#e63946', age: 0, maxAge: 0.3,
      },
      {
        id: 'b', kind: 'spiral', x: 3, y: 4, vx: 0, vy: 0, color: '#e63946', age: 0, maxAge: 0.2,
      },
      {
        id: 'c', kind: 'squash', x: 5, y: 6, vx: 0, vy: 0, color: '#e63946', age: 0, maxAge: 0.1,
      },
    ];
    const { container } = wrap(<Particles particles={particles} />);
    expect(container.querySelectorAll('circle[cx]')).toHaveLength(3);
    expect(container.querySelectorAll('line')).toHaveLength(0);
  });

  it('fades particles out as they age', () => {
    const particles = [{
      id: 'a', kind: 'dust', x: 0, y: 0, vx: 0, vy: 0, color: '#e63946', age: 0.15, maxAge: 0.3,
    }];
    const { container } = wrap(<Particles particles={particles} />);
    const circle = container.querySelector('circle[cx]');
    expect(Number(circle.getAttribute('opacity'))).toBeCloseTo(0.5);
  });
});
