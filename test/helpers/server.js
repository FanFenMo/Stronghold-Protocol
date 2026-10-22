// Isolate existing server tests from the user's persistent player database.
import { startServer as start } from '../../server/index.js';
import { ProfileStore } from '../../server/profiles.js';
export * from '../../server/index.js';

export function startServer(options = {}) {
  const profiles = options.profiles ?? new ProfileStore(':memory:');
  return start({ ...options, profiles });
}
