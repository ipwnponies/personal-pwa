import { useCallback, useRef, useState } from 'react';
import { clamp } from './random';

const SWIPE_THRESHOLD = 10;
const PIXELS_PER_STEP = 20;

// eslint-disable-next-line import/prefer-default-export
export function useSwipeNumber(value, onChange, min, max, step = 1) {
  const [editValue, setEditValue] = useState(null);
  const [savedValue, setSavedValue] = useState(null);
  const touchRef = useRef(null);
  const accumulatedRef = useRef(0);

  const isEditing = editValue !== null;

  const handleFocus = useCallback(() => {
    setSavedValue(value);
    setEditValue('');
  }, [value]);

  const handleBlur = useCallback(() => {
    if (editValue === '' || editValue === null) {
      onChange(savedValue);
    } else {
      const parsed = parseInt(editValue, 10);
      onChange(Number.isNaN(parsed) ? savedValue : clamp(parsed, min, max));
    }
    setEditValue(null);
    setSavedValue(null);
  }, [editValue, savedValue, onChange, min, max]);

  const handleChange = useCallback((e) => {
    setEditValue(e.target.value);
  }, []);

  const handleTouchStart = useCallback((e) => {
    touchRef.current = { startY: e.touches[0].clientY, swiping: false };
    accumulatedRef.current = 0;
  }, []);

  const handleTouchMove = useCallback(
    (e) => {
      if (!touchRef.current) return;
      const deltaY = touchRef.current.startY - e.touches[0].clientY;
      if (!touchRef.current.swiping && Math.abs(deltaY) > SWIPE_THRESHOLD) {
        touchRef.current.swiping = true;
        e.target.blur();
      }
      if (touchRef.current.swiping) {
        e.preventDefault();
        e.stopPropagation();
        const steps = Math.trunc(deltaY / PIXELS_PER_STEP);
        const delta = (steps - accumulatedRef.current) * step;
        if (delta !== 0) {
          accumulatedRef.current = steps;
          onChange((prev) => clamp(prev + delta, min, max));
        }
      }
    },
    [min, max, step, onChange],
  );

  const handleTouchEnd = useCallback(() => {
    touchRef.current = null;
  }, []);

  return {
    inputValue: isEditing ? editValue : value,
    placeholder: isEditing ? String(savedValue) : undefined,
    onChange: handleChange,
    onFocus: handleFocus,
    onBlur: handleBlur,
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
  };
}
