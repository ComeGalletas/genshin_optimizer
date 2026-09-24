import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Segmented } from './Segmented';

const OPTIONS = ['One', 'Two', 'Three'] as const;

function setup(value: (typeof OPTIONS)[number] = 'One') {
  const onChange = vi.fn();
  render(
    <Segmented
      options={OPTIONS}
      value={value}
      onChange={onChange}
      label="Example"
    />,
  );
  return onChange;
}

describe('Segmented', () => {
  it('exposes one tab stop: only the selected item is reachable by Tab', () => {
    setup('Two');
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute(
      'tabindex',
      '0',
    );
    expect(screen.getByRole('tab', { name: 'One' })).toHaveAttribute(
      'tabindex',
      '-1',
    );
  });

  it('moves DOM focus along with the selection on arrow keys', async () => {
    const user = userEvent.setup();
    const onChange = setup();
    screen.getByRole('tab', { name: 'One' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenCalledWith('Two');
    // The bug this control exists to prevent: aria-selected moving while
    // focus stays behind on the item that is no longer selected.
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveFocus();
  });

  it('wraps at both ends and jumps with Home/End', async () => {
    const user = userEvent.setup();
    const onChange = setup();
    screen.getByRole('tab', { name: 'One' }).focus();
    await user.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenLastCalledWith('Three');
    await user.keyboard('{End}');
    expect(onChange).toHaveBeenLastCalledWith('Three');
    await user.keyboard('{Home}');
    expect(onChange).toHaveBeenLastCalledWith('One');
  });

  it('leaves Up/Down alone so a scrollable parent still scrolls', async () => {
    const user = userEvent.setup();
    const onChange = setup();
    screen.getByRole('tab', { name: 'One' }).focus();
    await user.keyboard('{ArrowDown}');
    expect(onChange).not.toHaveBeenCalled();
  });
});
