//#######################################################################
//###########################                ############################
//###########################     types      ############################
//###########################                ############################
//#######################################################################

export interface TextFlowSettings {
  systemFolderPlace?: string;
  systemFolderPath?: string;
  systemFolderHidden: boolean;
  flowBuildBasket: flowBuildBasket; // For storing preview data
  flowLeafInFocus?: boolean;
  autoSave: boolean;
  activeFlows: string[];
  dismissedSourceWarnings: Record<string, boolean>;
  flagForRebuild: string[];
  flows: { [key: string]: FlowDef };
}

export interface FlowDef {
  flowCookbook: { [key: string]: string }; // user input
  flowReceipe: { [key: string]: string[] }; // paths
  depthFirst: boolean;
  isFreshBuild: boolean;
  flowName: string;
  flowFilePath: string;
  flowBuilt: boolean;
  flowActive: boolean;
  activeRegion: ActiveRegion;
  persistentCursorPos: number;
  modifiedRegionsArray: string[];
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

// --------- them defaults --------------------
export const DEFAULT_SETTINGS: TextFlowSettings = {
  systemFolderHidden: false,
  flowBuildBasket: {
    fbbCreateOrEditFlowName: "",
    fbbCreateOrEdit: "",
    fbbDefinitionMode: "",
    fbbDepthFirst: true,
    fbbFlowCookbook: {},
    fbbCleanCookbook: {},
    fbbDataviewSearchPath: "",
    fbbSuccess: false,
    fbbFresh: true,
  },
  autoSave: true,
  activeFlows: [],
  dismissedSourceWarnings: {},
  flagForRebuild: [],
  flows: {},
};

// ---- flow creation helper object --------
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

export interface flowDefBasket {
  createOrEditFlowName: string;
  definitionMode: string;
  depthFirst: boolean;
  flowCookbook: { [key: string]: string };
  cleanCookbook: { [key: string]: string };
  previewUsed: boolean;
}

export interface flowBuildBasket {
  fbbCreateOrEditFlowName: string;
  fbbCreateOrEdit: string;
  fbbDefinitionMode: string;
  fbbDepthFirst: boolean;
  fbbFlowCookbook: { [key: string]: string };
  fbbCleanCookbook: { [key: string]: string };
  fbbDataviewSearchPath: string;
  fbbSuccess: boolean;
  fbbFresh: boolean;
}

// ---------- Flow management
export type ModalFlowStatus = "on" | "off" | "incompatible";

// ------- Dataview stuff
export interface DataviewFolder {
  file: {
    folder: string;
  };
}

export interface FolderGroup {
  key: string;
  rows: DataviewFolder[];
}

// -----------------------
export interface BookmarkItem {
  type: "file" | "group";
  ctime: number;
  path?: string; // only for type "file"
  items?: BookmarkItem[]; // only for type "group"
  title?: string; // only for type "group"
}

export interface BookmarksData {
  items: BookmarkItem[];
}

export type DVNote = {
  file: {
    path: string;
    tags: string[]; // or string, depending on your Dataview config
    // ...other file fields if needed
  };
  // Properties: these are dynamic, so use an index signature
  [key: string]: any;
};
