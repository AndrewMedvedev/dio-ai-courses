import { useSessionStore, type SessionState } from './session-store';

export function getPersistenceScope(
  state: SessionState = useSessionStore.getState(),
): string {
  const user = state.user;
  const owner = user?.id || user?.user_id || user?.userId || state.identity?.id;
  return JSON.stringify([
    owner || 'guest',
    state.organizationId || state.membershipId || 'personal',
  ]);
}

export const usePersistenceScope = () => useSessionStore(getPersistenceScope);
