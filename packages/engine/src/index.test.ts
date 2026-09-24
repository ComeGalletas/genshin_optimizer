import { ENGINE_PACKAGE } from './index';

describe('engine package', () => {
  it('exports its public surface', () => {
    expect(ENGINE_PACKAGE).toBe('@genshin-build-lab/engine');
  });
});
