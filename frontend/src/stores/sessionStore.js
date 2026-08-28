import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  authenticateWithMembership,
  fetchIdentity,
  fetchCurrentUser,
  updateCurrentUser,
  uploadCurrentUserAvatar,
  login as loginApi,
  logout as logoutApi,
  readStoredSession,
  saveStoredSession,
  setTokenChangeHandler,
  setUnauthorizedHandler,
  isTokenExpired,
} from "../utils/api";

const initialStoredSession = readStoredSession();
const SESSION_CACHE_STORAGE_KEY = "aicolab-session-cache";
const SESSION_CACHE_VERSION = 1;
let identityRequestPromise = null;
let currentUserRequestPromise = null;

const initialState = {
  accessToken: initialStoredSession.accessToken,
  refreshToken: initialStoredSession.refreshToken,
  expiresAt: initialStoredSession.expiresAt,
  membershipId: initialStoredSession.membershipId,
  organizationId: initialStoredSession.organizationId,
  authenticationToken: null,
  memberships: [],
  identity: null,
  user: null,
  loginStep: "credentials",
  isLoading: false,
  error: null,
  validationErrors: {},
  hasHydrated: false,
};

function getOrganizationIdFromMembership(membership) {
  return (
    membership?.organization_id ||
    membership?.organization?.id ||
    membership?.organization?.organization_id ||
    null
  );
}

