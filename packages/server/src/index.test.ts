import { SERVER_ENGINE_DEPENDENCY } from './index';

describe('server package', () => {
  it('resolves the engine through the workspace', () => {
    expect(SERVER_ENGINE_DEPENDENCY).toBe('@genshin-build-lab/engine');
  });
});
