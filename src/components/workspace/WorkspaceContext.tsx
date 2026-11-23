import { createContext, useContext } from 'react';

/** Lets deep components (delivery cards) open the chat's side panel. */
export interface WorkspaceUI {
  openFile: (fileId: string, version?: number) => void;
  openFiles: () => void;
}

export const WorkspaceUIContext = createContext<WorkspaceUI | null>(null);

export function useWorkspaceUI(): WorkspaceUI | null {
  return useContext(WorkspaceUIContext);
}
