import { describe, it, expect } from 'vitest';
import {
  spawnBurst, spawnSpiral, spawnSquashPoof, spawnDust, advanceParticles, MAX_PARTICLES,
} from './doodleParticles';

describe('doodleParticles', () => {
  it('spawnBurst creates 8 particles at the given point', () => {
    const particles = spawnBurst(10, 20, '#e63946');
    expect(particles).toHaveLength(8);
    particles.forEach((p) => {
      expect(p.kind).toBe('burst');
      expect(p.x).toBe(10);
      expect(p.y).toBe(20);
      expect(p.color).toBe('#e63946');
      expect(p.age).toBe(0);
      expect(p.maxAge).toBeGreaterThan(0);
      expect(p.id).toBeTruthy();
    });
  });

  it('spawnBurst with normal vector spreads into a cone', () => {
    const normal = { x: 1, y: 0 };
    const particles = spawnBurst(10, 20, '#e63946', normal);
    expect(particles).toHaveLength(8);
    const normalAngle = Math.atan2(normal.y, normal.x); // 0
    const coneHalfSpread = (Math.PI / 1.5) / 2; // ±60 degrees
    particles.forEach((p) => {
      const particleAngle = Math.atan2(p.vy, p.vx);
      const angleDiff = Math.abs(particleAngle - normalAngle);
      // Account for angle wrapping (particles at cone edges might be ~pi apart)
      const wrappedDiff = Math.min(angleDiff, 2 * Math.PI - angleDiff);
      expect(wrappedDiff).toBeLessThanOrEqual(coneHalfSpread + 0.01); // small tolerance
    });
    // First and last particles should be at roughly opposite cone edges
    const firstAngle = Math.atan2(particles[0].vy, particles[0].vx);
    const lastAngle = Math.atan2(particles[7].vy, particles[7].vx);
    const edgeDiff = Math.abs(firstAngle - lastAngle);
    expect(edgeDiff).toBeGreaterThan(0.5); // real spread, not identical
  });

  it('spawnSpiral creates 10 particles biased toward the target', () => {
    const particles = spawnSpiral(0, 0, 100, 0, '#457b9d');
    expect(particles).toHaveLength(10);
    particles.forEach((p) => {
      expect(p.kind).toBe('spiral');
      expect(p.color).toBe('#457b9d');
      expect(p.vx).toBeGreaterThan(0); // net drift toward the target (+x)
    });
    // Verify particles start clustered near origin (fromPoint)
    particles.forEach((p) => {
      expect(Math.hypot(p.x, p.y)).toBeLessThan(20); // close to origin
    });
    // For a target on +x axis, tangent is (0, ±1), so vy should come purely from tangential drift
    // Odd indices have tangentialSign=-1, even have tangentialSign=+1
    particles.forEach((p, i) => {
      expect(p.vy).not.toBe(0); // tangential contribution is nonzero
      const expectedVySign = i % 2 === 0 ? 1 : -1;
      expect(Math.sign(p.vy)).toBe(expectedVySign);
    });
  });

  it('spawnSquashPoof creates 5 small particles', () => {
    const particles = spawnSquashPoof(5, 5, '#f4a261');
    expect(particles).toHaveLength(5);
    particles.forEach((p) => expect(p.kind).toBe('squash'));
  });

  it('spawnDust creates 2 particles drifting opposite the motion vector', () => {
    const particles = spawnDust(0, 0, 10, 0, '#2a9d8f');
    expect(particles).toHaveLength(2);
    particles.forEach((p) => {
      expect(p.kind).toBe('dust');
      expect(p.vx).toBeLessThan(0); // drifts backward relative to +x motion
    });
  });

  it('advanceParticles moves particles and ages them', () => {
    const particles = [{
      id: '1', kind: 'dust', x: 0, y: 0, vx: 10, vy: 0, color: '#000', age: 0, maxAge: 1,
    }];
    const next = advanceParticles(particles, 0.5);
    expect(next).toHaveLength(1);
    expect(next[0].x).toBeCloseTo(5);
    expect(next[0].age).toBeCloseTo(0.5);
  });

  it('advanceParticles removes particles once they exceed maxAge', () => {
    const particles = [{
      id: '1', kind: 'dust', x: 0, y: 0, vx: 0, vy: 0, color: '#000', age: 0.9, maxAge: 1,
    }];
    const next = advanceParticles(particles, 0.2);
    expect(next).toHaveLength(0);
  });

  it('advanceParticles caps the array at MAX_PARTICLES, dropping the oldest first', () => {
    const particles = Array.from({ length: MAX_PARTICLES + 10 }, (_, i) => ({
      id: `p${i}`, kind: 'dust', x: 0, y: 0, vx: 0, vy: 0, color: '#000', age: 0, maxAge: 10,
    }));
    const next = advanceParticles(particles, 0.01);
    expect(next).toHaveLength(MAX_PARTICLES);
    expect(next[0].id).toBe('p10'); // the first 10 (oldest) were dropped
  });
});
