import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DoodlePage from '../../../pages/doodle/index';

vi.mock('next/router', () => ({
  useRouter: () => ({ basePath: '' }),
}));

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

describe('DoodlePage', () => {
  it('renders the doodle canvas', () => {
    render(<DoodlePage />);
    expect(screen.getByLabelText('Doodle canvas')).toBeInTheDocument();
    expect(screen.getByLabelText('Clear canvas')).toBeInTheDocument();
  });
});
