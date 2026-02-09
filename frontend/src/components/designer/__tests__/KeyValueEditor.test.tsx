import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import KeyValueEditor from '../KeyValueEditor';

describe('KeyValueEditor', () => {
  it('renders existing entries', () => {
    render(
      <KeyValueEditor
        label="Test"
        data={{ alpha: 1.5, beta: 0.3 }}
        onChange={() => {}}
      />
    );
    expect(screen.getByText('alpha')).toBeTruthy();
    expect(screen.getByText('beta')).toBeTruthy();
  });

  it('calls onChange when a value is updated', () => {
    const onChange = vi.fn();
    render(
      <KeyValueEditor
        label="Test"
        data={{ alpha: 1.0 }}
        onChange={onChange}
      />
    );
    const input = screen.getByDisplayValue('1');
    fireEvent.change(input, { target: { value: '2.5' } });
    expect(onChange).toHaveBeenCalledWith({ alpha: 2.5 });
  });

  it('adds a new key', () => {
    const onChange = vi.fn();
    render(
      <KeyValueEditor
        label="Test"
        data={{ alpha: 1.0 }}
        onChange={onChange}
      />
    );
    const keyInput = screen.getByPlaceholderText('key');
    fireEvent.change(keyInput, { target: { value: 'gamma' } });
    fireEvent.keyDown(keyInput, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith({ alpha: 1.0, gamma: 0 });
  });

  it('removes a key', () => {
    const onChange = vi.fn();
    render(
      <KeyValueEditor
        label="Test"
        data={{ alpha: 1.0, beta: 2.0 }}
        onChange={onChange}
      />
    );
    // Find remove buttons (X icons)
    const removeButtons = screen.getAllByRole('button');
    // First two are the remove buttons for alpha and beta, last is the add button
    fireEvent.click(removeButtons[0]);
    expect(onChange).toHaveBeenCalledWith({ beta: 2.0 });
  });

  it('does not add duplicate keys', () => {
    const onChange = vi.fn();
    render(
      <KeyValueEditor
        label="Test"
        data={{ alpha: 1.0 }}
        onChange={onChange}
      />
    );
    const keyInput = screen.getByPlaceholderText('key');
    fireEvent.change(keyInput, { target: { value: 'alpha' } });
    fireEvent.keyDown(keyInput, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
  });
});
