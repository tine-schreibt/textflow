import {
  App,
  ButtonComponent,
  DropdownComponent,
  Editor,
  MarkdownView,
  Notice,
  Plugin,
  setIcon,
  Setting,
} from "obsidian";
import {
  EditorView,
  Decoration,
  DecorationSet,
  ViewUpdate,
  ViewPlugin,
} from "@codemirror/view";
import { FlowService } from "./flowService";
import Fuse, { FuseResult } from "fuse.js";
import type TextFlowPlugin from "../main";
import * as Types from "./types";

interface ObsidianEditor extends Editor {
  cm?: EditorView;
}

export class MenuBar {
  private app: App;
  private element: HTMLElement;
  private plugin: TextFlowPlugin;
  private flowName: string;
  private associatedView: MarkdownView; // Store reference to our specific view
  private listeners: Array<{
    element: HTMLElement | Document;
    type: string;
    handler: EventListener;
  }> = [];
  flowService: FlowService;

  constructor(
    app: App,
    plugin: TextFlowPlugin,
    flow: string,
    view: MarkdownView
  ) {
    this.app = app;
    this.plugin = plugin;
    this.flowName = flow;
    this.associatedView = view;
    this.flowService = new FlowService(plugin, app);
    this.initialize();
  }

  // ------ uitilities
  private initialize() {
    // Remove any existing menu bar elements from the container first
    const existingMenuBars =
      this.associatedView.contentEl.getElementsByClassName("textflow-menu-bar");
    Array.from(existingMenuBars).forEach((el) => el.remove());

    // Create the element but don't attach it yet
    this.element = this.createMenuBarElement();
    this.element.dataset.flowPath = this.associatedView.file?.path;
  }

  public attach(containerEl: HTMLElement) {
    if (containerEl === this.associatedView.contentEl) {
      // First ensure the element isn't already attached somewhere
      this.detach();

      // Double-check for any other menu bars and remove them
      const existingMenuBars =
        containerEl.getElementsByClassName("textflow-menu-bar");
      Array.from(existingMenuBars).forEach((el) => el.remove());

      // Only prepend if the element exists and isn't already attached
      if (this.element && !this.element.parentNode) {
        containerEl.prepend(this.element);
      }
    }
  }

  private addManagedListener(
    element: HTMLElement | Document,
    type: string,
    handler: EventListener
  ) {
    this.listeners.push({ element, type, handler });
    element.addEventListener(type, handler);
  }

  private detachListeners() {
    this.listeners.forEach(({ element, type, handler }) => {
      element.removeEventListener(type, handler);
    });
    this.listeners = [];
  }

  public detach() {
    if (this.element && this.element.parentNode) {
      this.element.detach();
    }
  }

  public belongsToView(view: MarkdownView): boolean {
    return view === this.associatedView;
  }

  public refresh(containerEl: HTMLElement) {
    // First ensure the old element is detached
    this.detach();
    this.detachListeners();

    // Remove any other menu bars that might exist
    const existingMenuBars =
      containerEl.getElementsByClassName("textflow-menu-bar");
    Array.from(existingMenuBars).forEach((el) => el.remove());

    // Create new element with current state
    this.element = this.createMenuBarElement();

    // Reattach
    if (containerEl === this.associatedView.contentEl) {
      containerEl.prepend(this.element);
    }
  }

  public getFlowName(): string {
    return this.flowName;
  }

  // functions to set/get dropdown state, because the address is so fucking long
  private getDropdownState(dropdown: string) {
    const stateLeafID = (this.associatedView.leaf as any).id;

    if (dropdown === "nav") {
      return (
        this.plugin.settings.flows[this.flowName].activeRegions[stateLeafID]
          .leafMenuBarSettings.navDropdownState ?? "show"
      );
    }
    if (dropdown === "cursor")
      return (
        this.plugin.settings.flows[this.flowName].activeRegions[stateLeafID]
          .leafMenuBarSettings.cursorDropdownState ?? "show"
      );
  }

  private setDropdownState(dropdown: string, state: "show" | "hide") {
    const stateLeafID = (this.associatedView.leaf as any).id;
    if (
      dropdown === "nav" &&
      this.plugin.settings.flows[this.flowName].activeRegions[stateLeafID]
    ) {
      this.plugin.settings.flows[this.flowName].activeRegions[
        stateLeafID
      ].leafMenuBarSettings.navDropdownState = state;

      this.plugin.saveSettings();
    }
    if (
      dropdown === "cursor" &&
      this.plugin.settings.flows[this.flowName].activeRegions[stateLeafID]
    ) {
      this.plugin.settings.flows[this.flowName].activeRegions[
        stateLeafID
      ].leafMenuBarSettings.cursorDropdownState = state;

      this.plugin.saveSettings();
    }
  }

