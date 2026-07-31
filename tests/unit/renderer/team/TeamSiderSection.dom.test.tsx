import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TeamSiderSection from '@/renderer/components/layout/Sider/TeamSiderSection';

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  removeTeam: vi.fn(),
  teams: [] as Array<{ id: string; name: string }>,
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
    teams: mocks.teams,
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
    mocks.teams = [];
    localStorage.clear();
  });

  it('uses a prominent section heading without a team count', () => {
    mocks.teams = [
      { id: 'team-a', name: 'aaa' },
      { id: 'team-report', name: 'report' },
    ];

    render(
      <MemoryRouter>
        <TeamSiderSection collapsed={false} pathname='/' siderTooltipProps={{}} />
      </MemoryRouter>
    );

    expect(screen.getByText('Teams')).toBeInTheDocument();
    expect(screen.queryByText('2')).not.toBeInTheDocument();
    expect(screen.getByText('Teams')).toHaveClass('text-15px');
    expect(screen.getByText('Teams')).toHaveClass('text-t-primary');
    expect(screen.getByText('Teams')).toHaveClass('font-700');
  });

  it('uses the neutral sidebar action color for the Teams create button', () => {
    render(
      <MemoryRouter>
        <TeamSiderSection collapsed={false} pathname='/' siderTooltipProps={{}} />
      </MemoryRouter>
    );

    const createButton = screen.getByTestId('team-create-btn');

    expect(createButton).toHaveClass('sider-section-add-action');
    expect(createButton).toHaveClass('!w-22px');
    expect(createButton).toHaveClass('!text-t-secondary');
    expect(createButton).toHaveClass('hover:!text-t-primary');
    expect(createButton).not.toHaveClass('text-primary');
  });

  it('matches the collapsed rail row height used by every sibling entry', () => {
    // The collapsed rail is one vertical stack, so a team row taller than the nav
    // entries next to it breaks the pitch. jsdom applies no UnoCSS, so the class is
    // the only assertable signal; the pixel result is checked by eye.
    mocks.teams = [{ id: 'team-a', name: 'aaa' }];

    render(
      <MemoryRouter>
        <TeamSiderSection collapsed={true} pathname='/' siderTooltipProps={{}} />
      </MemoryRouter>
    );

    const row = screen.getByTestId('collapsed-team-item-team-a');
    expect(row).toHaveClass('h-34px');
    expect(row).not.toHaveClass('h-40px');
  });
});
