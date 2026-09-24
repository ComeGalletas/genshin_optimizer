import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArtifactForm } from './ArtifactForm';
import { useInventory } from '../state/inventory';

describe('ArtifactForm', () => {
  beforeEach(() => useInventory.getState().clear());

  it('adds a valid artifact to the inventory', async () => {
    render(<ArtifactForm />);
    await userEvent.click(screen.getByText(/add artifact/i));
    expect(useInventory.getState().artifacts.length).toBe(1);
  });

  it('ties the sub-stat caveat to the Main stat field via aria-describedby', () => {
    render(<ArtifactForm />);
    const mainStat = screen.getByLabelText(/main stat/i);
    const caveat = screen.getByText(/carry no sub-stats yet/i);
    expect(mainStat).toHaveAttribute('aria-describedby', caveat.id);
  });

  it('shows an error for level out of range', async () => {
    render(<ArtifactForm />);
    const level = screen.getByLabelText(/Level/i);
    await userEvent.clear(level);
    await userEvent.type(level, '25');
    await userEvent.click(screen.getByText(/add artifact/i));
    // Two persistent alert regions exist (level + submit banner, see Finding
    // 1 fix) — this path collapses to the level message on both.
    const alerts = screen.getAllByRole('alert');
    expect(
      alerts.some((a) => a.textContent === 'Level must be between 0 and 20.'),
    ).toBe(true);
  });

  it('flags an out-of-range level on blur and links the message to the field', async () => {
    const user = userEvent.setup();
    render(<ArtifactForm />);
    const level = screen.getByLabelText(/level/i);
    await user.clear(level);
    await user.type(level, '25');
    await user.tab();
    // The visible message (id="level-error") is what aria-describedby
    // points at; the announcement itself lives in a separate persistent
    // sr-only region (see Finding 1 fix), so it carries no id to compare.
    expect(level).toHaveAttribute('aria-describedby', 'level-error');
    const visibleError = document.getElementById('level-error');
    expect(visibleError).toHaveTextContent(/between 0 and 20/i);
    const alerts = await screen.findAllByRole('alert');
    expect(
      alerts.some((a) => /between 0 and 20/i.test(a.textContent ?? '')),
    ).toBe(true);
  });

  it('shows both the inline field error and the submit banner when the level field was never blurred', async () => {
    const user = userEvent.setup();
    const { container } = render(<ArtifactForm />);
    const level = screen.getByLabelText(/level/i);
    await user.clear(level);
    await user.type(level, '25');
    // Submit the form directly rather than clicking the button: a click
    // would blur the level field first, setting `levelError` to the same
    // message as the submit-time `error` and collapsing this down to a
    // single alert (already covered by the test above). Firing `submit`
    // keeps focus on the field, so `levelError` stays null while `error`
    // does not — the one path where the banner and inline message disagree.
    fireEvent.submit(container.querySelector('form')!);
    // The inline hint (no error role) stays put since `levelError` is still
    // null, while the submit-time banner is the one that gains text — the
    // `error !== levelError` banner path this test targets. Both persistent
    // alert regions exist throughout (see Finding 1 fix); only the banner's
    // gains this text.
    const alerts = await screen.findAllByRole('alert');
    expect(
      alerts.some((a) => /between 0 and 20/i.test(a.textContent ?? '')),
    ).toBe(true);
    expect(screen.getByText(/0 to 20\./i)).toBeInTheDocument();
    expect(useInventory.getState().artifacts.length).toBe(0);
  });

  it('changes slot and main stat via their selects', async () => {
    const user = userEvent.setup();
    render(<ArtifactForm />);
    await user.selectOptions(screen.getByLabelText(/slot/i), 'goblet');
    expect(screen.getByLabelText(/slot/i)).toHaveValue('goblet');
    await user.selectOptions(
      screen.getByLabelText(/main stat/i),
      'elemental_dmg',
    );
    expect(screen.getByLabelText(/main stat/i)).toHaveValue('elemental_dmg');
  });

  it('reveals the element select for a goblet with an elemental dmg main stat, and includes it in the added artifact', async () => {
    const user = userEvent.setup();
    render(<ArtifactForm />);
    await user.selectOptions(screen.getByLabelText(/slot/i), 'goblet');
    await user.selectOptions(
      screen.getByLabelText(/main stat/i),
      'elemental_dmg',
    );
    const elementSelect = await screen.findByLabelText(/element/i);
    await user.selectOptions(elementSelect, 'pyro');
    expect(elementSelect).toHaveValue('pyro');

    await user.click(screen.getByText(/add artifact/i));
    const [artifact] = useInventory.getState().artifacts;
    expect(artifact.element).toBe('pyro');
  });

  it('omits element when left at "Any (unknown)" even on a goblet/elemental_dmg piece', async () => {
    const user = userEvent.setup();
    render(<ArtifactForm />);
    await user.selectOptions(screen.getByLabelText(/slot/i), 'goblet');
    await user.selectOptions(
      screen.getByLabelText(/main stat/i),
      'elemental_dmg',
    );
    await user.click(screen.getByText(/add artifact/i));
    const [artifact] = useInventory.getState().artifacts;
    expect(artifact.element).toBeUndefined();
  });

  it('announces the added artifact via the success Callout and live region, then resets the form', async () => {
    const user = userEvent.setup();
    render(<ArtifactForm />);
    await user.click(screen.getByText(/add artifact/i));
    expect(
      screen.getAllByText(/added:.*inventory now 1/i).length,
    ).toBeGreaterThan(0);
    // Fields reset to their defaults after a successful add.
    expect(screen.getByLabelText(/slot/i)).toHaveValue('sands');
  });
});
