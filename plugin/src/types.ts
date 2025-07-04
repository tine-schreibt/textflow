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
  explorerDecoStyle: string[];
  showExplorerDeco: boolean;
  explorerDecoDropdownOpen: boolean;
  explorerListener: boolean;
  hideScrollbar: boolean;
  switcherPos: string;
  generalMenuBarSettings: {
    isCollapsed?: boolean; // Current collapsed state
    flowName?: string;
  };
  flowBuildBasket: flowBuildBasket; // For storing preview data
  activeFlowObject: { [key: string]: number | any };
  flows: { [key: string]: FlowDef };
}

export type Mode = "flow" | "source";

export interface ModeSettings {
  explorerDeco: string[];
}

export interface FlowDef {
  timestamp: string;
  flowName: string;
  oldFlowName: string;
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
  explorerDecoStyle: [
    "○",
    "●",
    "font-size: 1.2em; color: var(--text-normal); font-family: monospace;",
    "font-size: 1.2em; color: var(--text-accent); font-family: monospace;",
  ],
  showExplorerDeco: true,
  explorerDecoDropdownOpen: false,
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

export type DecorationEntry = [string, string, string, string]; // if each inner array always has 3 elements

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
