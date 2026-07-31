/**
 * @vitest-environment jsdom
 */

import type { ForgeProject } from '@/common/types/project/projectTypes';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const updateProjectMock = vi.fn();
const messageSuccessMock = vi.fn();
const messageErrorMock = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@renderer/pages/conversation/projects/projectStorage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@renderer/pages/conversation/projects/projectStorage')>();
  return {
    ...actual,
    updateProject: (...args: Parameters<typeof actual.updateProject>) => updateProjectMock(...args),
  };
});

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: {
      ...actual.Message,
      success: (...args: unknown[]) => messageSuccessMock(...args),
      error: (...args: unknown[]) => messageErrorMock(...args),
    },
  };
});

import ProjectInstructionsCard from '@renderer/pages/project/components/ProjectInstructionsCard';

const baseProject: ForgeProject = {
  id: 'p1',
  name: 'Alpha Project',
  workspace: '/w/alpha',
  created_at: 1,
  updated_at: 1,
};

describe('ProjectInstructionsCard', () => {
  beforeEach(() => {
    // A successful `updateProject` returns the updated project, and the card now
    // branches on that return value, so the default mock has to answer like the
    // real one rather than with `undefined`.
    updateProjectMock.mockReset().mockReturnValue({ ...baseProject });
    messageSuccessMock.mockReset();
    messageErrorMock.mockReset();
  });

  it('renders a preview of existing instructions with an Edit control', () => {
    render(<ProjectInstructionsCard project={{ ...baseProject, instructions: 'Always answer in VND.' }} />);

    expect(screen.getByText('Always answer in VND.')).toBeInTheDocument();
    expect(screen.getByText('conversation.projectHome.instructionsApplies')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'conversation.projectHome.edit' })).toBeInTheDocument();
  });

  it('renders the empty state with an Add instructions affordance when there are no instructions', () => {
    render(<ProjectInstructionsCard project={baseProject} />);

    expect(screen.getByText('conversation.projectHome.instructionsEmpty')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'conversation.projectHome.addInstructions' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'conversation.projectHome.edit' })).not.toBeInTheDocument();
  });

  it('treats whitespace-only instructions as empty', () => {
    render(<ProjectInstructionsCard project={{ ...baseProject, instructions: '   ' }} />);

    expect(screen.getByText('conversation.projectHome.instructionsEmpty')).toBeInTheDocument();
  });

  it('reveals a textarea seeded with the current instructions when Edit is clicked', () => {
    render(<ProjectInstructionsCard project={{ ...baseProject, instructions: 'Always answer in VND.' }} />);

    fireEvent.click(screen.getByRole('button', { name: 'conversation.projectHome.edit' }));

    expect(screen.getByRole('textbox')).toHaveValue('Always answer in VND.');
  });

  it('saves the trimmed draft and returns to the preview on Save', () => {
    render(<ProjectInstructionsCard project={{ ...baseProject, instructions: 'Always answer in VND.' }} />);

    fireEvent.click(screen.getByRole('button', { name: 'conversation.projectHome.edit' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  Always answer in USD.  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'conversation.projectHome.save' }));

    expect(updateProjectMock).toHaveBeenCalledExactlyOnceWith({ id: 'p1', instructions: 'Always answer in USD.' });
    expect(messageSuccessMock).toHaveBeenCalledExactlyOnceWith('conversation.projectHome.instructionsSaved');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('keeps the draft on screen and reports the failure when the project row is gone', () => {
    updateProjectMock.mockReturnValue(null);
    render(<ProjectInstructionsCard project={{ ...baseProject, instructions: 'Always answer in VND.' }} />);

    fireEvent.click(screen.getByRole('button', { name: 'conversation.projectHome.edit' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Always answer in USD.' } });
    fireEvent.click(screen.getByRole('button', { name: 'conversation.projectHome.save' }));

    expect(messageErrorMock).toHaveBeenCalledExactlyOnceWith('conversation.projectHome.instructionsSaveFailed');
    expect(messageSuccessMock).not.toHaveBeenCalled();
    // Still editing, with the typed text intact — a failed save must not throw the draft away.
    expect(screen.getByRole('textbox')).toHaveValue('Always answer in USD.');
  });

  it('keeps the draft on screen and reports the failure when the save throws', () => {
    // The workspace duplicate check runs on every save, so an instructions-only
    // save can throw for a clash the user never touched.
    updateProjectMock.mockImplementation(() => {
      throw new Error('PROJECT_WORKSPACE_DUPLICATE');
    });
    render(<ProjectInstructionsCard project={{ ...baseProject, instructions: 'Always answer in VND.' }} />);

    fireEvent.click(screen.getByRole('button', { name: 'conversation.projectHome.edit' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Always answer in USD.' } });
    fireEvent.click(screen.getByRole('button', { name: 'conversation.projectHome.save' }));

    expect(messageErrorMock).toHaveBeenCalledExactlyOnceWith('conversation.projectHome.instructionsSaveFailed');
    expect(messageSuccessMock).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox')).toHaveValue('Always answer in USD.');
  });

  it('discards the draft and leaves updateProject uncalled on Cancel', () => {
    render(<ProjectInstructionsCard project={{ ...baseProject, instructions: 'Always answer in VND.' }} />);

    fireEvent.click(screen.getByRole('button', { name: 'conversation.projectHome.edit' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Something unsaved' } });
    fireEvent.click(screen.getByRole('button', { name: 'conversation.projectHome.cancel' }));

    expect(updateProjectMock).not.toHaveBeenCalled();
    expect(screen.getByText('Always answer in VND.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('opens the editor with an empty draft from the empty-state Add instructions affordance', () => {
    render(<ProjectInstructionsCard project={baseProject} />);

    fireEvent.click(screen.getByRole('button', { name: 'conversation.projectHome.addInstructions' }));

    expect(screen.getByRole('textbox')).toHaveValue('');
  });
});