export const useSessionStore = create(
  persist(
    (set, get) => ({
      ...initialState,

      // Флаг не персистится: он отражает завершение гидратации в текущей вкладке.
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),

      get isAuthenticated() {
        const state = get();
        return Boolean(
          state.accessToken &&
          state.refreshToken &&
          state.expiresAt &&
          !isTokenExpired(state.expiresAt),
        );
      },

      setTokens: (tokens, context = {}) => {
        const nextSession = {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: tokens.expires_at,
          membershipId: context.membershipId || get().membershipId,
          organizationId: context.organizationId || get().organizationId,
        };

        saveStoredSession(nextSession);
        set({
          accessToken: nextSession.accessToken,
          refreshToken: nextSession.refreshToken,
          expiresAt: nextSession.expiresAt,
          membershipId: nextSession.membershipId,
          organizationId: nextSession.organizationId,
        });
      },

      loginWithCredentials: async ({ email, password }) => {
        set({ isLoading: true, error: null, validationErrors: {} });

        try {
          const data = await loginApi({ email, password });
          set({
            authenticationToken: data.authentication_token,
            memberships: Array.isArray(data.memberships)
              ? data.memberships
              : [],
            loginStep: "organization",
            isLoading: false,
            error: null,
            validationErrors: {},
          });
          return data;
        } catch (error) {
          set({
            isLoading: false,
            error:
              error.status === 401
                ? "Неверный email или пароль."
                : error.userMessage || error.message || "Не удалось войти.",
            validationErrors: error.validationErrors || {},
          });
          throw error;
        }
      },

      selectMembership: async (membershipId) => {
        const { authenticationToken, memberships, setTokens, loadIdentity } =
          get();
        const membership = memberships.find(
          (item) =>
            item?.id === membershipId || item?.membership_id === membershipId,
        );
        const normalizedMembershipId =
          membership?.id || membership?.membership_id || membershipId;
        const organizationId = getOrganizationIdFromMembership(membership);

        if (!authenticationToken) {
          const error = new Error(
            "Сессия выбора организации истекла. Войдите заново.",
          );
          set({ error: error.message, loginStep: "credentials" });
          throw error;
        }

        set({ isLoading: true, error: null, validationErrors: {} });

        try {
          const tokens = await authenticateWithMembership({
            authentication_token: authenticationToken,
            membership_id: normalizedMembershipId,
          });
          setTokens(tokens, {
            membershipId: normalizedMembershipId,
            organizationId,
          });
          set({
            authenticationToken: null,
            memberships: [],
            loginStep: "credentials",
          });
          await Promise.all([loadIdentity(), get().loadCurrentUser()]);
          set({ isLoading: false });
          return tokens;
        } catch (error) {
          const isExpiredSelection = error.status === 401;
          set({
            isLoading: false,
            error: isExpiredSelection
              ? "Сессия выбора организации истекла. Войдите заново."
              : error.userMessage ||
                error.message ||
                "Не удалось выбрать организацию.",
            validationErrors: error.validationErrors || {},
            authenticationToken: isExpiredSelection
              ? null
              : authenticationToken,
            memberships: isExpiredSelection ? [] : memberships,
            loginStep: isExpiredSelection ? "credentials" : "organization",
          });
          throw error;
        }
      },

      loadIdentity: async () => {
        if (!get().accessToken) return null;
        if (identityRequestPromise) return identityRequestPromise;

        identityRequestPromise = fetchIdentity()
          .then((identity) => {
            set({
              identity,
              membershipId: identity?.membership_id || get().membershipId,
              organizationId: identity?.organization_id || get().organizationId,
            });
            return identity;
          })
          .catch((error) => {
            if (error.status === 401) {
              get().clearSession();
              return null;
            }

            set({
              identity: null,
              error:
                error.userMessage ||
                error.message ||
                "Не удалось загрузить данные текущей сессии.",
            });
            return null;
          })
          .finally(() => {
            identityRequestPromise = null;
          });

        return identityRequestPromise;
      },

      loadCurrentUser: async () => {
        if (!get().accessToken) return null;
        if (currentUserRequestPromise) return currentUserRequestPromise;

        currentUserRequestPromise = fetchCurrentUser()
          .then((user) => {
            set({ user });
            return user;
          })
          .catch((error) => {
            if (error.status === 401) {
              get().clearSession();
              return null;
            }

            set({
              user: null,
              error:
                error.userMessage ||
                error.message ||
                "Не удалось загрузить профиль пользователя.",
            });
            return null;
          })
          .finally(() => {
            currentUserRequestPromise = null;
          });

        return currentUserRequestPromise;
      },

      resetOrganizationSelection: () =>
        set({
          authenticationToken: null,
          memberships: [],
          loginStep: "credentials",
          error: null,
          validationErrors: {},
        }),

      updateProfile: async (changes) => {
        set({ isLoading: true, error: null, validationErrors: {} });

        try {
          const user = await updateCurrentUser(changes);
          set({ user, isLoading: false, error: null, validationErrors: {} });
          return user;
        } catch (error) {
          set({
            isLoading: false,
            error:
              error.userMessage ||
              error.message ||
              "Не удалось обновить профиль.",
            validationErrors: error.validationErrors || {},
          });
          throw error;
        }
      },

      uploadAvatar: async (file) => {
        set({ isLoading: true, error: null, validationErrors: {} });

        try {
          const user = await uploadCurrentUserAvatar(file);
          set({ user, isLoading: false, error: null, validationErrors: {} });
          return user;
        } catch (error) {
          set({
            isLoading: false,
            error:
              error.userMessage ||
              error.message ||
              "Не удалось загрузить аватар.",
            validationErrors: error.validationErrors || {},
          });
          throw error;
        }
      },

      clearPersistedState: () => useSessionStore.persist.clearStorage(),

      clearSession: () => {
        identityRequestPromise = null;
        currentUserRequestPromise = null;
        saveStoredSession(null);
        set({
          accessToken: null,
          refreshToken: null,
          expiresAt: null,
          membershipId: null,
          organizationId: null,
          authenticationToken: null,
          memberships: [],
          identity: null,
          user: null,
          loginStep: "credentials",
          isLoading: false,
          error: null,
          validationErrors: {},
        });
        // set() сначала записывает очищенное состояние, затем удаляем сам ключ,
        // чтобы localStorage не накапливал пустые записи между сессиями.
        get().clearPersistedState();
      },

      logout: async () => {
        const { accessToken, refreshToken, clearSession } = get();

        try {
          if (accessToken && refreshToken) {
            await logoutApi({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
          }
        } catch {
          // Локальная очистка обязательна даже если сервер не ответил или уже отозвал токены.
        } finally {
          clearSession();
        }
      },
    }),
    {
      name: SESSION_CACHE_STORAGE_KEY,
      version: SESSION_CACHE_VERSION,
      // Токены, identity, ошибки и промежуточные данные логина намеренно исключены.
      partialize: (state) => ({
        user: state.user,
        membershipId: state.membershipId,
      }),
      migrate: (persistedState, version) => {
        if (version !== SESSION_CACHE_VERSION) {
          return { user: null, membershipId: null };
        }

        return persistedState;
      },
      merge: (persistedState, currentState) => {
        const cache = persistedState || {};
        const belongsToCurrentMembership =
          Boolean(currentState.membershipId) &&
          cache.membershipId === currentState.membershipId;

        return {
          ...currentState,
          // Не показываем профиль от другой организации/сессии.
          user: belongsToCurrentMembership ? cache.user || null : null,
        };
      },
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);

setTokenChangeHandler((session) => {
  useSessionStore.setState({
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expiresAt: session.expiresAt,
    membershipId: session.membershipId,
    organizationId: session.organizationId,
  });
});

setUnauthorizedHandler(() => {
  useSessionStore.getState().clearSession();
});
