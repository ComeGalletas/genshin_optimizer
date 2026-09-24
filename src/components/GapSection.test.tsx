import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GapSection } from './GapSection';
import { META_TARGETS } from '@genshin-build-lab/engine/meta/metaTargets';
import type {
  OptimizeRequest,
  OptimizeResult,
} from '@genshin-build-lab/engine/game/types';

const metaKey = Object.keys(META_TARGETS)[0];

function makeRequest(characterKey: string): OptimizeRequest {
  return {
    characterKey,
    weaponKey: 'w',
    buildLevel: 90,
    constraints: {},
    objective: 'crit_value',
  };
}

const emptyResult: OptimizeResult = {
  status: 'infeasible',
  explored: 0,
  pruned: 0,
};

describe('GapSection', () => {
  it('renders the gap report for a meta character on a fresh build', () => {
    render(
      <GapSection
        result={emptyResult}
        request={makeRequest(metaKey)}
        artifacts={[]}
        sharedArtifacts={null}
      />,
    );
    expect(screen.getByText('Gap vs Meta Build')).toBeInTheDocument();
  });

  it('renders a fallback note for a non-meta character', () => {
    render(
      <GapSection
        result={emptyResult}
        request={makeRequest('definitely-not-a-character')}
        artifacts={[]}
        sharedArtifacts={null}
      />,
    );
    expect(
      screen.getByText('No curated recipe for this character yet.'),
    ).toBeInTheDocument();
  });

  it('renders nothing when viewing a shared build', () => {
    const { container } = render(
      <GapSection
        result={emptyResult}
        request={makeRequest(metaKey)}
        artifacts={[]}
        sharedArtifacts={[]}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
