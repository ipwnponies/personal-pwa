import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import HistoryList from './HistoryList';

describe('HistoryList', () => {
  it('renders the title and one row per entry', () => {
    render(
      <HistoryList
        title="Recent rolls"
        entries={[
          { id: 'b', label: '1d6 (1-6): 4', timestamp: 2000 },
          { id: 'a', label: '1d6 (1-6): 2', timestamp: 1000 },
        ]}
      />,
    );

    expect(screen.getByText('Recent rolls')).toBeInTheDocument();
    expect(screen.getByText('1d6 (1-6): 4')).toBeInTheDocument();
    expect(screen.getByText('1d6 (1-6): 2')).toBeInTheDocument();
  });

  it('renders nothing when there are no entries', () => {
    const { container } = render(<HistoryList title="Recent rolls" entries={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