  // -------- FUNCTIONS AND VARIABLES TO MANAGE THE MENU BAR INTERNALLY
  // construct text for the dropdown option
  private makeNavPath = (path: string) => {
    let noteName = "";
    if (!path.startsWith("#")) {
      const pathArray = path.split("/");
      noteName = `${pathArray[pathArray.length - 1].replace(".md", "")}`;
    } else {
      noteName = `${path.replace("#", "")}`;
    }
    return noteName;
  };

  private scrollToPos(cursorPos: number) {
    const editor = this.associatedView.editor as ObsidianEditor;
    const cmEditor = editor.cm;
    let text = "";
    if (cmEditor) {
      text = cmEditor.state.doc.toString();
    }
    if (cursorPos !== undefined && cursorPos >= 0 && cmEditor) {
      const line = cmEditor.state.doc.lineAt(Math.max(0, cursorPos)); // Ensure position is not negative
      const targetPos = line.from; // Scroll to the beginning of the line
      cmEditor.dispatch({
        selection: { anchor: targetPos, head: targetPos },
        effects: EditorView.scrollIntoView(targetPos, {
          y: "center", // Center in viewport
          yMargin: 10, // Small margin
        }),
        userEvent: "select.pointer",
      });
      cmEditor.focus(); // Explicitly focus the editor
    }
  }

  private filterList: string[] = [];

  private createNavDropdownEntry(path: string, dropdownEntries: HTMLElement) {
    // get flowOrder (also to search for start of region)

    if (path === "No results") {
      const dropdownEntry = dropdownEntries.createDiv({
        cls: "menu-bar-navigation-dropdown-entries",
        text: "No results",
      });
    } else {
      const flowOrder =
        this.plugin.settings.flows[this.flowName].flowMap[path].flowOrder;

      // construct text for the dropdown entries
      let navPath = this.makeNavPath(path);

      if (this.filterList.length === 0 || this.filterList.includes(path)) {
        const dropdownEntry = dropdownEntries.createDiv({
          cls: path.startsWith("#") ? `text-emphasis align-off-center` : "",
          text: `- ${navPath}`,
        });

        this.addManagedListener(dropdownEntry, "click", (event) => {
          // scroll into view
          // Get the text content of the editor (needed to search for start of region)
          const editor = this.associatedView.editor as ObsidianEditor;
          const cmEditor = editor.cm;
          let text = "";
          if (cmEditor) {
            text = cmEditor.state.doc.toString();
          }

          const startPosInFlow = this.plugin.findStartOfRegion(
            this.plugin.settings.flows[this.flowName],
            flowOrder,
            text
          );

          if (startPosInFlow) {
            this.scrollToPos(startPosInFlow);
          }

          this.filterList = [];
          this.setDropdownState("nav", "hide");
          this.refresh(this.associatedView.contentEl);
        });
      }
    }
  }

  private refreshNavDropdownEntries(
    dropdownEntries: HTMLElement,
    emptyResults: boolean
  ) {
    // clear existing entries
    dropdownEntries.empty();

    if (emptyResults) {
      this.createNavDropdownEntry("No results", dropdownEntries);
    } else {
      // Re-create filtered entries
      const key = this.plugin.settings.flows[this.flowName].flowReceipe
        .bookmarks
        ? "bookmarks"
        : "foldersTagsProps";

      for (let path of this.plugin.settings.flows[this.flowName].flowReceipe[
        key
      ]) {
        this.createNavDropdownEntry(path, dropdownEntries);
      }
    }
  }

  // ----------- THE MENU BAR ITSELF

