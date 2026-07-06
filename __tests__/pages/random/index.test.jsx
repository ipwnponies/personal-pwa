import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import Random from '../../../pages/random/index';
import { pwaMetaTags } from '../../../components/layout';

vi.mock('next/router', () => ({
  useRouter: () => ({ basePath: '/base' }),
}));

vi.mock('../../../components/layout', () => ({
  pwaMetaTags: vi.fn(() => null),
}));

describe('Random page head', () => {
  it('calls pwaMetaTags with the router basePath and default (root) options', () => {
    render(<Random />);
    expect(pwaMetaTags).toHaveBeenCalledWith('/base');
  });
});
