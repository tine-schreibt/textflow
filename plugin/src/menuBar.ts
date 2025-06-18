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
import Fuse from "fuse.js";
import type TextFlowPlugin from "../main";
import * as Types from "./types";
import type { FuseResult } from "fuse.js";

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
    element: HTMLElement;
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
    element: HTMLElement,
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
  private getDropdownState(): "show" | "hide" {
    const leafID = (this.associatedView.leaf as any).id;
    return (
      this.plugin.settings.flows[this.flowName].activeRegions[leafID]
        .leafMenuBarSettings.dropdownState ?? "show"
    );
  }

  private setDropdownState(state: "show" | "hide") {
    const leafID = (this.associatedView.leaf as any).id;
    if (this.plugin.settings.flows[this.flowName].activeRegions[leafID]) {
      this.plugin.settings.flows[this.flowName].activeRegions[
        leafID
      ].leafMenuBarSettings.dropdownState = state;
      this.plugin.saveSettings();
    }
  }

  // -------- FUNCTIONS AND VARIABLES TO MANAGE THE MENU BAR INTERNALLY
  // construct text for the dropdown option
  private makeNavPath = (path: string) => {
    let noteName = "";
    if (!path.startsWith("#")) {
      const pathArray = path.split("/");
      noteName = `- ${pathArray[pathArray.length - 1].replace(".md", "")}`;
    } else {
      noteName = `${path.replace("#", "")}`;
    }
    return noteName;
  };

  private filterList: string[] = [];

  private createDropdownEntry(path: string, dropdownEntries: HTMLElement) {
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
          text: navPath,
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

          if (startPosInFlow !== undefined && startPosInFlow >= 0 && cmEditor) {
            const line = cmEditor.state.doc.lineAt(Math.max(0, startPosInFlow)); // Ensure position is not negative
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
        });
      }
    }
  }

  private refreshDropdownEntries(
    dropdownEntries: HTMLElement,
    emptyResults: boolean
  ) {
    // clear existing entries
    dropdownEntries.empty();

    if (emptyResults) {
      this.createDropdownEntry("No results", dropdownEntries);
    } else {
      // Re-create filtered entries
      const key = this.plugin.settings.flows[this.flowName].flowReceipe
        .bookmarks
        ? "bookmarks"
        : "foldersTagsProps";

      for (let path of this.plugin.settings.flows[this.flowName].flowReceipe[
        key
      ]) {
        this.createDropdownEntry(path, dropdownEntries);
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
      cls: "textflow-menu-bar",
    });

    // ----- SAVE BUTTON -----------
    const saveButton = new ButtonComponent(menuBarEl)
      .setIcon("download")
      .setClass(`flow-switch-modal-header-button-${goSave}`)
      .setClass("clickable-icon")
      .onClick(async () => {
        if (goSave === "neutral" || goSave === "must") {
          if (goSave === "neutral" || goSave === "must") {
            await this.plugin.saveAllLeavesManual();
            await this.plugin.saveSettings();
            this.refresh(this.associatedView.contentEl);
          } else {
            return;
          }
        } else {
          return;
        }
      });
    // ----------- REBUILD BUTTON ------------
    const rebuildButton = new ButtonComponent(menuBarEl)
      .setIcon("rotate-cw")
      .setClass(`flow-switch-modal-header-button-${goRebuild}`)
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
    const leafID = (this.associatedView.leaf as any).id;
    let activeRegion: string | undefined = ""; // It's the only way to pacify the Red Squiggle Demon's wrath at path being explicitly typed as string | undefined
    if (
      hasActiveRegions &&
      leafID &&
      this.plugin.settings.flows[this.flowName].activeRegions[leafID].path
    ) {
      activeRegion =
        this.plugin.settings.flows[this.flowName].activeRegions[leafID].path;
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
    const navigationDopdown = menuBarEl.createDiv({
      cls: "menu-bar-navigation-dropdown",
    });

    const headline = navigationDopdown.createDiv({
      cls: "menu-bar-navigation-dropdown-headline",
    });

    // headline text and icon
    headline.createSpan({
      cls: "menu-bar-navigation-dropdown-headline",
      text:
        activeRegionNoteName === "" ? firstThingNoteName : activeRegionNoteName,
    });
    const iconSpan = headline.createSpan();
    setIcon(iconSpan, "chevrons-down-up");

    const dropdownContents = navigationDopdown.createDiv({
      cls: `menu-bar-navigation-dropdown-contents ${this.getDropdownState()}`,
    });

    // Filter entry
    this.addManagedListener(headline, "click", (event) => {
      if (this.getDropdownState() === "hide") {
        this.setDropdownState("show");
        this.refresh(this.associatedView.contentEl);
        const filterCriterion = this.element?.querySelector(
          ".menu-bar-navigation-dropdown-search-input"
        );
        if (filterCriterion) {
          (filterCriterion as HTMLInputElement).focus();
        }
      } else {
        this.setDropdownState("hide");
        this.refresh(this.associatedView.contentEl);
      }
    });

    const searchContainer = dropdownContents.createDiv({
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
      displayName: this.makeNavPath(path),
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
        this.refreshDropdownEntries(dropdownEntries, true);
      } else if (this.filterList.length > 0) {
        // entries because of successful filter
        this.refreshDropdownEntries(dropdownEntries, false);
      } else {
        // no entries because query has been deleted
        this.filterList =
          this.plugin.settings.flows[this.flowName].flowReceipe[key];
        this.refreshDropdownEntries(dropdownEntries, false);
      }
    });

    // the initial clickable list of entries
    const dropdownEntries = dropdownContents.createDiv({
      cls: "menu-bar-navigation-dropdown-entries",
    });

    for (let path of this.plugin.settings.flows[this.flowName].flowReceipe[
      key
    ]) {
      this.createDropdownEntry(path, dropdownEntries);
    }

    // there we go.
    return menuBarEl;
  }
}
