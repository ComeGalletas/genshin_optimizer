import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HelpButton, HelpHeading, HelpPanel } from './Help';
import { HELP, type HelpId } from './topics';
import { useHelpOpen } from './helpState';
import { Section } from '../landing';

afterEach(() => useHelpOpen.setState({ open: new Set() }));

describe('in-app help (TODO 9.6)', () => {
  it('opens a larger panel with the steps from a "?" button, and closes it again', async () => {
    render(
      <>
        <HelpButton id="optimise" />
        <HelpPanel id="optimise" />
      </>,
    );
    const button = screen.getByRole('button', {
      name: 'Help: Optimising a build',
    });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('region')).toBeNull();
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const panel = screen.getByRole('region', {
      name: 'Optimising a build: help',
    });
    expect(button).toHaveAttribute('aria-controls', panel.id);
    expect(within(panel).getAllByRole('listitem')[0]).toHaveTextContent(
      /Choose the character/,
    );
    await userEvent.click(within(panel).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('region')).toBeNull();
    // The button toggles too.
    await userEvent.click(button);
    await userEvent.click(button);
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('renders every topic with its title, intro, steps and tips', () => {
    useHelpOpen.setState({ open: new Set(Object.keys(HELP) as HelpId[]) });
    render(
      <>
        {(Object.keys(HELP) as HelpId[]).map((id) => (
          <HelpPanel key={id} id={id} />
        ))}
      </>,
    );
    for (const [id, t] of Object.entries(HELP)) {
      const panel = screen.getByRole('region', { name: `${t.title}: help` });
      expect(panel, id).toHaveTextContent(t.intro);
      const items = within(panel).queryAllByRole('listitem');
      const want =
        ('steps' in t ? (t.steps?.length ?? 0) : 0) +
        ('tips' in t ? (t.tips?.length ?? 0) : 0);
      expect(items, id).toHaveLength(want);
    }
  });

  it('puts the "?" beside a section’s title and the panel under its description', async () => {
    render(
      <Section
        title="Optimise"
        hint="An exact search."
        help="optimise"
        delay="0s"
      >
        <p>body</p>
      </Section>,
    );
    const heading = screen.getByRole('heading', { name: 'Optimise' });
    expect(heading.parentElement).toContainElement(
      screen.getByRole('button', { name: 'Help: Optimising a build' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Help: Optimising a build' }),
    );
    // Description first, then the help.
    const hint = screen.getByText('An exact search.');
    const panel = screen.getByRole('region', {
      name: 'Optimising a build: help',
    });
    expect(
      hint.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('gives a subsection heading its own "?"', async () => {
    render(
      <HelpHeading id="plan-joint" className="font-bold">
        Share the Pieces Jointly
      </HelpHeading>,
    );
    expect(
      screen.getByRole('heading', { name: 'Share the Pieces Jointly' }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Help: Sharing the pieces jointly' }),
    );
    expect(
      screen.getByRole('region', { name: 'Sharing the pieces jointly: help' }),
    ).toBeInTheDocument();
  });
});
