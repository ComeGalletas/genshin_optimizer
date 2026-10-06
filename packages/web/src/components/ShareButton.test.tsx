import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShareButton } from './ShareButton';

afterEach(() => vi.unstubAllGlobals());

const clipboard = (writeText: () => Promise<void>) =>
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

describe('ShareButton (TODO 8.3)', () => {
  it('copies the link', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    clipboard(writeText);
    render(
      <ShareButton label="Share" makeUrl={async () => 'https://x/?b=1'} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(writeText).toHaveBeenCalledWith('https://x/?b=1');
    expect(screen.getByRole('button', { name: 'Link Copied' })).toBeVisible();
  });

  it('shows the link to copy by hand when the clipboard refuses', async () => {
    clipboard(vi.fn().mockRejectedValue(new Error('denied')));
    render(
      <ShareButton label="Share" makeUrl={async () => 'https://x/#c=2'} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(screen.getByLabelText('Copy the link:')).toHaveValue(
      'https://x/#c=2',
    );
  });

  it('says why there is no link', async () => {
    const { unmount } = render(
      <ShareButton
        label="Share"
        makeUrl={async () => ({
          why: 'this comparison is too large for a link',
        })}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(
      screen.getByText('No link: this comparison is too large for a link.'),
    ).toBeVisible();
    unmount();
    render(
      <ShareButton
        label="Share"
        makeUrl={() => Promise.reject(new Error('no CompressionStream'))}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(
      screen.getByText('No link: this browser couldn’t make the link.'),
    ).toBeVisible();
  });
});
