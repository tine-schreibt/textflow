//#######################################################################
//###########################                ############################
//###########################     types      ############################
//###########################                ############################
//#######################################################################

export interface TextFlowSettings {
  tempFolderPlace?: string;
  tempFolderHidden: boolean;
  flowLeafInFocus?: boolean;
  divider: string;
  activeFlows: string[];
  flows: { [key: string]: FlowDef };
}

export interface FlowDef {
  sourcePath: string;
  flowFileName: string;
  flowFilePath: string;
  flowActive: boolean;
  activeRegion: ActiveRegion;
  persistentCursorPos: number;
  modifiedRegionArray?: { [key: string]: ModifiedRegion };
  excludedFolders?: string[];
  includedMetaData?: { [key: string]: [value: string] };
  excludedMetaData?: { [key: string]: [value: string] };
  flowMap: { [key: string]: FlowMap };
}

export interface ActiveRegion {
  lastCursorPosition: number;
  path: string;
  UID: string;
  UIDPlain: number;
  startInFlow: number;
  endInFlow: number;
}

export interface ModifiedRegion {
  UID: string;
  modTime: number;
}

export interface FlowMap {
  type: "file" | "folder";
  path: string;
  itemName: string;
  UID: string;
  UIDPlain: number;
  lastModifiedInFlow: number;
  sourceLastModified?: number;
  minLength: number;
  lengthPlusDividers: number;
  startEndInFlow: { start: number; end: number };
  YAML: string;
}

export const DEFAULT_SETTINGS: TextFlowSettings = {
  tempFolderPlace: "",
  tempFolderHidden: true,
  divider: "***",
  activeFlows: [],
  flows: {},
};

export interface mapValueBasket {
  tempFileContents: string;
  currentStart: number;
  currentEnd: number;
  initialIteration: boolean;
  UIDCounter: number;
  UID: string;
}

export type ModalFlowStatus = "on" | "off" | "incompatible";
