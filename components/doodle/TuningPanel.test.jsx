import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import TuningPanel from './TuningPanel';

const baseTuning = {
  maxParticles: 150,
  dustMaxAge: 0.3,
  dustFrameInterval: 3,
  driftMin: 18,
  driftMax: 18,
  maxThrowSpeed: 600,
  wallRestitution: 0.9,
  stuckAfterS: 1,
  wallImmunityS: 1.5,
  shakeImpulse: 260,
  maxSpeed: 600,
  tiltStrength: 400,
  tiltDamping: 1.2,
};

describe('TuningPanel', () => {
  it('renders a number input for every tuning field with its current value', () => {
    const { getByLabelText } = render(
      <TuningPanel tuning={baseTuning} onChange={() => {}} onReset={() => {}} onClose={() => {}} />,
    );
    expect(getByLabelText('Max particles').value).toBe('150');
    expect(getByLabelText('Dust max age (s)').value).toBe('0.3');
    expect(getByLabelText('Dust every Nth frame').value).toBe('3');
    expect(getByLabelText('Drift speed min (px/s)').value).toBe('18');
    expect(getByLabelText('Drift speed max (px/s)').value).toBe('18');
    expect(getByLabelText('Max throw speed (px/s)').value).toBe('600');
    expect(getByLabelText('Wall bounciness').value).toBe('0.9');
    expect(getByLabelText('Stuck after (s)').value).toBe('1');
    expect(getByLabelText('Wall immunity (s)').value).toBe('1.5');
  });

  it('calls onChange with the field key and numeric value when an input changes', () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <TuningPanel tuning={baseTuning} onChange={onChange} onReset={() => {}} onClose={() => {}} />,
    );
    fireEvent.change(getByLabelText('Max particles'), { target: { value: '300' } });
    expect(onChange).toHaveBeenCalledWith('maxParticles', 300);
  });

  it('calls onReset when the reset button is clicked', () => {
    const onReset = vi.fn();
    const { getByText } = render(
      <TuningPanel tuning={baseTuning} onChange={() => {}} onReset={onReset} onClose={() => {}} />,
    );
    fireEvent.click(getByText('Reset to defaults'));
    expect(onReset).toHaveBeenCalled();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    const { getByLabelText } = render(
      <TuningPanel tuning={baseTuning} onChange={() => {}} onReset={() => {}} onClose={onClose} />,
    );
    fireEvent.click(getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders the shake tuning fields', () => {
    const { getByLabelText } = render(
      <TuningPanel tuning={baseTuning} onChange={() => {}} onReset={() => {}} onClose={() => {}} />,
    );
    expect(getByLabelText('Shake impulse (px/s)').value).toBe('260');
    expect(getByLabelText('Max shape speed (px/s)').value).toBe('600');
  });

  it('calls onChange for the shake impulse field', () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <TuningPanel tuning={baseTuning} onChange={onChange} onReset={() => {}} onClose={() => {}} />,
    );
    fireEvent.change(getByLabelText('Shake impulse (px/s)'), { target: { value: '400' } });
    expect(onChange).toHaveBeenCalledWith('shakeImpulse', 400);
  });

  it('renders the tilt tuning fields', () => {
    const { getByLabelText } = render(
      <TuningPanel tuning={baseTuning} onChange={() => {}} onReset={() => {}} onClose={() => {}} />,
    );
    expect(getByLabelText('Tilt strength (px/s²)').value).toBe('400');
    expect(getByLabelText('Tilt damping (1/s)').value).toBe('1.2');
  });

  it('calls onChange for the tilt strength field', () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <TuningPanel tuning={baseTuning} onChange={onChange} onReset={() => {}} onClose={() => {}} />,
    );
    fireEvent.change(getByLabelText('Tilt strength (px/s²)'), { target: { value: '800' } });
    expect(onChange).toHaveBeenCalledWith('tiltStrength', 800);
  });
});
