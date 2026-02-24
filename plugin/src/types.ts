import type { FuseResult } from "fuse.js";
import { App, Editor } from "obsidian";
import { EditorView } from "@codemirror/view";
import { Compartment, Extension } from "@codemirror/state";

// --------------------------------------------------------------------------------
// TOC
// --------------------------------------------------------------------------------
// - TextFlowSettings
//    - ExternalEditsType
//    - DecorationEntry
//    - ActiveRegionHighlight
//    - flowBuildBasket
//       - ConflictObject
//       - CursorData
//    - FlowDef
//       - ActiveRegion
//       - SourceFileObject
// - DEFAULT_SETTINGS
// - mapValueBasket
//    - SortOrder
//    - ObsidianApp
//    - InternalPlugins
//    - BookmarkItem
//    - BookmarksData
// - DataviewFolder
//    - FolderGroup
//    - DVNote
// - MISC
//    - ProtectionType
//    - ObsidianEditor
//    - CalculationMode
//    - DecoStyle
//    - DropdownState
//    - MenuBarDisplayState
//    - SearchItem
//    - SearchResult
//    - SuggestionItem
//    - SuggestionType
// --------------------------------------------------------------------------------

// -------- OUR GENERAL SETTINGS
export interface TextFlowSettings {
  firstLaunch: boolean;
  systemFolderPath?: string;
  systemFolderHidden: boolean;
  checkExternalEdits: ExternalEditsType;
  hashes: { [key: string]: string }; // path: hash
  explorerDecoStyle: string[];
  activeRegionHighlight: string;
  explorerDecoDropdownOpen: boolean;
  explorerListener: boolean;
  hideScrollbar: string;
  switcherPos: string;
  flowBuildBasket: flowBuildBasket;
  activeRegions: { [key: string]: { [key: string]: ActiveRegion } }; // flowName[leafID] = ActiveRegion
  flows: { [key: string]: FlowDef };
}

// ---- sub-types of TextFlowSettings
export type ExternalEditsType = "no" | "mtime" | "mtime+hash" | "always hash";

export type DecorationEntry = [
  symbol1: string,
  symbol2: string,
  symbol1Class: string,
  symbol2Class: string,
];

export type ActiveRegionHighlight =
  | "bgAccent"
  | "bgMuted"
  | "olText"
  | "olMuted";

export interface flowBuildBasket {
  createOrEdit: string;
  dataviewSearchArray: [string, string][];
  success: boolean;
  flowName: string;
  oldFlowName: string;
  definitionMode: string;
  folderTitles: boolean;
  flowCookbook: { [key: string]: string };
  finalRecipe: string[];
  conflictObject: ConflictObject;
  lastActiveLeaves: string[];
  persistentCursors: CursorData;
}

// ---- subtypes of flowBuildBasket and FlowDef ------------
export interface ConflictObject {
  [key: string]: { [key: string]: boolean };
}

export interface CursorData {
  [leafID: string]: {
    //leafNickname: string;
    update: number; // timestamp
    cursors: [string, number, number][]; // path, cursorPos, timestamp
  };
}
// ------------------------------

export interface FlowDef {
  flowFilePath: string;
  definitionMode: string;
  flowCookbook: { [key: string]: string }; // user input
  folderTitles: boolean;
  isFreshBuild: boolean;
  flowBuilt: boolean;
  flaggedForRebuild: boolean;
  conflictObject: ConflictObject;
  persistentCursors: CursorData;
  lastActiveLeaves: string[]; // FLOWBUILDBASKET, RENAME
  unsyncedRegionsArray: string[];
  flowMap: { [key: string]: SourceFileObject };
}

// -------- subtypes of flowDef
export interface ActiveRegion {
  currentCursorPos: number;
  path: string;
  invisibleUUID: string;
  leafMenuBarSettings: {
    menuBarDisplayState: MenuBarDisplayState;
    navDropdownState: DropdownState;
    navDropdownSearchTerm: string | undefined;
    cursorDropdownState: DropdownState;
  };
}

export interface SourceFileObject {
  type: "file" | "folder";
  mtime: number;
  path: string;
  basicUUID: string;
  invisibleUUID: string;
  flowOrder: number;
}

// --------- them defaults --------------------
export const DEFAULT_SETTINGS: TextFlowSettings = {
  firstLaunch: true,
  systemFolderHidden: true,
  checkExternalEdits: "mtime",
  hashes: {},
  explorerDecoStyle: [
    "○",
    "●",
    "large-high-contrast-neutral",
    "large-high-contrast-unsynced",
  ],
  activeRegionHighlight: "bgAccent",
  explorerDecoDropdownOpen: false,
  explorerListener: true,
  hideScrollbar: "none",
  switcherPos: "statusBar",
  flowBuildBasket: {
    createOrEdit: "create",
    dataviewSearchArray: [],
    success: false,
    flowName: "",
    oldFlowName: "",
    definitionMode: "",
    folderTitles: true,
    flowCookbook: {},
    finalRecipe: [],
    conflictObject: {},
    lastActiveLeaves: [],
    persistentCursors: {},
  },
  activeRegions: {},
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

export type SortOrder = "noteOrder" | "folderOrder" | "custom";

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

// needed for scroll into view stuff
export interface ObsidianEditor extends Editor {
  cm?: EditorView;
}

// keeps all the listeners in one place
export interface ListenerBasketItem {
  [key: string]: {
    compartment: Compartment;
    extension: Extension;
    emptyReference: [];
  };
}

export interface EditorWithCM extends Editor {
  cm?: EditorView;
}

// for handling leaves
export type LeafId = string & { readonly __leafId: unique symbol };

// for the writelock
export type ProtectionType = "divider" | "sync";

// needed for scroll into view
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
