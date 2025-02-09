//#######################################################################
//###########################                ############################
//###########################     types      ############################
//###########################                ############################
//#######################################################################

export interface TextFlowSettings {
  tempFolderPlace?: string;
  tempFolderHidden: boolean;
  flowLeafInFocus?: boolean;
  activeFlows: string[];
  divider: string;
  flows: { [key: string]: FlowDef };
}

export interface FlowDef {
  sourcePath: string;
  flowFileName: string;
  flowFilePath: string;
  activeRegionCache?: ActiveRegionCache;
  excludedFolders?: string[];
  includedMetaData?: { [key: string]: [value: string] };
  excludedMetaData?: { [key: string]: [value: string] };
  flowMap: { [key: string]: FlowMap };
}

export interface ActiveRegionCache {
  persistentCursorPos: number;
  lastCursorPosition: number;
  regions: {
    [offset: number]: RegionObject;
  };
}

export interface RegionObject {
  path: string;
  UID: string;
  UIDPlain: number;
  startInFlow: number;
  endInFlow: number;
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
}

export const DEFAULT_SETTINGS: TextFlowSettings = {
  tempFolderPlace: "",
  tempFolderHidden: true,
  activeFlows: [],
  divider: "***",
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

export type FlowStatus = "on" | "off" | "incompatible";
