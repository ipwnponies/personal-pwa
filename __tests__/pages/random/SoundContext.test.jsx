import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SoundProvider, SoundToggle, useSoundCue } from '../../../pages/random/SoundContext';

const STORAGE_KEY = 'random-sound-on';

const renderToggle = () =>
  render(
    <SoundProvider>
      <SoundToggle />
    </SoundProvider>,
  );

// Stand-in for lib/randomSound's real factory so tests can assert on the
// underlying instance's play()/setEnabled() without touching WebAudio.
const mockSetEnabled = vi.hoisted(() => vi.fn());
const mockSoundPlay = vi.hoisted(() => vi.fn());

vi.mock('../../../lib/randomSound', () => ({
  createRandomSound: () => ({ play: mockSoundPlay, setEnabled: mockSetEnabled }),
}));

function Player() {
  const play = useSoundCue();
  return (
    <button type="button" onClick={() => play('roll')}>
      Play
    </button>
  );
}

describe('SoundContext', () => {
  beforeEach(() => {
    localStorage.clear();
    mockSetEnabled.mockClear();
    mockSoundPlay.mockClear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('renders the toggle on (aria-pressed true) by default', () => {
    renderToggle();
    const toggle = screen.getByRole('button', { name: 'Sound on' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });

  it('clicking flips the toggle and writes false to localStorage', () => {
    renderToggle();
    const toggle = screen.getByRole('button', { name: 'Sound on' });
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Sound off' })).toHaveAttribute('aria-pressed', 'false');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('false');
  });

  it('renders muted after mount when localStorage was pre-seeded false', () => {
    localStorage.setItem(STORAGE_KEY, 'false');
    renderToggle();
    expect(screen.getByRole('button', { name: 'Sound off' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('still renders on when localStorage throws on read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    renderToggle();
    expect(screen.getByRole('button', { name: 'Sound on' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('useSoundCue()\'s play() reaches the underlying sound instance', () => {
    render(
      <SoundProvider>
        <Player />
      </SoundProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(mockSoundPlay).toHaveBeenCalledWith('roll');
  });

  it('calls setEnabled(false) on the underlying sound instance when toggled off', () => {
    renderToggle();
    fireEvent.click(screen.getByRole('button', { name: 'Sound on' }));
    expect(mockSetEnabled).toHaveBeenCalledWith(false);
  });

  it('calls setEnabled(false) on the underlying sound instance when hydrating a stored false', () => {
    localStorage.setItem(STORAGE_KEY, 'false');
    renderToggle();
    expect(mockSetEnabled).toHaveBeenCalledWith(false);
  });

  // Regression test: toggle() used to read `soundOn` from render scope, so
  // two toggle clicks processed in the same React batch both computed the
  // same `next` value instead of alternating, leaving the state flipped
  // once instead of net-unchanged.
  it('two toggles processed in the same batch still alternate back to on', () => {
    renderToggle();
    const toggle = screen.getByRole('button', { name: 'Sound on' });
    act(() => {
      toggle.click();
      toggle.click();
    });
    expect(screen.getByRole('button', { name: 'Sound on' })).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
  });
});
