import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import WeightedChoices from '../../../pages/random/WeightedChoices';

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

      render(<WeightedChoices />);

      const pickButton = screen.getByRole('button', { name: /PICK/i });
      fireEvent.click(pickButton);

      await waitFor(() => {
        expect(screen.getByText(/Choice A[12]/)).toBeInTheDocument();
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
});
