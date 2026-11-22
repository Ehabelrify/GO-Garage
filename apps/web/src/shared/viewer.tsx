import { createContext, useContext, type PropsWithChildren } from "react";

/** Who is looking at the page. Provided once by the shell; shared lists use it for per-user saved views and export gating. */
export interface Viewer { userId: string; role: string; isDemo: boolean }
const ViewerContext = createContext<Viewer | null>(null);

export function ViewerProvider({ viewer, children }: PropsWithChildren<{ viewer: Viewer | null }>) {
  return <ViewerContext.Provider value={viewer}>{children}</ViewerContext.Provider>;
}
export const useViewer = (): Viewer | null => useContext(ViewerContext);

/** Technicians never export lists. Without a viewer (tests, previews) nothing is offered. */
export const canExportLists = (viewer: Viewer | null): boolean => viewer !== null && viewer.role !== "technician";