  createMenuBarElement(): HTMLElement {
    // ---------- FUNCTIONS -----------------
    // ----------- Preparatory checks
    let goSave = "neutral";
    let goRebuild = "neutral";

    // check if there is unsaved stuff for the flow
    if (
      this.plugin.settings.flows[this.flowName].unsavedRegionsArray.length > 0
    ) {
      goRebuild = "no-go";
      goSave = "must"; // must save
    }
    // check if flow is flagged for rebuild
    if (
      goSave === "neutral" &&
      this.plugin.settings.flows[this.flowName].flaggedForRebuild
    ) {
      goRebuild = "must";
      goSave = "no-go";
    }

    const menuBarEl = this.associatedView.contentEl.createDiv({
      cls: `textflow-menu-bar`,
    });

    // ----- SAVE BUTTON -----------
    const saveButton = new ButtonComponent(menuBarEl)
      .setIcon("download")
      .setClass(`flow-switch-modal-header-button-${goSave}`)
      .setClass("spacing")
      .setClass("button-shadow")
      .setClass("clickable-icon")
      .onClick(async () => {
        if (goSave === "neutral" || goSave === "must") {
          await this.plugin.saveAllLeavesManual();
          await this.plugin.saveSettings();
          this.refresh(this.associatedView.contentEl);
        } else {
          return;
        }
      });
    // ----------- REBUILD BUTTON ------------
    const rebuildButton = new ButtonComponent(menuBarEl)
      .setIcon("rotate-cw")
      .setClass(`flow-switch-modal-header-button-${goRebuild}`)
      .setClass("spacing")
      .setClass("button-shadow")
      .setClass("clickable-icon")
      .onClick(async () => {
        if (goRebuild === "neutral" || goRebuild === "must") {
          await this.flowService.rebuildFlow(this.flowName);
          await this.plugin.saveSettings();
          this.refresh(this.associatedView.contentEl);
        } else {
          return;
        }
      });

    // ----------- NAVIGATION DROPDOWN ------
    // get text for initial dropdown headline
    const hasActiveRegions =
      Object.keys(this.plugin.settings.flows[this.flowName].activeRegions)
        .length > 0;
    // get the path of the currently active region
    const navLeafID = (this.associatedView.leaf as any).id;
    let activeRegion: string | undefined = ""; // It's the only way to pacify the Red Squiggle Demon's wrath at path being explicitly typed as string | undefined
    if (
      hasActiveRegions &&
      navLeafID &&
      this.plugin.settings.flows[this.flowName].activeRegions[navLeafID].path
    ) {
      activeRegion =
        this.plugin.settings.flows[this.flowName].activeRegions[navLeafID].path;
    }
    let activeRegionNoteName = "";
    if (activeRegion) {
      activeRegionNoteName = this.makeNavPath(activeRegion);
    }
    // get the first thing in the flowReceipe
    const key = this.plugin.settings.flows[this.flowName].flowReceipe.bookmarks
      ? "bookmarks"
      : "foldersTagsProps";
    const firstThing =
      this.plugin.settings.flows[this.flowName].flowReceipe[key][0];
    const firstThingNoteName = this.makeNavPath(firstThing);

    // --------- The actual dropdown component ----------
    const navigationDropdown = menuBarEl.createDiv({
      cls: `menu-bar-navigation-dropdown spacing`,
    });

    const navHeadline = navigationDropdown.createDiv({
      cls: "menu-bar-navigation-dropdown-headline",
    });

    // headline text and icon
    navHeadline.createSpan({
      cls: "align-off-center",
      text:
        activeRegionNoteName === "" ? firstThingNoteName : activeRegionNoteName,
    });
    const iconSpan = navHeadline.createSpan();
    setIcon(iconSpan, "chevrons-down-up");

    this.addManagedListener(navHeadline, "click", (event) => {
      if (this.getDropdownState("nav") === "hide") {
        this.setDropdownState("nav", "show");
        this.refresh(this.associatedView.contentEl);
        const filterCriterion = this.element?.querySelector(
          ".menu-bar-navigation-dropdown-search-input"
        );
        if (filterCriterion) {
          (filterCriterion as HTMLInputElement).focus();
        }

        // Listener that will close dropdown if we click outside it
        this.addManagedListener(document, "click", (e: MouseEvent) => {
          const target = e.target as HTMLElement;
          // Check if click is outside the navigation dropdown
          if (!navigationDropdown.contains(target)) {
            this.filterList = [];
            this.setDropdownState("nav", "hide");
            this.refresh(this.associatedView.contentEl);
          }
        });
      } else {
        this.setDropdownState("nav", "hide");
        this.refresh(this.associatedView.contentEl);
      }
    });

    const dropdownGeneral = navigationDropdown.createDiv({
      cls: `menu-bar-navigation-dropdown-general ${this.getDropdownState(
        "nav"
      )}`,
    });
    const searchContainer = dropdownGeneral.createDiv({
      cls: "menu-bar-navigation-dropdown-search",
    });
    const searchInput = searchContainer.createEl("input", {
      cls: "menu-bar-navigation-dropdown-search-input",
      type: "text",
      placeholder: "Filter...",
    });

    const searchItems = this.plugin.settings.flows[this.flowName].flowReceipe[
      key
    ].map((path) => ({
      path: path,
      displayName: `${this.makeNavPath(path)}`,
    }));

    const fuse = new Fuse(searchItems, {
      keys: ["displayName"],
      threshold: 0.4,
      // We can tune these options
      includeScore: true,
      includeMatches: true,
    });

    this.addManagedListener(searchInput, "input", (event) => {
      const query = (event.target as HTMLInputElement).value;
      console.log(
        "Query value:",
        query,
        "Length:",
        query.length,
        "Type:",
        typeof query
      );

      // If no query (yet), return all paths
      if (!query) {
        this.filterList =
          this.plugin.settings.flows[this.flowName].flowReceipe[key];
      }

      // Otherwise return filtered paths
      this.filterList = fuse
        .search(query)
        .map((result) => (result as FuseResult<{ path: string }>).item.path);

      if (this.filterList.length === 0 && query != "") {
        // no entries because of failed filter
        this.refreshNavDropdownEntries(dropdownEntries, true);
      } else if (this.filterList.length > 0) {
        // entries because of successful filter
        this.refreshNavDropdownEntries(dropdownEntries, false);
      } else {
        // no entries because query has been deleted
        this.filterList =
          this.plugin.settings.flows[this.flowName].flowReceipe[key];
        this.refreshNavDropdownEntries(dropdownEntries, false);
      }
    });

    const navDropdownScrollable = dropdownGeneral.createDiv({
      cls: "menu-bar-navigation-dropdown-scrollable",
    });
    // the initial clickable list of entries
    const dropdownEntries = navDropdownScrollable.createDiv({
      cls: "menu-bar-navigation-dropdown-entries",
    });

    for (let path of this.plugin.settings.flows[this.flowName].flowReceipe[
      key
    ]) {
      this.createNavDropdownEntry(path, dropdownEntries);
    }

    // ------ The cursor stuff -----------------------------------

    const cursorContainer = menuBarEl.createDiv({
      cls: `menu-bar-cursor-container spacing`,
    });

    const cursorDropdown = cursorContainer.createDiv({
      cls: "menu-bar-navigation-dropdown",
    });

    const cursorHeadline = cursorDropdown.createDiv({
      cls: "menu-bar-navigation-dropdown-headline",
    });

    // headline text and icon
    cursorHeadline.createSpan({
      cls: "align-off-center",
      text:
        Object.keys(this.plugin.settings.flows[this.flowName].persistentCursors)
          .length > 0
          ? `Recent cursor history`
          : `No cursor history found`,
    });
    const cursorIconSpan = cursorHeadline.createSpan();
    setIcon(cursorIconSpan, "chevrons-down-up");

    // headline click opens dropdown
    this.addManagedListener(cursorHeadline, "click", (event) => {
      if (this.getDropdownState("cursor") === "hide") {
        this.setDropdownState("cursor", "show");
        this.refresh(this.associatedView.contentEl);
        const filterCriterion = this.element?.querySelector(
          ".menu-bar-navigation-dropdown-search-input"
        );
        if (filterCriterion) {
          (filterCriterion as HTMLInputElement).focus();
        }

        // Listener that will close dropdown if we click outside it
        this.addManagedListener(document, "click", (e: MouseEvent) => {
          const target = e.target as HTMLElement;
          // Check if click is outside the navigation dropdown
          if (!cursorDropdown.contains(target)) {
            this.filterList = [];
            this.setDropdownState("cursor", "hide");
            this.refresh(this.associatedView.contentEl);
          }
        });
      } else {
        this.setDropdownState("cursor", "hide");
        this.refresh(this.associatedView.contentEl);
      }
    });
    const cursorDropdownGeneral = cursorDropdown.createDiv({
      cls: `menu-bar-navigation-dropdown-general ${this.getDropdownState(
        "cursor"
      )}`,
    });

    // make scrollable container for the entries
    const cursorDropdownScrollable = cursorDropdownGeneral.createDiv({
      cls: `menu-bar-navigation-dropdown-scrollable`,
    });

    // Get all the timestamps to use a sorted array as ordering device
    const timestampArray: number[] = [];

    if (
      Object.keys(this.plugin.settings.flows[this.flowName].persistentCursors)
        .length > 0
    ) {
      Object.keys(
        this.plugin.settings.flows[this.flowName].persistentCursors
      ).forEach((leafID) => {
        timestampArray.push(
          this.plugin.settings.flows[this.flowName].persistentCursors[leafID]
            .update
        );
      });
      // sort the timestamps in reverse order so youngest timestamp comes first
      timestampArray.sort((a, b) => b - a);

      // Find out if we have data for the active leaf so we can show it at the top
      const cursorLeafID = (this.associatedView.leaf as any).id;

      if (
        this.plugin.settings.flows[this.flowName].persistentCursors[
          cursorLeafID
        ]
      ) {
        // create headline entry that's not clickable
        const cursorDropdownEntryDate = cursorDropdownScrollable.createDiv({
          cls: `text-emphasis align-off-center`,
          text: `${
            this.plugin.settings.flows[this.flowName].persistentCursors[
              cursorLeafID
            ].creationDateString
          }`,
        });

        // now iterate through the cursor positions that belong to the leaf
        const cursorArray =
          this.plugin.settings.flows[this.flowName].persistentCursors[
            cursorLeafID
          ].cursors;

        // create a div for each
        for (const [index, data] of cursorArray.entries()) {
          const textTimestamp =
            this.plugin.settings.flows[this.flowName].persistentCursors[
              cursorLeafID
            ].update;

          const cursorDropdownEntryPos = cursorDropdownScrollable.createDiv({
            cls: "blah",
            text: `${cursorArray[index][1]} - ${this.makeNavPath(data[0])}`,
          });
          const cursorPos = cursorArray[index][1];

          this.addManagedListener(cursorDropdownEntryPos, "click", (event) => {
            this.scrollToPos(cursorPos);
          });
        }
      }

      // get leaves by timestamp again, but exclude the current leaf
      for (let timestamp of timestampArray) {
        Object.keys(
          this.plugin.settings.flows[this.flowName].persistentCursors
        ).forEach((leafID) => {
          // skip the active leaf if present
          if (leafID != cursorLeafID) {
            if (
              this.plugin.settings.flows[this.flowName].persistentCursors[
                leafID
              ].update === timestamp
            ) {
              // create headline entry that's not clickable
              const cursorDropdownEntryDate =
                cursorDropdownScrollable.createDiv({
                  cls: `text-emphasis align-off-center`,
                  text: `${
                    this.plugin.settings.flows[this.flowName].persistentCursors[
                      leafID
                    ].creationDateString
                  }`,
                });

              // divs for the cursors
              const cursorArray =
                this.plugin.settings.flows[this.flowName].persistentCursors[
                  leafID
                ].cursors;

              for (const [index, data] of cursorArray.entries()) {
                const cursorDropdownEntryPos =
                  cursorDropdownScrollable.createDiv({
                    cls: `blah`,
                    text: `${cursorArray[index][1]} - ${this.makeNavPath(
                      data[0]
                    )}`,
                  });

                const cursorPos = cursorArray[index][1];

                // get cursor pos for target icon
                this.addManagedListener(
                  cursorDropdownEntryPos,
                  "click",
                  (event) => {
                    this.scrollToPos(cursorPos);
                  }
                );
              }
            }
          }
        });
      }

      // get the most recent cursor position for the cursor button
      const mostRecentTimestamp: number = timestampArray[0];
      let mostRecentCursor: number = 0;
      Object.keys(
        this.plugin.settings.flows[this.flowName].persistentCursors
      ).forEach((leafID) => {
        if (
          this.plugin.settings.flows[this.flowName].persistentCursors[leafID]
            .update === mostRecentTimestamp
        ) {
          mostRecentCursor =
            this.plugin.settings.flows[this.flowName].persistentCursors[leafID]
              .cursors[0][1];
        }
      });
      const cursorIconTarget = new ButtonComponent(cursorContainer);
      cursorIconTarget
        .setIcon("target")
        .setClass("cursor-target-button") // Add a specific class we can target
        .setTooltip(
          mostRecentCursor
            ? `Scroll to ${mostRecentCursor}`
            : "No cursor positions stored"
        )
        .onClick(() =>
          mostRecentCursor ? this.scrollToPos(mostRecentCursor) : ""
        );
    }

    // most recent cursor button
    // mostRecentCursor

    // there we go.
    return menuBarEl;
  }
}
