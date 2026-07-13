import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TeamSiderSection from '@/renderer/components/layout/Sider/TeamSiderSection';

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  removeTeam: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const values: Record<string, string> = {
        'team.sider.createTeam': 'New Team',
        'team.sider.title': 'Teams',
      };
      return values[key] ?? key;
    },
  }),
}));

vi.mock('@/renderer/pages/team/hooks/useTeamList', () => ({
  useTeamList: () => ({
    teams: [],
    mutate: mocks.mutate,
    removeTeam: mocks.removeTeam,
  }),
}));

vi.mock('@/renderer/pages/team/hooks/useSiderTeamBadges', () => ({
  useSiderTeamBadges: () => new Map<string, number>(),
}));

vi.mock('@/renderer/pages/team/components/TeamCreateModal', () => ({
  default: (_props: { visible: boolean; onClose: () => void; onCreated: (team: { id: string }) => void }) => null,
}));

describe('TeamSiderSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('uses the neutral sidebar action color for the Teams create button', () => {
    render(
      <MemoryRouter>
        <TeamSiderSection collapsed={false} pathname='/' siderTooltipProps={{}} />
      </MemoryRouter>
    );

    const createButton = screen.getByTestId('team-create-btn');

    expect(createButton).toHaveClass('!text-t-secondary');
    expect(createButton).toHaveClass('hover:!text-t-primary');
    expect(createButton).toHaveClass('sider-section-action');
    expect(createButton).not.toHaveClass('text-primary');
  });
});
