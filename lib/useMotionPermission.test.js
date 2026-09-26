import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  useMotionPermission,
  motionPermissionRequesters,
  PERMISSION_NEEDED,
  PERMISSION_NOT_NEEDED,
  PERMISSION_GRANTED,
  PERMISSION_DENIED,
} from './useMotionPermission';

const stubGates = ({ motion, orientation }) => {
  if (motion) vi.stubGlobal('DeviceMotionEvent', { requestPermission: motion });
  if (orientation) vi.stubGlobal('DeviceOrientationEvent', { requestPermission: orientation });
};

describe('useMotionPermission', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('motionPermissionRequesters finds nothing when neither API gates permission', () => {
    expect(motionPermissionRequesters()).toHaveLength(0);
  });

  it('motionPermissionRequesters finds both gated APIs', () => {
    stubGates({ motion: vi.fn(), orientation: vi.fn() });
    expect(motionPermissionRequesters()).toHaveLength(2);
  });

  it('settles on not-needed when no API gates permission', () => {
    const { result } = renderHook(() => useMotionPermission());
    expect(result.current.status).toBe(PERMISSION_NOT_NEEDED);
    expect(result.current.motionEnabled).toBe(true);
  });

  it('settles on needed when an API gates permission, and motion stays disabled', () => {
    stubGates({ motion: vi.fn().mockResolvedValue('granted') });
    const { result } = renderHook(() => useMotionPermission());
    expect(result.current.status).toBe(PERMISSION_NEEDED);
    expect(result.current.motionEnabled).toBe(false);
  });

  it('request calls every gated API and reports granted when all allow', async () => {
    const motion = vi.fn().mockResolvedValue('granted');
    const orientation = vi.fn().mockResolvedValue('granted');
    stubGates({ motion, orientation });
    const { result } = renderHook(() => useMotionPermission());
    await act(async () => { await result.current.request(); });
    expect(motion).toHaveBeenCalledTimes(1);
    expect(orientation).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe(PERMISSION_GRANTED);
    expect(result.current.motionEnabled).toBe(true);
  });

  it('reports denied when any gated API refuses', async () => {
    stubGates({
      motion: vi.fn().mockResolvedValue('granted'),
      orientation: vi.fn().mockResolvedValue('denied'),
    });
    const { result } = renderHook(() => useMotionPermission());
    await act(async () => { await result.current.request(); });
    expect(result.current.status).toBe(PERMISSION_DENIED);
    expect(result.current.motionEnabled).toBe(false);
  });

  it('reports denied when a gated API throws', async () => {
    stubGates({ motion: vi.fn().mockRejectedValue(new Error('no user gesture')) });
    const { result } = renderHook(() => useMotionPermission());
    await act(async () => { await result.current.request(); });
    expect(result.current.status).toBe(PERMISSION_DENIED);
  });

  it('request is a no-op that reports not-needed when nothing gates permission', async () => {
    const { result } = renderHook(() => useMotionPermission());
    let outcome;
    await act(async () => { outcome = await result.current.request(); });
    expect(outcome).toBe(PERMISSION_NOT_NEEDED);
  });
});
