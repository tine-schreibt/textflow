import type { FuseResult } from "fuse.js";
import { App, Editor } from "obsidian";
import { EditorView } from "@codemirror/view";

//#######################################################################
//###########################                ############################
//###########################     types      ############################
//###########################                ############################
//#######################################################################

// -------- OUR SETTINGS
export interface TextFlowSettings {
  firstLaunch: boolean;
  systemFolderPath?: string;
  systemFolderHidden: boolean;
  explorerDecoStyle: string[];
  showExplorerDeco: boolean;
  activeRegionHighlight: string;
  explorerDecoDropdownOpen: boolean;
  explorerListener: boolean;
  hideScrollbar: string;
  restoreCursor: boolean;
  switcherPos: string;
  showMenuBar: boolean;
  maxMenuBar: boolean;
  flowBuildBasket: flowBuildBasket;
  activeFlowObject: { [key: string]: { [key: string]: boolean } }; // flow Name[leafID] = boolean
  flows: { [key: string]: FlowDef };
}

// sub-types of TextFlowSettings

export type DecorationEntry = [
  symbol1: string,
  symbol2: string,
  symbol1Class: string,
  symbol2Class: string
];

export type ActiveRegionHighlight =
  | "bgAccent"
  | "bgMuted"
  | "olText"
  | "olMuted";

export interface flowBuildBasket {
  createOrEdit: string;
  dataviewSearchPath: string;
  success: boolean;
  flowName: string;
  oldFlowName: string;
  definitionMode: string;
  folderTitles: boolean;
  flowCookbook: { [key: string]: string };
  finalRecipe: { [key: string]: string[] };
  conflictObject: ConflictObject;
  activeRegions: { [key: number | string]: ActiveRegion };
  lastActiveLeaf: string;
  persistentCursors: CursorData;
}

// ---- subtypes of flowBuildBasket and FlowDef ------------
export interface ConflictObject {
  [key: string]: { [key: string]: boolean };
}

export interface CursorData {
  [leafID: string]: {
    leafNickname: string;
    update: number;
    cursors: [string, number][]; // path, cursorPos
  };
}
// ------------------------------

export interface FlowDef {
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
  lastActiveLeaf: string;
  unsyncedRegionsArray: string[];
  flowMap: { [key: string]: SourceFileObject };
}

// -------- subtypes of flowDef
export interface ActiveRegion {
  currentCursorPos: number;
  type: string;
  path?: string;
  invisibleUUID: string;
  flowOrder: number;
  startInFlow: number;
  endInFlow: number;
  leafMenuBarSettings: {
    menuBarDisplayState: MenuBarDisplayState;
    navDropdownState: DropdownState;
    cursorDropdownState: DropdownState;
  };
}

export interface SourceFileObject {
  type: "file" | "folder";
  path: string;
  itemName: string;
  basicUUID: string;
  invisibleUUID: string;
  flowOrder: number;
  minLength: number;
  lengthPlusDividers: number;
}

// --------- them defaults --------------------
export const DEFAULT_SETTINGS: TextFlowSettings = {
  firstLaunch: true,
  systemFolderHidden: false,
  explorerDecoStyle: [
    "○",
    "●",
    "font-size: 1.2em; color: var(--text-normal); font-family: monospace;",
    "font-size: 1.2em; color: var(--text-accent); font-family: monospace;",
  ],
  showExplorerDeco: true,
  activeRegionHighlight: "accent",
  explorerDecoDropdownOpen: false,
  explorerListener: true,
  hideScrollbar: "none",
  restoreCursor: true,
  switcherPos: "statusBar",
  showMenuBar: true,
  maxMenuBar: true,
  flowBuildBasket: {
    createOrEdit: "create",
    dataviewSearchPath: "",
    success: false,
    flowName: "",
    oldFlowName: "",
    definitionMode: "",
    folderTitles: true,
    flowCookbook: {},
    finalRecipe: {},
    conflictObject: {},
    activeRegions: {},
    lastActiveLeaf: "",
    persistentCursors: {},
  },
  activeFlowObject: {},
  flows: {},
};

// ---- flow creation helper objects and utility types ------
export interface mapValueBasket {
  concatenatedFileContents: string;
  initialIteration: boolean;
  basicUUID: string;
  invisibleUUID: string;
  flowOrder: number;
  singleFileContent: string;
  currentEnd: number;
  idDivider: string;
}

export type SortOrder = "depthFirst" | "filesFirst" | "custom";

// ------ used to get bookmarks (flow creation)
export interface ObsidianApp extends App {
  internalPlugins: InternalPlugins;
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

export interface BookmarkItem {
  type: "file" | "group";
  ctime?: number;
  path?: string;
  items?: BookmarkItem[];
  title?: string;
}

export interface BookmarksData {
  items: BookmarkItem[];
}

// ------- Dataview stuff (flow creation)
export interface DataviewFolder {
  file: {
    folder: string;
  };
}

export interface FolderGroup {
  key: string;
  rows: DataviewFolder[];
}

export type DVNote = {
  file: {
    path: string;
    tags: string[];
  };
  [key: string]: any;
};

// ---- other assorted types and interfaces

// for the writelock
export type ProtectionType = "divider" | "sync";

// needed for scoll into view
export interface ObsidianEditor extends Editor {
  cm?: EditorView;
}

// explorer deco
export type CalculationMode = "redo" | "update" | "single";

export type DecoStyle = "neutral" | "unsynced" | "none" | "active";

// stuff that's used by the menuBar
export type DropdownState = "hide" | "show";

export type MenuBarDisplayState = "show" | "hide";

// the nav dropdown
export type SearchItem = { path: string; displayName: string };

export type SearchResult = SearchItem | FuseResult<SearchItem>;

// the nav suggest modal
export interface SuggestionItem {
  type: SuggestionType;
  flowName: string;
  region: string | undefined;
  cursorPos?: number;
  leafID?: string;
  path?: string | undefined;
  searchableText: string;
}

export type SuggestionType =
  | "header"
  | "active-flow-path"
  | "active-flow-cursor"
  | "other-flow-path"
  | "other-flow-cursor"
  | "flow-name"
  | "active-region";
