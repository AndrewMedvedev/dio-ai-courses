import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useSessionStore } from "../stores/sessionStore";

function buildRedirect(location) {
  return `${location.pathname}${location.search}`;
}

export default function ProtectedRoute({ children }) {
  const location = useLocation();
  const accessToken = useSessionStore((state) => state.accessToken);
  const refreshToken = useSessionStore((state) => state.refreshToken);
  const membershipId = useSessionStore((state) => state.membershipId);
  const organizationId = useSessionStore((state) => state.organizationId);
  const isAuthenticated = Boolean(accessToken && refreshToken);

  if (!isAuthenticated) {
    return (
      <Navigate
        to={`/login?redirect=${encodeURIComponent(buildRedirect(location))}`}
        replace
      />
    );
  }

  if (!membershipId && !organizationId) {
    return (
      <Navigate
        to={`/login?redirect=${encodeURIComponent(buildRedirect(location))}`}
        replace
      />
    );
  }

  return children || <Outlet />;
}
