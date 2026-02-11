import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ArchetypeManagerDialog from '../ArchetypeManagerDialog';

const {
  mockGetArchetype,
  mockGenerateArchetype,
  mockUpdateArchetype,
  mockDeleteArchetype,
} = vi.hoisted(() => ({
  mockGetArchetype: vi.fn(),
  mockGenerateArchetype: vi.fn(),
  mockUpdateArchetype: vi.fn(),
  mockDeleteArchetype: vi.fn(),
}));

vi.mock('../../../utils/designerApiV2', () => ({
  getArchetype: mockGetArchetype,
  generateArchetype: mockGenerateArchetype,
  updateArchetype: mockUpdateArchetype,
  deleteArchetype: mockDeleteArchetype,
}));

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <ArchetypeManagerDialog
        open
        onOpenChange={() => {}}
        archetypes={[
          {
            id: 'aggressive',
            name: 'Aggressive',
            description: 'Stress archetype',
            sample_count: 25,
          },
        ]}
        onArchetypeSelected={() => {}}
      />
    </QueryClientProvider>
  );
}

describe('ArchetypeManagerDialog', () => {
  beforeEach(() => {
    mockGetArchetype.mockReset();
    mockGenerateArchetype.mockReset();
    mockUpdateArchetype.mockReset();
    mockDeleteArchetype.mockReset();

    mockGetArchetype.mockResolvedValue({
      id: 'aggressive',
      name: 'Aggressive',
      description: 'Stress archetype',
      sample_count: 25,
      message_triggers: [[['anger', 0.9]]],
      outcome_weights: { positive: 0.2, neutral: 0.3, negative: 0.5 },
    });
  });

  it('calls generateArchetype with uploaded file payload', async () => {
    mockGenerateArchetype.mockResolvedValue({
      id: 'fresh-archetype',
      name: 'Fresh Archetype',
      description: '',
      sample_count: 2,
      trigger_distribution: { anger: 0.5, admiration: 0.5 },
    });

    renderDialog();

    const nameInputs = screen.getAllByPlaceholderText('Name');
    fireEvent.change(nameInputs[0], { target: { value: 'Fresh Archetype' } });
    fireEvent.change(screen.getByPlaceholderText('Description'), {
      target: { value: 'Generated in test' },
    });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).not.toBeNull();
    const file = new File(['hello\nworld'], 'messages.txt', { type: 'text/plain' });
    fireEvent.change(fileInput as HTMLInputElement, { target: { files: [file] } });

    fireEvent.click(screen.getByRole('button', { name: /Generate/i }));

    await waitFor(() => expect(mockGenerateArchetype).toHaveBeenCalledTimes(1));
    expect(mockGenerateArchetype).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'fresharchetype',
        name: 'Fresh Archetype',
        description: 'Generated in test',
        file,
      })
    );
  });

  it('calls update and delete for selected archetype', async () => {
    mockUpdateArchetype.mockResolvedValue({
      id: 'aggressive',
      name: 'Aggressive Updated',
      description: 'Updated in test',
      sample_count: 25,
      message_triggers: [[['anger', 0.9]]],
      outcome_weights: { positive: 0.25, neutral: 0.35, negative: 0.4 },
    });
    mockDeleteArchetype.mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderDialog();

    await waitFor(() => expect(mockGetArchetype).toHaveBeenCalled());
    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('Name').length).toBeGreaterThan(1);
    });
    const nameInputs = screen.getAllByPlaceholderText('Name');
    fireEvent.change(nameInputs[1], { target: { value: 'Aggressive Updated' } });

    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));

    await waitFor(() => expect(mockUpdateArchetype).toHaveBeenCalledTimes(1));
    expect(mockUpdateArchetype).toHaveBeenCalledWith(
      'aggressive',
      expect.objectContaining({ name: 'Aggressive Updated' })
    );

    fireEvent.click(screen.getByRole('button', { name: /Delete/i }));
    await waitFor(() => expect(mockDeleteArchetype).toHaveBeenCalledWith('aggressive'));
  });
});
