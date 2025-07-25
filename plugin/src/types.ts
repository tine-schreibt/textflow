import type { FuseResult } from "fuse.js";
import { App, Editor } from "obsidian";
import { EditorView } from "@codemirror/view";

//#######################################################################
//###########################                ############################
//###########################     types      ############################
//###########################                ############################
//#######################################################################

export interface FlowNameValidation {
  valid: boolean;
  reason?: string;
}

interface InternalPlugins {
  plugins: {
    bookmarks: {
      instance: {
        items: BookmarkItem[];
      };
    };
  };
}

export interface ObsidianApp extends App {
  internalPlugins: InternalPlugins;
}

export interface TextFlowSettings {
  firstLaunch: boolean;
  activeVersion?: string;
  systemFolderPath?: string;
  advancedToggle: boolean;
  systemFolderHidden: boolean;
  explorerDecoStyle: string[];
  showExplorerDeco: boolean;
  explorerDecoDropdownOpen: boolean;
  explorerListener: boolean;
  hideScrollbar: string;
  switcherPos: string;
  showMenuBar: boolean;
  maxMenuBar: boolean;
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
  flowFilePath: string;
  definitionMode: string;
  flowCookbook: { [key: string]: string }; // user input
  flowRecipe: { [key: string]: string[] };
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
  //conflictObject[flowName][path] = true;
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
}

// --------- them defaults --------------------
export const DEFAULT_SETTINGS: TextFlowSettings = {
  firstLaunch: true,
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
  hideScrollbar: "none",
  switcherPos: "statusBar",
  showMenuBar: true,
  maxMenuBar: true,
  flowBuildBasket: {
    createOrEdit: "create",
    dataviewSearchPath: "",
    previewUsed: false,
    success: false,
    flowName: "",
    definitionMode: "",
    folderTitles: true,
    flowCookbook: {},
    finalRecipe: {},
    conflictObject: {},
    activeRegions: {},
    persistentCursors: {},
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
  singleFileContent: string;
  currentEnd: number;
  idDivider: string;
}

export interface flowBuildBasket {
  // Processing flags and temporary data
  createOrEdit: string;
  dataviewSearchPath: string;
  previewUsed: boolean;
  success: boolean;
  flowName: string;
  definitionMode: string;
  folderTitles: boolean;
  flowCookbook: { [key: string]: string };
  finalRecipe: { [key: string]: string[] };
  conflictObject: ConflictObject;
  activeRegions: { [key: number | string]: ActiveRegion };
  persistentCursors: CursorData;
}

// ---------- Flow management
export type ModalFlowStatus = "on" | "off" | "incompatible";

export type SortOrder = "depthFirst" | "filesFirst" | "custom";

export type DecorationEntry = [
  symbol1: string,
  symbol2: string,
  symbol1Class: string,
  symbol2Class: string
];

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
  ctime?: number;
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
interface FlowCookbook {
  definitionMode: "bookmarks" | "foldersTagsProps";
  bookmarks?: string;
  foldersTagsProps?: string;
  // ... other properties
}

export type ProtectionType = "divider" | "sync";

export type CalculationMode = "redo" | "update";

export type DecoStyle = "neutral" | "unsynced" | "none";

