import { useEffect } from "react";
import {
  useLocation,
  useNavigationType,
  type Location,
} from "react-router-dom";
import { useUiLayoutStore } from "./ui-layout-store";

const getRouteKey = (location: Location) =>
  `${location.pathname}${location.search || ""}${location.hash || ""}`;

export function useRouteHistoryTracker() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const recordRoute = useUiLayoutStore((state) => state.recordRoute);

  useEffect(() => {
    recordRoute(getRouteKey(location), navigationType);
  }, [location, navigationType, recordRoute]);
}
