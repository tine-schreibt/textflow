import type { FuseResult } from "fuse.js";
import { Editor } from "obsidian";
import { EditorView } from "@codemirror/view";

//#######################################################################
//###########################                ############################
//###########################     types      ############################
//###########################                ############################
//#######################################################################

export interface TextFlowSettings {
  activeVersion?: string;
  systemFolderPlace?: string;
  systemFolderPath?: string;
  advancedToggle: boolean;
  systemFolderHidden: boolean;
  mode: string;
  flowMode: FlowModeSettings;
  sourceMode: SourceModeSettings;
  explorerListener: boolean;
  hideScrollbar: boolean;
  switcherPos: string;
  generalMenuBarSettings: {
    isCollapsed?: boolean; // Current collapsed state
    flowName?: string;
  };
  flowBuildBasket: flowBuildBasket; // For storing preview data
  usedUIDs: string[];
  activeFlowObject: { [key: string]: number | any };
  flows: { [key: string]: FlowDef };
}

export interface FlowModeSettings {
  explorerDeco: boolean;
  flowDeco: boolean;
  sourceDeco: boolean;
  autoSave: boolean;
  context: boolean;
}

export interface SourceModeSettings {
  explorerDeco: boolean;
  flowDeco: boolean;
  sourceDeco: boolean;
}

export interface FlowDef {
  timestamp: string;
  flowName: string;
  flowFilePath: string;
  flowCookbook: { [key: string]: string }; // user input
  flowReceipe: { [key: string]: string[] };
  depthFirst: boolean;
  folderTitles: boolean;
  isFreshBuild: boolean;
  flowBuilt: boolean;
  flaggedForRebuild: boolean;
  conflictObject: ConflictObject;
  activeRegions: { [key: number | string]: ActiveRegion };
  persistentCursors: CursorData;
  unsavedRegionsArray: string[];
  flowMap: { [key: string]: SourceFileObject };
}

export interface ConflictObject {
  [key: string]: { [key: string]: boolean };
}

export interface ActiveRegion {
  currentCursorPos: number;
  type: string;
  path?: string;
  UID: string;
  flowOrder: number;
  startInFlow: number;
  endInFlow: number;
  leafMenuBarSettings: {
    menuBarDisplayState: MenuBarDisplayState;
    navDropdownState: DropdownState;
    cursorDropdownState: DropdownState;
  };
}

export interface CursorData {
  [leafID: string]: {
    creationDate: number;
    creationDateString: string;
    update: number;
    cursors: [string, number][]; // path, cursorPos
  };
}

export type DropdownState = "hide" | "show";
export type MenuBarDisplayState = "show" | "hide";

export interface SourceFileObject {
  type: "file" | "folder";
  path: string;
  itemName: string;
  UID: string;
  identifier: string;
  flowOrder: number;
  minLength: number;
  lengthPlusDividers: number;
  yamlMini: string;
}

// --------- them defaults --------------------
export const DEFAULT_SETTINGS: TextFlowSettings = {
  advancedToggle: false,
  systemFolderHidden: false,
  mode: "flow",
  flowMode: {
    explorerDeco: true,
    flowDeco: false,
    sourceDeco: true,
    autoSave: false,
    context: false,
  },
  sourceMode: {
    explorerDeco: true,
    flowDeco: true,
    sourceDeco: false,
  },
  explorerListener: true,
  hideScrollbar: false,
  switcherPos: "statusBar",
  generalMenuBarSettings: {
    isCollapsed: false, // Current collapsed state
  },
  flowBuildBasket: {
    createOrEditFlowName: "",
    oldFlowName: "",
    createOrEdit: "create",
    definitionMode: "",
    flowCookbook: {},
    cleanCookbook: {},
    finalReceipe: {},
    conflictObject: {},
    depthFirst: true,
    folderTitles: true,
    dataviewSearchPath: "",
    previewUsed: false,
    success: false,
    fresh: true,
  },
  usedUIDs: [],
  activeFlowObject: {},
  flows: {},
};

// ---- flow creation helper object --------
export interface mapValueBasket {
  concatenatedFileContents: string;
  initialIteration: boolean;
  identifier: string;
  flowOrder: number;
  UID: string;
  yamlMini: string;
  singleFileContent: string;
  currentEnd: number;
  usedUIDs: Set<string>; // Add this
  idDivider: string;
}

export interface flowBuildBasket {
  createOrEditFlowName: string;
  oldFlowName: string;
  createOrEdit: string;
  flowCookbook: { [key: string]: string };
  cleanCookbook: { [key: string]: string };
  finalReceipe: { [key: string]: string[] };
  conflictObject: ConflictObject;
  dataviewSearchPath: string;
  definitionMode: string;
  depthFirst: boolean;
  folderTitles: boolean;
  success: boolean;
  previewUsed: boolean;
  fresh: boolean;
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

export type SearchItem = { path: string; displayName: string };
export type SearchResult = SearchItem | FuseResult<SearchItem>;

// needed for scoll into view stuff    // needed for scoll into view stuff
export interface ObsidianEditor extends Editor {
  cm?: EditorView;
}
