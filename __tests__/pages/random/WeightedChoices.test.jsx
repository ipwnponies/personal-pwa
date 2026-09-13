import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import WeightedChoices, { RowPointerSensor } from '../../../pages/random/WeightedChoices';

describe('WeightedChoices grouped structure', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('Migration', () => {
    it('migrates old flat array to grouped structure on load', async () => {
      const oldChoices = [
        { id: 'old1', label: 'Choice A', weight: 2 },
        { id: 'old2', label: 'Choice B', weight: 3 },
      ];
      localStorage.setItem('random-choices', JSON.stringify(oldChoices));

      render(<WeightedChoices />);

      expect(screen.getByDisplayValue('Choice A')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Choice B')).toBeInTheDocument();

      await waitFor(() => {
        const saved = JSON.parse(localStorage.getItem('random-choices'));
        expect(Array.isArray(saved)).toBe(true);
        expect(saved[0]).toHaveProperty('name');
        expect(saved[0]).toHaveProperty('choices');
        expect(saved[0].choices).toHaveLength(2);
        expect(saved[0].choices[0].label).toBe('Choice A');
      });
    });

    it('migrates an emptied-out old flat array ("[]") into a default group', async () => {
      localStorage.setItem('random-choices', JSON.stringify([]));

      render(<WeightedChoices />);

      const addChoiceInputs = screen.getAllByPlaceholderText('Add choice...');
      expect(addChoiceInputs.length).toBeGreaterThan(0);

      await waitFor(() => {
        const saved = JSON.parse(localStorage.getItem('random-choices'));
        expect(saved).toHaveLength(1);
        expect(saved[0]).toHaveProperty('name');
        expect(saved[0].choices).toEqual([]);
      });
    });
  });

  describe('Fresh/empty state', () => {
    it('starts with a sensible default group when localStorage is empty', async () => {
      render(<WeightedChoices />);

      const addChoiceInputs = screen.getAllByPlaceholderText('Add choice...');
      expect(addChoiceInputs.length).toBeGreaterThan(0);

      await waitFor(() => {
        const saved = JSON.parse(localStorage.getItem('random-choices'));
        expect(Array.isArray(saved)).toBe(true);
        expect(saved[0]).toHaveProperty('name');
        expect(saved[0]).toHaveProperty('choices');
      });
    });
  });

  describe('Group management', () => {
    it('adds a new group via ghost input', async () => {
      render(<WeightedChoices />);

      const ghostGroupInput = screen.getByPlaceholderText('Add group...');
      fireEvent.change(ghostGroupInput, { target: { value: 'New Group' } });
      fireEvent.blur(ghostGroupInput);

      await waitFor(() => {
        const saved = JSON.parse(localStorage.getItem('random-choices'));
        expect(saved.length).toBeGreaterThan(1);
      });

      expect(screen.getByText('New Group')).toBeInTheDocument();
    });

    it('renames a group via inline edit', async () => {
      const groupsData = [{ id: 'g1', name: 'First Group', choices: [] }];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));

      render(<WeightedChoices />);

      const groupNameDisplay = screen.getByText('First Group');
      fireEvent.click(groupNameDisplay);

      const groupNameInput = screen.getByDisplayValue('First Group');
      fireEvent.change(groupNameInput, { target: { value: 'Renamed Group' } });
      fireEvent.blur(groupNameInput);

      await waitFor(() => {
        const saved = JSON.parse(localStorage.getItem('random-choices'));
        expect(saved[0].name).toBe('Renamed Group');
      });
    });

    it('deletes a group and does not crash', async () => {
      const groupsData = [
        { id: 'g1', name: 'First Group', choices: [{ id: 'c1', label: 'Choice 1', weight: 1 }] },
        { id: 'g2', name: 'Second Group', choices: [] },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));

      render(<WeightedChoices />);

      const deleteButtons = screen.getAllByText('×');
      expect(deleteButtons.length).toBeGreaterThan(0);

      fireEvent.click(deleteButtons[0]);

      await waitFor(() => {
        const saved = JSON.parse(localStorage.getItem('random-choices'));
        expect(saved.length).toBe(1);
        expect(saved[0].name).toBe('Second Group');
      });
    });

    it('keeps the replacement default group expanded after deleting the last remaining group', async () => {
      const groupsData = [
        { id: 'g1', name: 'Only Group', choices: [{ id: 'c1', label: 'Choice 1', weight: 1 }] },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));

      render(<WeightedChoices />);

      const deleteButtons = screen.getAllByText('×');
      fireEvent.click(deleteButtons[0]);

      await waitFor(() => {
        const saved = JSON.parse(localStorage.getItem('random-choices'));
        expect(saved).toHaveLength(1);
        expect(saved[0].name).toBe('Default');
      });

      expect(screen.getAllByPlaceholderText('Add choice...').length).toBeGreaterThan(0);
    });
  });

  describe('Undo toast', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('shows an undo toast after deleting a choice', async () => {
      const groupsData = [
        {
          id: 'g1',
          name: 'Test Group',
          choices: [
            { id: 'c1', label: 'Choice 1', weight: 1 },
            { id: 'c2', label: 'Choice 2', weight: 1 },
          ],
        },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));

      render(<WeightedChoices />);

      await waitFor(() => expect(screen.getByDisplayValue('Choice 1')).toBeInTheDocument());

      const deleteButtons = screen.getAllByText('×');
      fireEvent.click(deleteButtons[1]);

      expect(screen.getByText('Choice deleted')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    });

    it('restores a deleted choice at its original index when Undo is clicked', async () => {
      const groupsData = [
        {
          id: 'g1',
          name: 'Test Group',
          choices: [
            { id: 'c1', label: 'Choice 1', weight: 1 },
            { id: 'c2', label: 'Choice 2', weight: 1 },
            { id: 'c3', label: 'Choice 3', weight: 1 },
          ],
        },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));

      render(<WeightedChoices />);

      await waitFor(() => expect(screen.getByDisplayValue('Choice 2')).toBeInTheDocument());

      // Delete the middle choice
      const deleteButtons = screen.getAllByText('×');
      fireEvent.click(deleteButtons[2]);

      await waitFor(() => {
        const saved = JSON.parse(localStorage.getItem('random-choices'));
        expect(saved[0].choices.map((c) => c.label)).toEqual(['Choice 1', 'Choice 3']);
      });

      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

      await waitFor(() => {
        const saved = JSON.parse(localStorage.getItem('random-choices'));
        expect(saved[0].choices.map((c) => c.label)).toEqual(['Choice 1', 'Choice 2', 'Choice 3']);
      });
    });

    it('dismisses the undo toast automatically after a few seconds', async () => {
      vi.useFakeTimers();
      const groupsData = [
        {
          id: 'g1',
          name: 'Test Group',
          choices: [
            { id: 'c1', label: 'Choice 1', weight: 1 },
            { id: 'c2', label: 'Choice 2', weight: 1 },
          ],
        },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));

      render(<WeightedChoices />);
      const deleteButtons = screen.getAllByText('×');
      fireEvent.click(deleteButtons[1]);

      expect(screen.getByText('Choice deleted')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(screen.queryByText('Choice deleted')).not.toBeInTheDocument();
    });

    it('shows an undo toast after deleting a group and restores it, re-expanded, on Undo', async () => {
      const groupsData = [
        { id: 'g1', name: 'First Group', choices: [{ id: 'c1', label: 'Choice 1', weight: 1 }] },
        { id: 'g2', name: 'Second Group', choices: [] },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));

      render(<WeightedChoices />);

      const deleteButtons = screen.getAllByText('×');
      fireEvent.click(deleteButtons[0]);

      expect(screen.getByText('Group deleted')).toBeInTheDocument();

      await waitFor(() => {
        const saved = JSON.parse(localStorage.getItem('random-choices'));
        expect(saved.map((g) => g.name)).toEqual(['Second Group']);
      });

      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

      await waitFor(() => {
        const saved = JSON.parse(localStorage.getItem('random-choices'));
        expect(saved.map((g) => g.name)).toEqual(['First Group', 'Second Group']);
      });

      // Restored group should be expanded again (its choice is visible)
      expect(screen.getByDisplayValue('Choice 1')).toBeInTheDocument();
    });

    it('undoing the deletion of a non-expanded group does not disturb the expanded group', async () => {
      const groupsData = [
        {
          id: 'g1',
          name: 'Group A',
          choices: [
            { id: 'c1', label: 'Choice A1', weight: 1 },
            { id: 'c2', label: 'Choice A2', weight: 1 },
          ],
        },
        { id: 'g2', name: 'Group B', choices: [] },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));

      render(<WeightedChoices />);

      // Group A is expanded by default; pick a result in it.
      fireEvent.click(screen.getByRole('button', { name: /PICK/i }));
      await waitFor(() => {
        expect(screen.getAllByText(/Choice A[12]/).length).toBeGreaterThan(0);
      });

      // Delete the collapsed Group B, then undo it.
      fireEvent.click(screen.getAllByLabelText('Delete group')[1]);
      expect(screen.getByText('Group deleted')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

      await waitFor(() => {
        const saved = JSON.parse(localStorage.getItem('random-choices'));
        expect(saved.map((g) => g.name)).toEqual(['Group A', 'Group B']);
      });

      // Group A must still be expanded with its result intact.
      expect(screen.getByDisplayValue('Choice A1')).toBeInTheDocument();
      expect(screen.getAllByText(/Choice A[12]/).length).toBeGreaterThan(0);
      expect(screen.getByText(/% chance/)).toBeInTheDocument();
    });

    it('replaces the toast on a new delete, leaving the earlier deletion non-undoable', async () => {
      const groupsData = [
        {
          id: 'g1',
          name: 'Test Group',
          choices: [
            { id: 'c1', label: 'Choice 1', weight: 1 },
            { id: 'c2', label: 'Choice 2', weight: 1 },
            { id: 'c3', label: 'Choice 3', weight: 1 },
          ],
        },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));

      render(<WeightedChoices />);

      await waitFor(() => expect(screen.getByDisplayValue('Choice 1')).toBeInTheDocument());

      let deleteButtons = screen.getAllByText('×');
      fireEvent.click(deleteButtons[1]); // delete Choice 1

      await waitFor(() => {
        const saved = JSON.parse(localStorage.getItem('random-choices'));
        expect(saved[0].choices.map((c) => c.label)).toEqual(['Choice 2', 'Choice 3']);
      });

      deleteButtons = screen.getAllByText('×');
      fireEvent.click(deleteButtons[1]); // delete Choice 2 while toast for Choice 1 is showing

      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

      await waitFor(() => {
        const saved = JSON.parse(localStorage.getItem('random-choices'));
        // Choice 2 restored, Choice 1 stays gone
        expect(saved[0].choices.map((c) => c.label)).toEqual(['Choice 2', 'Choice 3']);
      });
    });

    it('undoing the deletion of the last remaining group removes the auto-created replacement', async () => {
      const groupsData = [
        { id: 'g1', name: 'Only Group', choices: [{ id: 'c1', label: 'Choice 1', weight: 1 }] },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));

      render(<WeightedChoices />);

      fireEvent.click(screen.getAllByText('×')[0]);

      await waitFor(() => {
        const saved = JSON.parse(localStorage.getItem('random-choices'));
        expect(saved).toHaveLength(1);
        expect(saved[0].name).toBe('Default');
      });

      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

      await waitFor(() => {
        const saved = JSON.parse(localStorage.getItem('random-choices'));
        expect(saved).toHaveLength(1);
        expect(saved[0].name).toBe('Only Group');
        expect(saved[0].choices[0].label).toBe('Choice 1');
      });
    });
  });

  describe('Accordion behavior', () => {
    it('expands one group and collapses the previous one', async () => {
      const groupsData = [
        { id: 'g1', name: 'Group A', choices: [{ id: 'c1', label: 'Choice A', weight: 1 }] },
        { id: 'g2', name: 'Group B', choices: [{ id: 'c2', label: 'Choice B', weight: 1 }] },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));

      render(<WeightedChoices />);

      expect(screen.getByDisplayValue('Choice A')).toBeInTheDocument();

      const expandButtons = screen.getAllByLabelText(/Expand group|Expanded/);
      expect(expandButtons.length).toBeGreaterThanOrEqual(2);

      fireEvent.click(expandButtons[1]);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Choice B')).toBeInTheDocument();
      });
    });
  });

  describe('Per-group choice operations', () => {
    it('adds a choice to the expanded group', async () => {
      const groupsData = [{ id: 'g1', name: 'Test Group', choices: [] }];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));

      render(<WeightedChoices />);

      const addChoiceInput = screen.getByPlaceholderText('Add choice...');
      fireEvent.change(addChoiceInput, { target: { value: 'New Choice' } });
      fireEvent.blur(addChoiceInput);

      await waitFor(() => {
        const saved = JSON.parse(localStorage.getItem('random-choices'));
        expect(saved[0].choices.length).toBeGreaterThan(0);
        expect(saved[0].choices[0].label).toBe('New Choice');
      });
    });

    it('edits a choice label in the expanded group', async () => {
      const groupsData = [
        { id: 'g1', name: 'Test Group', choices: [{ id: 'c1', label: 'Original', weight: 1 }] },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));

      render(<WeightedChoices />);

      const input = screen.getByDisplayValue('Original');
      fireEvent.change(input, { target: { value: 'Updated' } });
      fireEvent.blur(input);

      await waitFor(() => {
        const saved = JSON.parse(localStorage.getItem('random-choices'));
        expect(saved[0].choices[0].label).toBe('Updated');
      });
    });

    it('deletes a choice from the expanded group', async () => {
      const groupsData = [
        {
          id: 'g1',
          name: 'Test Group',
          choices: [
            { id: 'c1', label: 'Choice 1', weight: 1 },
            { id: 'c2', label: 'Choice 2', weight: 1 },
          ],
        },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));

      render(<WeightedChoices />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Choice 1')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Choice 2')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByText('×');
      fireEvent.click(deleteButtons[1]);

      await waitFor(() => {
        const saved = JSON.parse(localStorage.getItem('random-choices'));
        expect(saved[0].choices.length).toBe(1);
        expect(saved[0].choices[0].label).toBe('Choice 2');
      });
    });

    it('PICK button is disabled when fewer than 2 valid choices', async () => {
      const groupsData = [
        { id: 'g1', name: 'Test Group', choices: [{ id: 'c1', label: 'Only Choice', weight: 1 }] },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));

      render(<WeightedChoices />);

      const pickButton = screen.getByRole('button', { name: /PICK/i });
      expect(pickButton).toBeDisabled();
    });

    it('PICK button is enabled when 2+ valid choices exist', async () => {
      const groupsData = [
        {
          id: 'g1',
          name: 'Test Group',
          choices: [
            { id: 'c1', label: 'Choice A', weight: 1 },
            { id: 'c2', label: 'Choice B', weight: 1 },
          ],
        },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));

      render(<WeightedChoices />);

      const pickButton = screen.getByRole('button', { name: /PICK/i });
      expect(pickButton).not.toBeDisabled();
    });

    it('PICK returns a result matching one of the valid choice labels', async () => {
      const groupsData = [
        {
          id: 'g1',
          name: 'Test Group',
          choices: [
            { id: 'c1', label: 'First', weight: 1 },
            { id: 'c2', label: 'Second', weight: 1 },
          ],
        },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));

      render(<WeightedChoices />);

      const pickButton = screen.getByRole('button', { name: /PICK/i });
      fireEvent.click(pickButton);

      await waitFor(() => {
        expect(screen.getAllByText(/First|Second/).length).toBeGreaterThan(0);
      });
    });

    it('records a history entry on PICK, persisted under its own storage key', async () => {
      const groupsData = [
        {
          id: 'g1',
          name: 'Test Group',
          choices: [
            { id: 'c1', label: 'First', weight: 1 },
            { id: 'c2', label: 'Second', weight: 1 },
          ],
        },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));

      render(<WeightedChoices />);

      const pickButton = screen.getByRole('button', { name: /PICK/i });
      fireEvent.click(pickButton);

      await waitFor(() => {
        expect(screen.getAllByText(/First|Second/).length).toBeGreaterThan(0);
      });

      await waitFor(() => {
        const savedHistory = JSON.parse(localStorage.getItem('random-choices-history'));
        expect(savedHistory.g1).toHaveLength(1);
        expect(['First', 'Second']).toContain(savedHistory.g1[0].label);
        expect(savedHistory.g1[0]).toHaveProperty('timestamp');
      });

      expect(localStorage.getItem('random-choices')).not.toContain('history');
    });

    it('shows only the expanded group history when switching groups', async () => {
      const groupsData = [
        {
          id: 'g1',
          name: 'Group A',
          choices: [
            { id: 'c1', label: 'Choice A1', weight: 1 },
            { id: 'c2', label: 'Choice A2', weight: 1 },
          ],
        },
        {
          id: 'g2',
          name: 'Group B',
          choices: [
            { id: 'c3', label: 'Choice B1', weight: 1 },
            { id: 'c4', label: 'Choice B2', weight: 1 },
          ],
        },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));

      render(<WeightedChoices />);

      fireEvent.click(screen.getByRole('button', { name: /PICK/i }));

      await waitFor(() => {
        const savedHistory = JSON.parse(localStorage.getItem('random-choices-history'));
        expect(savedHistory.g1).toHaveLength(1);
      });

      expect(screen.getByText('Recent picks')).toBeInTheDocument();

      const expandButtons = screen.getAllByLabelText(/Expand group|Expanded/);
      fireEvent.click(expandButtons[1]);

      await waitFor(() => {
        expect(screen.queryByText('Recent picks')).not.toBeInTheDocument();
      });
    });

    it('removes a deleted group history', async () => {
      const groupsData = [
        { id: 'g1', name: 'First Group', choices: [{ id: 'c1', label: 'Choice 1', weight: 1 }] },
        { id: 'g2', name: 'Second Group', choices: [] },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));
      localStorage.setItem(
        'random-choices-history',
        JSON.stringify({ g1: [{ id: 'h1', label: 'Choice 1', timestamp: 1 }] }),
      );

      render(<WeightedChoices />);

      const deleteButtons = screen.getAllByText('×');
      fireEvent.click(deleteButtons[0]);

      await waitFor(() => {
        const savedHistory = JSON.parse(localStorage.getItem('random-choices-history'));
        expect(savedHistory.g1).toBeUndefined();
      });
    });

    it('result resets when switching to a different expanded group', async () => {
      const groupsData = [
        {
          id: 'g1',
          name: 'Group A',
          choices: [
            { id: 'c1', label: 'Choice A1', weight: 1 },
            { id: 'c2', label: 'Choice A2', weight: 1 },
          ],
        },
        {
          id: 'g2',
          name: 'Group B',
          choices: [
            { id: 'c3', label: 'Choice B1', weight: 1 },
            { id: 'c4', label: 'Choice B2', weight: 1 },
          ],
        },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));

      render(<WeightedChoices />);

      const pickButton = screen.getByRole('button', { name: /PICK/i });
      fireEvent.click(pickButton);

      await waitFor(() => {
        expect(screen.getAllByText(/Choice A[12]/).length).toBeGreaterThan(0);
      });

      const expandButtons = screen.getAllByLabelText(/Expand group|Expanded/);
      expect(expandButtons.length).toBeGreaterThanOrEqual(2);

      fireEvent.click(expandButtons[1]);

      await waitFor(() => {
        const results = screen.queryAllByText(/\d+% chance/);
        expect(results.length).toBe(0);
      });
    });
  });

  describe('No-replacement mode', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('shows a No repeats toggle per group and persists it to random-choices', async () => {
      const groupsData = [
        { id: 'g1', name: 'Test Group', choices: [{ id: 'c1', label: 'Choice 1', weight: 1 }] },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));

      render(<WeightedChoices />);

      const toggle = screen.getByLabelText('No repeats');
      expect(toggle).not.toBeChecked();

      fireEvent.click(toggle);

      await waitFor(() => {
        const saved = JSON.parse(localStorage.getItem('random-choices'));
        expect(saved[0].noReplacement).toBe(true);
      });
      expect(toggle).toBeChecked();
    });

    it('excludes a picked choice from subsequent picks when No repeats is on', async () => {
      const groupsData = [
        {
          id: 'g1',
          name: 'Test Group',
          choices: [
            { id: 'c1', label: 'First', weight: 1 },
            { id: 'c2', label: 'Second', weight: 1 },
          ],
        },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));
      vi.spyOn(Math, 'random').mockReturnValue(0.1);

      render(<WeightedChoices />);
      fireEvent.click(screen.getByLabelText('No repeats'));

      const pickButton = screen.getByRole('button', { name: /PICK/i });
      fireEvent.click(pickButton);
      await waitFor(() => {
        expect(screen.getAllByText('First').length).toBeGreaterThan(0);
      });

      // Only "Second" remains in the pool, so it's chosen regardless of the
      // (still low, First-favoring) rng value.
      fireEvent.click(pickButton);
      await waitFor(() => {
        expect(screen.getAllByText('Second').length).toBeGreaterThan(0);
      });
    });

    it('persists drawn ids under random-choices-drawn keyed by group', async () => {
      const groupsData = [
        {
          id: 'g1',
          name: 'Test Group',
          choices: [
            { id: 'c1', label: 'First', weight: 1 },
            { id: 'c2', label: 'Second', weight: 1 },
          ],
        },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));
      vi.spyOn(Math, 'random').mockReturnValue(0.1);

      render(<WeightedChoices />);
      fireEvent.click(screen.getByLabelText('No repeats'));
      fireEvent.click(screen.getByRole('button', { name: /PICK/i }));

      await waitFor(() => {
        const drawn = JSON.parse(localStorage.getItem('random-choices-drawn'));
        expect(drawn.g1).toEqual(['c1']);
      });
    });

    it('disables PICK once the pool is exhausted, and Reset re-enables it', async () => {
      const groupsData = [
        {
          id: 'g1',
          name: 'Test Group',
          choices: [
            { id: 'c1', label: 'First', weight: 1 },
            { id: 'c2', label: 'Second', weight: 1 },
          ],
        },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));
      vi.spyOn(Math, 'random').mockReturnValue(0.1);

      render(<WeightedChoices />);
      fireEvent.click(screen.getByLabelText('No repeats'));

      const pickButton = screen.getByRole('button', { name: /PICK/i });
      fireEvent.click(pickButton);
      await waitFor(() => expect(screen.getAllByText('First').length).toBeGreaterThan(0));
      fireEvent.click(pickButton);
      await waitFor(() => expect(screen.getAllByText('Second').length).toBeGreaterThan(0));

      await waitFor(() => expect(pickButton).toBeDisabled());

      fireEvent.click(screen.getByRole('button', { name: 'Reset pool' }));

      await waitFor(() => expect(pickButton).not.toBeDisabled());
    });

    it('Reset pool clears drawn ids for that group only', async () => {
      const groupsData = [
        {
          id: 'g1',
          name: 'Group A',
          choices: [
            { id: 'c1', label: 'A1', weight: 1 },
            { id: 'c2', label: 'A2', weight: 1 },
          ],
        },
        {
          id: 'g2',
          name: 'Group B',
          choices: [
            { id: 'c3', label: 'B1', weight: 1 },
            { id: 'c4', label: 'B2', weight: 1 },
          ],
        },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));
      localStorage.setItem(
        'random-choices-drawn',
        JSON.stringify({ g1: ['c1'], g2: ['c3'] }),
      );

      render(<WeightedChoices />);

      // Expand Group A and turn on No repeats so its Reset button renders.
      fireEvent.click(screen.getByLabelText('No repeats'));
      fireEvent.click(screen.getByRole('button', { name: 'Reset pool' }));

      await waitFor(() => {
        const drawn = JSON.parse(localStorage.getItem('random-choices-drawn'));
        expect(drawn.g1).toBeUndefined();
        expect(drawn.g2).toEqual(['c3']);
      });
    });

    it('toggling No repeats off clears that group\'s drawn ids', async () => {
      const groupsData = [
        {
          id: 'g1',
          name: 'Test Group',
          noReplacement: true,
          choices: [
            { id: 'c1', label: 'First', weight: 1 },
            { id: 'c2', label: 'Second', weight: 1 },
          ],
        },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));
      localStorage.setItem('random-choices-drawn', JSON.stringify({ g1: ['c1'] }));

      render(<WeightedChoices />);

      const toggle = screen.getByLabelText('No repeats');
      expect(toggle).toBeChecked();
      fireEvent.click(toggle);

      await waitFor(() => {
        const drawn = JSON.parse(localStorage.getItem('random-choices-drawn'));
        expect(drawn.g1).toBeUndefined();
      });

      const pickButton = screen.getByRole('button', { name: /PICK/i });
      expect(pickButton).not.toBeDisabled();
    });

    it('leaves repeat picks possible when No repeats is off', async () => {
      const groupsData = [
        {
          id: 'g1',
          name: 'Test Group',
          choices: [
            { id: 'c1', label: 'First', weight: 1 },
            { id: 'c2', label: 'Second', weight: 1 },
          ],
        },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));
      vi.spyOn(Math, 'random').mockReturnValue(0.1);

      render(<WeightedChoices />);
      const pickButton = screen.getByRole('button', { name: /PICK/i });

      fireEvent.click(pickButton);
      await waitFor(() => expect(screen.getAllByText('First').length).toBeGreaterThan(0));
      fireEvent.click(pickButton);
      await waitFor(() => expect(screen.getAllByText('First').length).toBeGreaterThan(0));
      expect(pickButton).not.toBeDisabled();
    });

    it('does not wedge the pool when a drawn choice is deleted', async () => {
      const groupsData = [
        {
          id: 'g1',
          name: 'Test Group',
          choices: [
            { id: 'c1', label: 'First', weight: 1 },
            { id: 'c2', label: 'Second', weight: 1 },
            { id: 'c3', label: 'Third', weight: 1 },
          ],
        },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));
      vi.spyOn(Math, 'random').mockReturnValue(0.1);

      render(<WeightedChoices />);
      fireEvent.click(screen.getByLabelText('No repeats'));

      const pickButton = screen.getByRole('button', { name: /PICK/i });
      fireEvent.click(pickButton);
      await waitFor(() => expect(screen.getAllByText('First').length).toBeGreaterThan(0));

      // Delete the now-drawn "First" row via its own delete button.
      const firstRow = screen.getByDisplayValue('First').closest('div');
      fireEvent.click(firstRow.querySelector('button'));

      await waitFor(() => {
        const saved = JSON.parse(localStorage.getItem('random-choices'));
        expect(saved[0].choices.map((c) => c.label)).toEqual(['Second', 'Third']);
      });

      expect(pickButton).not.toBeDisabled();

      fireEvent.click(pickButton);
      await waitFor(() => {
        expect(screen.getAllByText(/Second|Third/).length).toBeGreaterThan(0);
      });
    });

    it('carries drawn state through group delete and Undo', async () => {
      const groupsData = [
        {
          id: 'g1',
          name: 'Only Group',
          noReplacement: true,
          choices: [
            { id: 'c1', label: 'Choice 1', weight: 1 },
            { id: 'c2', label: 'Choice 2', weight: 1 },
          ],
        },
        { id: 'g2', name: 'Other Group', choices: [{ id: 'c3', label: 'X', weight: 1 }] },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));
      localStorage.setItem('random-choices-drawn', JSON.stringify({ g1: ['c1'] }));

      render(<WeightedChoices />);

      fireEvent.click(screen.getAllByLabelText('Delete group')[0]);
      expect(screen.getByText('Group deleted')).toBeInTheDocument();

      await waitFor(() => {
        const drawn = JSON.parse(localStorage.getItem('random-choices-drawn'));
        expect(drawn.g1).toBeUndefined();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

      await waitFor(() => {
        const drawn = JSON.parse(localStorage.getItem('random-choices-drawn'));
        expect(drawn.g1).toEqual(['c1']);
      });
    });

    it('keeps the wheel showing the pre-pick pool until the spin transition ends', async () => {
      // Three choices (not two): the assertions below distinguish the
      // pre-pick (3-segment) and post-pick (2-segment) gradients by their
      // exact stops, and jsdom's CSS parser rejects a single-color-stop
      // conic-gradient outright — irrelevant to the real bug this test
      // guards, so three choices keeps both states multi-stop.
      const groupsData = [
        {
          id: 'g1',
          name: 'Test Group',
          choices: [
            { id: 'c1', label: 'First', weight: 1 },
            { id: 'c2', label: 'Second', weight: 1 },
            { id: 'c3', label: 'Third', weight: 1 },
          ],
        },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));
      vi.spyOn(Math, 'random').mockReturnValue(0.1);

      render(<WeightedChoices />);
      fireEvent.click(screen.getByLabelText('No repeats'));

      const wheel = screen.getByTestId('choiceWheel');
      fireEvent.click(screen.getByRole('button', { name: /PICK/i }));

      await waitFor(() => expect(screen.getAllByText('First').length).toBeGreaterThan(0));

      // Still the three-segment (pre-pick) gradient while the 3s spin
      // transition is in flight — the pointer must land on the wedge it
      // was animated toward, not one recomputed from the shrunken pool.
      // jsdom normalizes hex colors to rgb() in computed style strings.
      expect(wheel.style.background).toContain('rgb(2, 136, 209) 240deg 360deg');

      fireEvent.transitionEnd(wheel);

      await waitFor(() => {
        // Second + Third remain, each now a 180deg half.
        expect(wheel.style.background).toBe(
          'conic-gradient(rgb(79, 195, 247) 0deg 180deg, rgb(129, 212, 250) 180deg 360deg)',
        );
      });
    });

    it('shows the remaining-pool percentage on undrawn rows once picking starts', async () => {
      const groupsData = [
        {
          id: 'g1',
          name: 'Test Group',
          choices: [
            { id: 'c1', label: 'First', weight: 1 },
            { id: 'c2', label: 'Second', weight: 1 },
          ],
        },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));
      vi.spyOn(Math, 'random').mockReturnValue(0.1);

      render(<WeightedChoices />);
      fireEvent.click(screen.getByLabelText('No repeats'));
      fireEvent.click(screen.getByRole('button', { name: /PICK/i }));

      await waitFor(() => expect(screen.getAllByText('First').length).toBeGreaterThan(0));
      fireEvent.transitionEnd(screen.getByTestId('choiceWheel'));

      // "Second" is now the only item left in the pool: 100%, not 50%.
      const secondRow = screen.getByDisplayValue('Second').closest('div');
      await waitFor(() => {
        expect(secondRow.textContent).toContain('100%');
      });
      // "First" is drawn: no misleading percentage on it.
      const firstRow = screen.getByDisplayValue('First').closest('div');
      expect(firstRow.textContent).toContain('—');
    });

    it('does not reset the pool when re-expanding the group', async () => {
      const groupsData = [
        {
          id: 'g1',
          name: 'Group A',
          choices: [
            { id: 'c1', label: 'First', weight: 1 },
            { id: 'c2', label: 'Second', weight: 1 },
          ],
        },
        { id: 'g2', name: 'Group B', choices: [{ id: 'c3', label: 'X', weight: 1 }] },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));
      vi.spyOn(Math, 'random').mockReturnValue(0.1);

      render(<WeightedChoices />);
      fireEvent.click(screen.getByLabelText('No repeats'));
      fireEvent.click(screen.getByRole('button', { name: /PICK/i }));
      await waitFor(() => {
        const drawn = JSON.parse(localStorage.getItem('random-choices-drawn'));
        expect(drawn.g1).toEqual(['c1']);
      });

      // Switch to Group B, then back to Group A.
      const expandButtons = screen.getAllByLabelText(/Expand group|Expanded/);
      fireEvent.click(expandButtons[1]);
      fireEvent.click(screen.getAllByLabelText(/Expand group|Expanded/)[0]);

      const drawn = JSON.parse(localStorage.getItem('random-choices-drawn'));
      expect(drawn.g1).toEqual(['c1']);
    });

    it('ignores stale drawn ids when No repeats is off', async () => {
      const groupsData = [
        {
          id: 'g1',
          name: 'Test Group',
          choices: [
            { id: 'c1', label: 'First', weight: 1 },
            { id: 'c2', label: 'Second', weight: 1 },
          ],
        },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));
      // Simulates state left over from a prior session/tab where this group
      // had No repeats on and had drawn "First" — the toggle is off now.
      localStorage.setItem('random-choices-drawn', JSON.stringify({ g1: ['c1'] }));

      render(<WeightedChoices />);

      const firstRow = screen.getByDisplayValue('First').closest('div');
      expect(firstRow.textContent).not.toContain('—');
      expect(firstRow.textContent).toContain('50%');
    });

    it('disables PICK once only a zero-weight choice remains in the pool', async () => {
      const groupsData = [
        {
          id: 'g1',
          name: 'Test Group',
          choices: [
            { id: 'c1', label: 'First', weight: 1 },
            { id: 'c2', label: 'Second', weight: 0 },
          ],
        },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));

      render(<WeightedChoices />);
      fireEvent.click(screen.getByLabelText('No repeats'));

      const pickButton = screen.getByRole('button', { name: /PICK/i });
      fireEvent.click(pickButton);

      await waitFor(() => expect(screen.getAllByText('First').length).toBeGreaterThan(0));

      // Only "Second" (weight 0) is left in the pool — nothing pickable.
      await waitFor(() => expect(pickButton).toBeDisabled());
    });
  });

  describe('Spinner', () => {
    it('renders a wheel with a data-testid for the current group', () => {
      const groupsData = [
        {
          id: 'g1',
          name: 'Test Group',
          choices: [
            { id: 'c1', label: 'First', weight: 1 },
            { id: 'c2', label: 'Second', weight: 1 },
          ],
        },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));

      render(<WeightedChoices />);
      expect(screen.getByTestId('choiceWheel')).toBeInTheDocument();
    });

    it('PICK still returns a result matching a valid choice label with the spinner present', async () => {
      const groupsData = [
        {
          id: 'g1',
          name: 'Test Group',
          choices: [
            { id: 'c1', label: 'First', weight: 1 },
            { id: 'c2', label: 'Second', weight: 1 },
          ],
        },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));

      render(<WeightedChoices />);
      fireEvent.click(screen.getByRole('button', { name: /PICK/i }));

      await waitFor(() => {
        expect(screen.getAllByText(/First|Second/).length).toBeGreaterThan(0);
      });
    });

    it('rotates the wheel to the exact angle of the chosen wedge (deterministic pick)', async () => {
      const groupsData = [
        {
          id: 'g1',
          name: 'Test Group',
          choices: [
            { id: 'c1', label: 'First', weight: 1 },
            { id: 'c2', label: 'Second', weight: 1 },
          ],
        },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));

      // buildWheelSegments gives c1 ("First") the range [0, 180) (center 90)
      // and c2 ("Second") the range [180, 360) (center 270). A low
      // Math.random() value picks the first item ("First", center 90).
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.1);

      render(<WeightedChoices />);
      const wheel = screen.getByTestId('choiceWheel');
      expect(wheel.style.transform).toBe('rotate(0deg)');

      fireEvent.click(screen.getByRole('button', { name: /PICK/i }));

      await waitFor(() => {
        expect(screen.getAllByText('First').length).toBeGreaterThan(0);
      });

      // Fixed formula: rotation = prev - (prev % 360) + 5*360 - center.
      // prev starts at 0, center for "First" is 90 => 5*360 - 90 = 1710.
      expect(wheel.style.transform).toBe('rotate(1710deg)');

      randomSpy.mockRestore();
    });
  });
});

