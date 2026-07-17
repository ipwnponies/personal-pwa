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
  const snappedRef = useRef(false);

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

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.target.blur();
  }, []);

  const handleTouchStart = useCallback((e) => {
    touchRef.current = { startY: e.touches[0].clientY, swiping: false };
    accumulatedRef.current = 0;
    snappedRef.current = false;
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
        const units = steps - accumulatedRef.current;
        if (units !== 0) {
          accumulatedRef.current = steps;
          const alreadySnapped = snappedRef.current;
          snappedRef.current = true;
          const dir = units > 0 ? 1 : -1;
          onChange((prev) => {
            let newValue = prev;
            let remainingUnits = units;
            // First step of a swipe snaps to the nearest step boundary in the
            // swipe direction, rather than jumping a full `step` from an
            // off-grid value (e.g. 152 -> 155, not 152 -> 157).
            if (!alreadySnapped) {
              const snapTarget =
                dir > 0 ? Math.ceil(prev / step) * step : Math.floor(prev / step) * step;
              newValue = snapTarget === prev ? prev + dir * step : snapTarget;
              remainingUnits -= dir;
            }
            newValue += remainingUnits * step;
            return clamp(newValue, min, max);
          });
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
    onKeyDown: handleKeyDown,
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
  };
}
