//#######################################################################
//###########################                ############################
//###########################     types      ############################
//###########################                ############################
//#######################################################################

export interface TextFlowSettings {
  tempFolderPlace?: string;
  tempFolderHidden: boolean;
  flowLeafInFocus?: boolean;
  autoSave: boolean;
  activeFlows: string[];
  flagForRebuild: string[];
  flows: { [key: string]: FlowDef };
}

export interface FlowDef {
  sourcePath: string;
  flowFileName: string;
  flowFilePath: string;
  flowActive: boolean;
  activeRegion: ActiveRegion;
  persistentCursorPos: number;
  modifiedRegionsArray: string[];
  excludedFolders?: string[];
  includedMetaData?: { [key: string]: [value: string] };
  excludedMetaData?: { [key: string]: [value: string] };
  flowMap: { [key: string]: SourceFileObject };
}

export interface ActiveRegion {
  lastCursorPosition: number;
  type: string;
  path: string;
  UID: string;
  flowOrder: number;
  startInFlow: number;
  endInFlow: number;
}

export interface ModifiedRegion {
  UID: string;
  modTime: number;
}

export interface SourceFileObject {
  type: "file" | "folder";
  path: string;
  itemName: string;
  UID: string;
  timestamp: number;
  flowOrder: number;
  minLength: number;
  lengthPlusDividers: number;
  startEndInFlow: { start: number; end: number };
  yamlMini: string;
}

export const DEFAULT_SETTINGS: TextFlowSettings = {
  tempFolderPlace: "",
  tempFolderHidden: true,
  autoSave: true,
  activeFlows: [],
  flagForRebuild: [],
  flows: {},
};

export interface mapValueBasket {
  concatenatedFileContents: string;
  initialIteration: boolean;
  timestamp: number;
  flowOrder: number;
  UID: string;
  yamlMini: string;
  singleFileContent: string;
  currentEnd: number;
  idDivider: string;
}

export type ModalFlowStatus = "on" | "off" | "incompatible";