describe('Drag reorder', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  const renderChoicesTab = (groupsData) => {
    localStorage.setItem('random-choices', JSON.stringify(groupsData));
    render(<WeightedChoices />);
  };

  const ONE_GROUP_ONE_CHOICE = [
    { id: 'g1', name: 'Group A', choices: [{ id: 'c1', label: 'First', weight: 1 }] },
  ];

  // Types `text` the way a browser does: a keydown whose default is
  // prevented never inserts its character. Drag sensors that sit on an
  // ancestor of the input can preventDefault Space, silently making
  // multi-word values untypable — this surfaces that as a wrong value.
  const typeText = (input, text) => {
    Array.from(text).forEach((char) => {
      const accepted = fireEvent.keyDown(input, {
        key: char,
        code: char === ' ' ? 'Space' : `Key${char.toUpperCase()}`,
      });
      if (!accepted) return;
      fireEvent.change(input, { target: { value: input.value + char } });
    });
  };

  describe('Drag handle placement', () => {
    it('puts dnd-kit draggable attributes on a dedicated handle, not on the row', () => {
      renderChoicesTab(ONE_GROUP_ONE_CHOICE);

      const groupHandle = screen.getByLabelText('Reorder group');
      const choiceHandle = screen.getByLabelText('Reorder choice');

      [groupHandle, choiceHandle].forEach((handle) => {
        expect(handle).toHaveAttribute('role', 'button');
        expect(handle).toHaveAttribute('tabindex', '0');
        expect(handle).toHaveAttribute('aria-roledescription', 'sortable');
      });

      // The row itself must stay a plain container: stamping role="button"
      // on a row that holds real inputs and buttons is invalid ARIA, and it
      // used to make the row match the sensor's own interactive-element
      // exclusion, so a drag could never activate at all.
      expect(choiceHandle.parentElement).not.toHaveAttribute('role');
      expect(choiceHandle.parentElement).not.toHaveAttribute('tabindex');
      expect(groupHandle.parentElement).not.toHaveAttribute('role');
      expect(groupHandle.parentElement).not.toHaveAttribute('tabindex');
    });
  });

  describe('Keyboard input is not swallowed by the drag sensors', () => {
    it('types a multi-word label into a choice input, space included', () => {
      renderChoicesTab([{ id: 'g1', name: 'Group A', choices: [{ id: 'c1', label: '', weight: 1 }] }]);

      const input = screen.getByPlaceholderText('Choice');
      typeText(input, 'Two Words');

      expect(input.value).toBe('Two Words');
    });

    it('types a multi-word name into the group name input, space included', () => {
      renderChoicesTab([{ id: 'g1', name: 'A', choices: [] }]);

      fireEvent.click(screen.getByText('A'));
      const input = screen.getByDisplayValue('A');
      fireEvent.change(input, { target: { value: '' } });
      typeText(input, 'Two Words');

      expect(input.value).toBe('Two Words');
    });

    it('leaves Enter usable on the weight and group name inputs', () => {
      renderChoicesTab(ONE_GROUP_ONE_CHOICE);

      const weightInput = screen.getByDisplayValue('1');
      expect(fireEvent.keyDown(weightInput, { key: 'Enter', code: 'Enter' })).toBe(true);

      fireEvent.click(screen.getByText('Group A'));
      const nameInput = screen.getByDisplayValue('Group A');
      expect(fireEvent.keyDown(nameInput, { key: 'Enter', code: 'Enter' })).toBe(true);
    });

    it('leaves Enter and Space usable on the row buttons', () => {
      renderChoicesTab(ONE_GROUP_ONE_CHOICE);

      const buttons = [
        screen.getByLabelText(/Expand group|Expanded/),
        screen.getByLabelText('Delete group'),
      ];

      buttons.forEach((button) => {
        expect(fireEvent.keyDown(button, { key: 'Enter', code: 'Enter' })).toBe(true);
        expect(fireEvent.keyDown(button, { key: ' ', code: 'Space' })).toBe(true);
      });
    });
  });

  describe('RowPointerSensor', () => {
    const press = (target) => {
      const onActivation = vi.fn();
      const accepted = RowPointerSensor.activators[0].handler(
        { nativeEvent: { isPrimary: true, button: 0, target } },
        { onActivation },
      );
      return { accepted, onActivation };
    };

    it('activates on pointerdown', () => {
      expect(RowPointerSensor.activators[0].eventName).toBe('onPointerDown');
    });

    it('accepts a press on a real rendered drag handle', () => {
      renderChoicesTab(ONE_GROUP_ONE_CHOICE);

      ['Reorder group', 'Reorder choice'].forEach((label) => {
        const { accepted, onActivation } = press(screen.getByLabelText(label));
        expect(accepted).toBe(true);
        expect(onActivation).toHaveBeenCalledTimes(1);
      });
    });

    it("refuses a press on one of the row's own inputs or buttons", () => {
      renderChoicesTab(ONE_GROUP_ONE_CHOICE);

      const targets = [
        screen.getByDisplayValue('First'),
        screen.getByDisplayValue('1'),
        screen.getByLabelText('Delete group'),
      ];

      targets.forEach((target) => {
        const { accepted, onActivation } = press(target);
        expect(accepted).toBe(false);
        expect(onActivation).not.toHaveBeenCalled();
      });
    });

    it('refuses non-primary pointers and non-left buttons', () => {
      const [{ handler }] = RowPointerSensor.activators;
      const target = document.createElement('span');
      const onActivation = vi.fn();

      expect(handler({ nativeEvent: { isPrimary: false, button: 0, target } }, { onActivation })).toBe(false);
      expect(handler({ nativeEvent: { isPrimary: true, button: 2, target } }, { onActivation })).toBe(false);
      expect(onActivation).not.toHaveBeenCalled();
    });
  });
});
