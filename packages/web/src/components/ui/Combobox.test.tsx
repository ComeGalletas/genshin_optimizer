import { describe, it, expect, vi } from 'vitest';
import type { FormEvent } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Combobox } from './Combobox';

const OPTIONS = [
  { value: 'hu_tao', label: 'Hu Tao' },
  { value: 'raiden', label: 'Raiden Shogun' },
  { value: 'xiao', label: 'Xiao' },
];

describe('Combobox', () => {
  it('shows the selected label on the trigger button', () => {
    render(<Combobox options={OPTIONS} value="raiden" onChange={() => {}} />);
    expect(screen.getByRole('combobox')).toHaveTextContent('Raiden Shogun');
  });

  it('opens the dropdown when the trigger is clicked', async () => {
    render(<Combobox options={OPTIONS} value="hu_tao" onChange={() => {}} />);
    await userEvent.click(screen.getByRole('combobox'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('filters options case-insensitively as the user types', async () => {
    render(<Combobox options={OPTIONS} value="hu_tao" onChange={() => {}} />);
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.type(screen.getByRole('combobox'), 'xia');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option')).toHaveTextContent('Xiao');
  });

  it('shows "No results" when the query matches nothing', async () => {
    render(<Combobox options={OPTIONS} value="hu_tao" onChange={() => {}} />);
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.type(screen.getByRole('combobox'), 'zzz');
    expect(screen.getByText('No results')).toBeInTheDocument();
  });

  it('calls onChange with the selected value and closes the dropdown', async () => {
    const onChange = vi.fn();
    render(<Combobox options={OPTIONS} value="hu_tao" onChange={onChange} />);
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(screen.getByText('Xiao'));
    expect(onChange).toHaveBeenCalledWith('xiao');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('closes without selecting on Escape', async () => {
    const onChange = vi.fn();
    render(<Combobox options={OPTIONS} value="hu_tao" onChange={onChange} />);
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('navigates the list with arrow keys and selects with Enter', async () => {
    const onChange = vi.fn();
    render(<Combobox options={OPTIONS} value="hu_tao" onChange={onChange} />);
    await userEvent.click(screen.getByRole('combobox'));
    // activeIndex starts at 0 (Hu Tao); two ArrowDowns reach Xiao at index 2
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenCalledWith('xiao');
  });
});

describe('Combobox accessibility', () => {
  it('names the trigger and the search box after the field, not its value', async () => {
    render(
      <Combobox
        options={OPTIONS}
        value="raiden"
        onChange={() => {}}
        label="Character"
      />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Character' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(trigger);
    expect(
      screen.getByRole('combobox', { name: 'Character' }),
    ).toBeInTheDocument();
  });

  it('points aria-activedescendant at the option the arrow keys highlight', async () => {
    render(
      <Combobox
        options={OPTIONS}
        value="raiden"
        onChange={() => {}}
        label="Character"
      />,
    );
    await userEvent.click(screen.getByRole('combobox', { name: 'Character' }));
    const search = screen.getByRole('combobox', { name: 'Character' });
    const active = () =>
      document.getElementById(
        search.getAttribute('aria-activedescendant') ?? '',
      );
    // Opens on the current selection, not on option 0.
    expect(active()).toHaveTextContent('Raiden Shogun');
    await userEvent.keyboard('{ArrowDown}');
    expect(active()).toHaveTextContent('Xiao');
    await userEvent.keyboard('{ArrowUp}{ArrowUp}');
    expect(active()).toHaveTextContent('Hu Tao');
  });

  it('does not leave the empty state as a bare listbox child', async () => {
    render(
      <Combobox
        options={OPTIONS}
        value="raiden"
        onChange={() => {}}
        label="Character"
      />,
    );
    await userEvent.click(screen.getByRole('combobox', { name: 'Character' }));
    await userEvent.type(
      screen.getByRole('combobox', { name: 'Character' }),
      'zzz',
    );
    expect(screen.getByText('No results')).toHaveAttribute(
      'role',
      'presentation',
    );
    expect(
      screen.getByRole('combobox', { name: 'Character' }),
    ).not.toHaveAttribute('aria-activedescendant');
  });

  it('advertises the popup it owns from the collapsed trigger', async () => {
    const user = userEvent.setup();
    render(
      <Combobox
        options={OPTIONS}
        value="raiden"
        onChange={() => {}}
        label="Character"
      />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Character' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
    // No aria-controls while closed: the listbox it would name does not
    // exist yet, and a dangling idref is a broken relationship.
    expect(trigger).not.toHaveAttribute('aria-controls');
    await user.click(trigger);
    expect(screen.getByRole('combobox', { name: 'Character' })).toHaveAttribute(
      'aria-controls',
      screen.getByRole('listbox').id,
    );
  });

  it('does not submit the surrounding form when Enter matches nothing', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((e: FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Combobox
          options={OPTIONS}
          value="raiden"
          onChange={() => {}}
          label="Character"
        />
      </form>,
    );
    await user.click(screen.getByRole('combobox', { name: 'Character' }));
    await user.keyboard('zzzz');
    expect(screen.getByText('No results')).toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('opens on ArrowDown and ArrowUp from the collapsed trigger', async () => {
    render(
      <Combobox
        options={OPTIONS}
        value="raiden"
        onChange={() => {}}
        label="Character"
      />,
    );
    screen.getByRole('combobox', { name: 'Character' }).focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('adopts a caller-supplied id so a sibling <label> can target it', async () => {
    render(
      <>
        <label htmlFor="cb-set">Set</label>
        <Combobox
          id="cb-set"
          options={OPTIONS}
          value="raiden"
          onChange={() => {}}
          label="Set"
        />
      </>,
    );
    expect(screen.getByRole('combobox', { name: 'Set' })).toHaveAttribute(
      'id',
      'cb-set',
    );
    // The open state swaps button for input at the same position; the id has
    // to travel with it or the label stops pointing at anything.
    await userEvent.click(screen.getByRole('combobox', { name: 'Set' }));
    expect(screen.getByRole('combobox', { name: 'Set' })).toHaveAttribute(
      'id',
      'cb-set',
    );
  });

  it('exposes the dropdown as a listbox with a selected option', async () => {
    render(
      <Combobox
        options={OPTIONS}
        value="raiden"
        onChange={() => {}}
        label="Character"
      />,
    );
    await userEvent.click(screen.getByRole('combobox', { name: 'Character' }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Raiden Shogun' }),
    ).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: 'Xiao' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('returns focus to the trigger after selecting an option', async () => {
    render(<Combobox options={OPTIONS} value="hu_tao" onChange={() => {}} />);
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(screen.getAllByRole('option')[0]);
    expect(screen.getByRole('combobox')).toHaveFocus();
  });

  it('returns focus to the trigger after Escape', async () => {
    render(<Combobox options={OPTIONS} value="hu_tao" onChange={() => {}} />);
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('combobox')).toHaveFocus();
  });

  it('closes the listbox when focus leaves the component', async () => {
    render(
      <>
        <Combobox options={OPTIONS} value="hu_tao" onChange={() => {}} />
        <button>after</button>
      </>,
    );
    await userEvent.click(screen.getByRole('combobox'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await userEvent.tab();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
