import type { FuseResult } from "fuse.js";
import { App, Editor, PluginManifest } from "obsidian";
import type { Plugin as ObsidianPlugin } from "obsidian";
import { EditorView } from "@codemirror/view";
import { Compartment, Extension } from "@codemirror/state";
import xxhash from "xxhash-wasm";

// --------------------------------------------------------------------------------
// TOC
// --------------------------------------------------------------------------------
// - TextFlowSettings
//    - ExternalEditsType
//    - DecorationEntry
//    - ActiveRegionHighlight
//    - flowBuildBasket
//       - overlapObject
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
  menuBarDefault: MenuBarDisplayState;
  menuBarTopMargin: string;
  switcherPos: string;
  hideScrollbar: string;
  embeds: boolean;
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
  embed: boolean;
  flowDefinition: { [key: string]: string };
  flowNotesPathArray: string[];
  overlapObject: OverlapObject;
  lastActiveLeaves: string[];
  persistentCursors: CursorData;
}

// ---- subtypes of flowBuildBasket and FlowDef ------------
export interface OverlapObject {
  [key: string]: boolean;
}

export interface CursorData {
  [leafID: string]: {
    //leafNickname: string;
    update: number; // timestamp
    cursors: [string, number, number][]; // path, cursorPos, timestamp
  };
}

export type definitionMode = "bookmarks" | "foldersTagsProps" | "dvQuery";

// ------------------------------
export interface FlowDef {
  flowFilePath: string;
  definitionMode: string;
  flowDefinition: { [key: string]: string }; // user input; is cleaned up when flow is built
  folderTitles: boolean;
  embed: boolean;
  isFreshBuild: boolean;
  flowBuilt: boolean;
  flaggedForRebuild: boolean;
  overlapObject: OverlapObject;
  persistentCursors: CursorData;
  lastActiveLeaves: string[];
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
  menuBarDefault: "max",
  menuBarTopMargin: "0",
  switcherPos: "statusBar",
  flowBuildBasket: {
    createOrEdit: "create",
    dataviewSearchArray: [],
    success: false,
    flowName: "",
    oldFlowName: "",
    definitionMode: "",
    folderTitles: true,
    embed: false,
    flowDefinition: {},
    flowNotesPathArray: [],
    overlapObject: {},
    lastActiveLeaves: [],
    persistentCursors: {},
  },
  hideScrollbar: "none",
  embeds: false,
  activeRegions: {},
  flows: {},
};

// ---- flow creation helper objects and utility types ------
export interface mapValueBasket {
  concatenatedFileContents: string;
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

// ------- Dataview stuff (flow source note path gathering)
export interface DataviewFolder {
  file: {
    folder: string;
  };
}

export interface FolderGroup {
  key: string;
  rows: DataviewFolder[];
}

//Reason: The dependency has those types; I can't change them
/* eslint-disable @typescript-eslint/no-explicit-any
 */
export type DVNote = Record<string, any> & {
  file: {
    path: string;
    tags: string[];
  };
  [key: string]: any;
};
/* eslint-enable @typescript-eslint/no-explicit-any
 */

// ---- other assorted types and interfaces

export type ActivationTuple = [boolean, boolean];

// needed for scroll into view stuff
export interface ObsidianEditor extends Editor {
  cm?: EditorView;
}

// keeps all the compartments and extensions in one place
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

// for handling leafIDs
export type LeafID = string & { readonly __leafID: unique symbol };

// explorer deco
export type CalculationMode = "update" | "single" | "redo";
export type DecoStyle = "neutral" | "active" | "unsynced" | "none";

// stuff that's used by the menuBar
export type DropdownState = "hide" | "show";
export type MenuBarDisplayState = "max" | "min";

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
  | "active-flow-path"
  | "other-flow-path"
  | "flow-name";

export type XXHashAPI = Awaited<ReturnType<typeof xxhash>>;

export type CleanArrayCollection = {
  cleanFolderInclusion: string[];
  cleanFolderExclusion: string[];
  cleanTagInclusion: string[];
  cleanTagExclusion: string[];
  cleanPropertiesInclusion: string[][];
  cleanPropertiesExclusion: string[][];
};

// -------------- Stuff I added while trying to please the linter. I'll sort them whenever I get the energy
export type PluginRegistry = {
  manifests: Record<string, PluginManifest>;
  plugins: Record<string, ObsidianPlugin>; // loaded/active instances
  enabledPlugins: Set<string>;
};
