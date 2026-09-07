import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import Random from '../../../pages/random/index';
import { pwaMetaTags } from '../../../components/layout';

vi.mock('next/router', () => ({
  useRouter: () => ({ basePath: '/base' }),
}));

vi.mock('../../../components/layout', () => ({
  pwaMetaTags: vi.fn(() => null),
}));

describe('Random page head', () => {
  it('calls pwaMetaTags with the router basePath and the page theme color', () => {
    render(<Random />);
    expect(pwaMetaTags).toHaveBeenCalledWith('/base', {
      themeColor: '#1a1a2e',
      manifestPath: 'random-manifest.json',
    });
  });
});

describe('Random page background', () => {
  it('sets html and body background to the page theme color on mount', () => {
    const probe = document.createElement('div');
    probe.style.backgroundColor = '#1a1a2e';
    const expected = probe.style.backgroundColor;

    render(<Random />);

    expect(document.documentElement.style.backgroundColor).toBe(expected);
    expect(document.body.style.backgroundColor).toBe(expected);
  });
});

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

      render(<Random />);

      // Switch to Choices tab
      const choicesTab = screen.getByText('Choices');
      fireEvent.click(choicesTab);

      // Old choices should be visible in the group
      expect(screen.getByDisplayValue('Choice A')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Choice B')).toBeInTheDocument();

      // Check localStorage has new grouped format
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

      render(<Random />);
      const choicesTab = screen.getByText('Choices');
      fireEvent.click(choicesTab);

      // A group must exist so the "Add choice..." input is reachable
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
      render(<Random />);

      // Switch to Choices tab
      const choicesTab = screen.getByText('Choices');
      fireEvent.click(choicesTab);

      // Should have at least the ghost add-choice row visible
      const addChoiceInputs = screen.getAllByPlaceholderText('Add choice...');
      expect(addChoiceInputs.length).toBeGreaterThan(0);

      // Wait for localStorage to be updated
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
      render(<Random />);
      const choicesTab = screen.getByText('Choices');
      fireEvent.click(choicesTab);

      // Find and fill the ghost group input
      const ghostGroupInput = screen.getByPlaceholderText('Add group...');
      fireEvent.change(ghostGroupInput, { target: { value: 'New Group' } });
      fireEvent.blur(ghostGroupInput);

      // Wait for the group to be added
      await waitFor(() => {
        const saved = JSON.parse(localStorage.getItem('random-choices'));
        expect(saved.length).toBeGreaterThan(1);
      });

      // New group should be visible
      expect(screen.getByText('New Group')).toBeInTheDocument();
    });

    it('renames a group via inline edit', async () => {
      const groupsData = [
        { id: 'g1', name: 'First Group', choices: [] },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));

      render(<Random />);
      const choicesTab = screen.getByText('Choices');
      fireEvent.click(choicesTab);

      // Click on the group name to enter edit mode
      const groupNameDisplay = screen.getByText('First Group');
      fireEvent.click(groupNameDisplay);

      // Find the input that appeared
      const groupNameInput = screen.getByDisplayValue('First Group');
      fireEvent.change(groupNameInput, { target: { value: 'Renamed Group' } });
      fireEvent.blur(groupNameInput);

      // Check localStorage persists the rename
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

      render(<Random />);
      const choicesTab = screen.getByText('Choices');
      fireEvent.click(choicesTab);

      // Find delete button for first group (should be a × button next to the group name)
      const deleteButtons = screen.getAllByText('×');
      expect(deleteButtons.length).toBeGreaterThan(0);

      // Delete the first group
      fireEvent.click(deleteButtons[0]);

      // Check localStorage reflects deletion
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

      render(<Random />);
      const choicesTab = screen.getByText('Choices');
      fireEvent.click(choicesTab);

      const deleteButtons = screen.getAllByText('×');
      fireEvent.click(deleteButtons[0]);

      await waitFor(() => {
        const saved = JSON.parse(localStorage.getItem('random-choices'));
        expect(saved).toHaveLength(1);
        expect(saved[0].name).toBe('Default');
      });

      // The new Default group must render expanded (not collapsed)
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

      render(<Random />);
      fireEvent.click(screen.getByText('Choices'));

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

      render(<Random />);
      fireEvent.click(screen.getByText('Choices'));

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

      render(<Random />);
      fireEvent.click(screen.getByText('Choices'));
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

      render(<Random />);
      fireEvent.click(screen.getByText('Choices'));

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

      render(<Random />);
      fireEvent.click(screen.getByText('Choices'));

      // Group A is expanded by default; pick a result in it.
      fireEvent.click(screen.getByRole('button', { name: /PICK/i }));
      await waitFor(() => {
        expect(screen.getByText(/Choice A[12]/)).toBeInTheDocument();
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
      expect(screen.getByText(/Choice A[12]/)).toBeInTheDocument();
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

      render(<Random />);
      fireEvent.click(screen.getByText('Choices'));

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

      render(<Random />);
      fireEvent.click(screen.getByText('Choices'));

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

      render(<Random />);
      const choicesTab = screen.getByText('Choices');
      fireEvent.click(choicesTab);

      // Initially first group should be expanded
      expect(screen.getByDisplayValue('Choice A')).toBeInTheDocument();

      // Get all expand buttons and click the second one (for Group B)
      const expandButtons = screen.getAllByLabelText(/Expand group|Expanded/);
      expect(expandButtons.length).toBeGreaterThanOrEqual(2);

      // Click the second expand button (Group B)
      fireEvent.click(expandButtons[1]);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Choice B')).toBeInTheDocument();
      });
    });
  });

  describe('Per-group choice operations', () => {
    it('adds a choice to the expanded group', async () => {
      const groupsData = [
        { id: 'g1', name: 'Test Group', choices: [] },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));

      render(<Random />);
      const choicesTab = screen.getByText('Choices');
      fireEvent.click(choicesTab);

      // Add a choice
      const addChoiceInput = screen.getByPlaceholderText('Add choice...');
      fireEvent.change(addChoiceInput, { target: { value: 'New Choice' } });
      fireEvent.blur(addChoiceInput);

      // Check localStorage
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

      render(<Random />);
      const choicesTab = screen.getByText('Choices');
      fireEvent.click(choicesTab);

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

      render(<Random />);
      const choicesTab = screen.getByText('Choices');
      fireEvent.click(choicesTab);

      // Wait for choices to be visible
      await waitFor(() => {
        expect(screen.getByDisplayValue('Choice 1')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Choice 2')).toBeInTheDocument();
      });

      // Get delete buttons - skip group header button, select choice row buttons
      const deleteButtons = screen.getAllByText('×');
      // Skip first button (group delete in header), delete the second one (choice)
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

      render(<Random />);
      const choicesTab = screen.getByText('Choices');
      fireEvent.click(choicesTab);

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

      render(<Random />);
      const choicesTab = screen.getByText('Choices');
      fireEvent.click(choicesTab);

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

      render(<Random />);
      const choicesTab = screen.getByText('Choices');
      fireEvent.click(choicesTab);

      const pickButton = screen.getByRole('button', { name: /PICK/i });
      fireEvent.click(pickButton);

      await waitFor(() => {
        const resultText = screen.getByText(/First|Second/);
        expect(resultText).toBeInTheDocument();
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

      render(<Random />);
      const choicesTab = screen.getByText('Choices');
      fireEvent.click(choicesTab);

      // Pick in Group A
      const pickButton = screen.getByRole('button', { name: /PICK/i });
      fireEvent.click(pickButton);

      await waitFor(() => {
        expect(screen.getByText(/Choice A[12]/)).toBeInTheDocument();
      });

      // Get all expand buttons and click the second one to switch to Group B
      const expandButtons = screen.getAllByLabelText(/Expand group|Expanded/);
      expect(expandButtons.length).toBeGreaterThanOrEqual(2);

      fireEvent.click(expandButtons[1]);

      await waitFor(() => {
        // Result from Group A should be gone
        const results = screen.queryAllByText(/\d+% chance/);
        expect(results.length).toBe(0);
      });
    });
  });
});
