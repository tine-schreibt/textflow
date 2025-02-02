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
  lastCursorPosition: number;
  activeRegion: {
    path: string;
    start: number;
    end: number;
    type: string;
  };
  nextRegion?: {
    path: string;
    start: number;
    end: number;
    type: string;
  };
  previousRegion?: {
    path: string;
    start: number;
    end: number;
    type: string;
  };
}

export interface FlowMap {
  type: "file" | "folder";
  path: string;
  itemName: string;
  sourceLastModified?: number;
  lastModifiedInFlow: number;
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
}
