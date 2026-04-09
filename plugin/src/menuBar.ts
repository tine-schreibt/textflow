import { App, ButtonComponent, MarkdownView, setIcon } from "obsidian";
import Fuse, { FuseResult } from "fuse.js";
import type TextFlowPlugin from "../main";
import { basename } from "path";
import * as Types from "./types";

export class MenuBar {
  private app: App;
  private element!: HTMLElement; // the bar
  private plugin: TextFlowPlugin;
  private flowName: string;
  private associatedView: MarkdownView; // reference to our specific view
  private listeners: Array<{
    element: HTMLElement | Document;
    type: string;
    handler: EventListener;
  }> = [];
  private leafID: string;

  constructor(
    app: App,
    plugin: TextFlowPlugin,
    flow: string,
    view: MarkdownView,
    leafID: string,
  ) {
    this.app = app;
    this.plugin = plugin;
    this.flowName = flow;
    this.associatedView = view;
    this.leafID = leafID;
  }

  // Any code that was actually written by AI is labelled

  // -------------------------------------------------------------
  // ------ UTILITIES ---------
  // -------------------------------------------------------------

  // --- attachment of the menu bar
  // This was written by AI
  public attach(containerEl: HTMLElement) {
    // check that we're talking about the same thing
    if (containerEl === this.associatedView.contentEl) {
      this.detach();

      // Check for other menu bars and remove them
      const existingMenuBars =
        containerEl.getElementsByClassName("textflow-menu-bar");
      Array.from(existingMenuBars).forEach((el) => el.remove());

      // Check again, then prepend
      if (this.element && !this.element.parentNode) {
        containerEl.prepend(this.element);
      }
    }
  }
  // if you attach, you gotta detach
  public detach() {
    if (this.element && this.element.parentNode) {
      this.element.detach();
    }
  }

  // -------------------------------------------------------
  private getAndSortPersistentCursors = (include: boolean) => {
    let cursorArray: [string, number, number][] = [];
    let zeroCursor = false; // to prevent a ton of 0 cursors
    if (include) {
      cursorArray =
        this.plugin.settings.flows[this.flowName].persistentCursors[this.leafID]
          .cursors;
    } else {
      Object.keys(
        this.plugin.settings.flows[this.flowName].persistentCursors,
      ).forEach((leafID) => {
        // exclude the active leaf
        if (leafID != this.leafID) {
          if (
            this.plugin.settings.flows[this.flowName].persistentCursors[leafID]
              .cursors
          ) {
            for (let cursor of this.plugin.settings.flows[this.flowName]
              .persistentCursors[leafID].cursors) {
              if (cursor[1] === 0 && zeroCursor) continue;
              cursorArray.push(cursor);
              if (cursor[1] === 0) zeroCursor = true;
            }
          }
        }
      });
    }
    cursorArray.sort((a, b) => b[2] - a[2]);
    return cursorArray;
  };

  // -------------------------------------------------------
  // To keep track of all the listeners we need to add for our custom dropdowns
  // the whole listener business is AI slop
  private addManagedListener(
    element: HTMLElement | Document,
    type: string,
    handler: EventListener,
  ) {
    this.listeners.push({ element, type, handler });
    element.addEventListener(type, handler);
  }

  // If you attach you gotta detach
  private detachListeners() {
    this.listeners.forEach(({ element, type, handler }) => {
      element.removeEventListener(type, handler);
    });
    this.listeners = [];
  }

  private lastSingleMenuBarRefresh = 0;
  // when we sync or rebuild, we need to refresh to see the updated button states
  public refresh(containerEl: HTMLElement) {
    //this.plugin.settingsTabFunctions.callStack("refresh");

    // Detach all the old stuff
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

  // -------------------------------------------------------
  // used by setUpFlow to coordinate
  public getFlowName(): string {
    return this.flowName;
  }

  // -------------------------------------------------------
  // functions to get dropdown state because the address is so fucking long
  private getDropdownState(dropdown: string) {
    if (dropdown === "nav") {
      return (
        this.plugin.settings.activeRegions[this.flowName][this.leafID]
          .leafMenuBarSettings.navDropdownState ?? "show"
      );
    }
    if (dropdown === "cursor")
      return (
        this.plugin.settings.activeRegions[this.flowName][this.leafID]
          .leafMenuBarSettings.cursorDropdownState ?? "show"
      );
  }

  // -------------------------------------------------------
  private setDropdownState = async (
    dropdown: string,
    state: "show" | "hide",
  ) => {
    if (
      dropdown === "nav" &&
      this.plugin.settings.activeRegions[this.flowName][this.leafID]
    ) {
      this.plugin.settings.activeRegions[this.flowName][
        this.leafID
      ].leafMenuBarSettings.navDropdownState = state;
    }
    if (
      dropdown === "cursor" &&
      this.plugin.settings.activeRegions[this.flowName][this.leafID]
    ) {
      this.plugin.settings.activeRegions[this.flowName][
        this.leafID
      ].leafMenuBarSettings.cursorDropdownState = state;
    }
  };

  // -------- FUNCTIONS AND VARIABLES TO MANAGE THE MENU BAR INTERNALLY

  // construct text for the dropdown option
  private makeNavPath = (path: string) => {
    if (path.startsWith("#")) {
      path = path.replace("#", "");
    } else {
      path = basename(path).replace(".md", "");
    }
    return path;
  };

  // -------------------------------------------------------
  // gather overlap so we can mark these regions
  private overlapText = "";

  private getOverlap = () => {
    // one array for flow names, the other for paths
    const overlap: string[][] = [[], []];
    if (this.plugin.settings.activeRegions) {
      if (Object.keys(this.plugin.settings.activeRegions).length > 0) {
        Object.keys(this.plugin.settings.activeRegions).forEach((flowName) => {
          if (this.plugin.settings.flows[this.flowName].overlapObject) {
            if (
              this.plugin.settings.flows[this.flowName].overlapObject[flowName]
            ) {
              overlap[0].push(flowName);
              Object.keys(
                this.plugin.settings.flows[this.flowName].overlapObject[
                  flowName
                ],
              ).forEach((path) => {
                overlap[1].push(path);
              });
            }
          }
        });
      }
    }
    return overlap;
  };

  // -------------------------------------------------------
  // initialising this for the fuzzy search
  private filterList: string[] = [];

  private createNavDropdownEntry(path: string, dropdownEntries: HTMLElement) {
    // get flowOrder (also to search for start of region)
    if (path === "No results") {
      const dropdownEntry = dropdownEntries.createDiv({
        cls: "menu-bar-navigation-dropdown-entries",
        text: "No results",
      });
    } else {
      // set up a bunch of variables we'll need later
      let flowOrder = 0;
      let titleClass = "";
      let isActiveRegion = false;

      // find the flow order and check active state while we're at it
      if (this.plugin.settings.flows[this.flowName].flowMap[path]) {
        // the flow order part
        flowOrder =
          this.plugin.settings.flows[this.flowName].flowMap[path].flowOrder;
        if (this.plugin.settings.activeRegions[this.flowName][this.leafID]) {
          if (
            this.plugin.settings.activeRegions[this.flowName][this.leafID]
              .path === path
          ) {
            // the active region part
            isActiveRegion = true;
          }
        }
      }

      // construct text and class for the dropdown entries
      if (path.startsWith("#")) {
        titleClass = `text-emphasis align-off-center`;
      }

      let navPath = this.makeNavPath(path);
      const overlap = this.getOverlap();
      if (overlap[1].includes(path)) {
        navPath = `${navPath} ⚭`;
        titleClass = `underlined`;
        this.overlapText =
          overlap[0].join(",").length > 0
            ? `${this.plugin.t("menuBar flow overlap")} ${overlap[0].join(
                ", ",
              )}`
            : "";
      }

      if (isActiveRegion) {
        titleClass += ` active`;
      }

      if (this.filterList.length === 0 || this.filterList.includes(path)) {
        const dropdownEntry = dropdownEntries.createDiv({
          cls: titleClass,
          text: `- ${navPath}`,
          attr: {
            "aria-label": this.overlapText,
          },
        });

        this.addManagedListener(dropdownEntry, "click", (event) => {
          // scroll into view
          const editor = this.plugin.settingsTabFunctions.getEditor(
            this.associatedView,
          );
          if (!editor) return;
          const cmEditor = editor.cm;
          let text = "";
          if (cmEditor) {
            text = cmEditor.state.doc.toString();
          }

          const startPosInFlow = this.plugin.findStartOfRegion(
            this.plugin.settings.flows[this.flowName],
            flowOrder,
            text,
          );
          if (startPosInFlow) {
            this.plugin.settingsTabFunctions.scrollToPos(
              editor,
              startPosInFlow,
            );
          }

          this.filterList = [];
          this.setDropdownState("nav", "hide");
          this.refresh(this.associatedView.contentEl);
        });
      }
    }
  }

  // -------------------------------------------------------
  // because the navDropdown needs to be dynamic
  private refreshNavDropdownEntries(
    dropdownEntries: HTMLElement,
    emptyResults: boolean,
  ) {
    // clear existing entries
    dropdownEntries.empty();

    if (emptyResults) {
      this.createNavDropdownEntry("No results", dropdownEntries);
    } else {
      // Re-create filtered entries
      this.getPathArray().forEach((path) => {
        this.createNavDropdownEntry(path, dropdownEntries);
      });
    }
  }

  // -------------------------------------------------------
  private getPathArray = () => {
    let pathArray: string[] = [];
    Object.keys(this.plugin.settings.flows[this.flowName].flowMap).forEach(
      (note) => {
        const path =
          this.plugin.settings.flows[this.flowName].flowMap[note].path;
        pathArray.push(path);
      },
    );
    return pathArray;
  };

  // -------------------------------------------------------------
  // ----------- THE MENU BAR ITSELF
  // -------------------------------------------------------------
  createMenuBarElement = (): HTMLElement => {
    //this.plugin.settingsTabFunctions.callStack("createMenuBarElement");

    // being paranoid about the TRACKING COMPARTMENTS
    const cmView = this.plugin.settingsTabFunctions.getEditorCM(
      this.associatedView.editor,
    );

    let compartmentsGood = false;

    if (cmView) {
      compartmentsGood = this.plugin.checkCompartments(this.leafID, cmView);
    }

    if (!compartmentsGood) {
      //  new Notice(this.plugin.t("Compartment error"), 10000);
    }

    // ------------- THE MINIMISED BAR ------------------------------------------
    // some checks for the design
    if (
      this.plugin.settings.activeRegions[this.flowName][this.leafID]
        .leafMenuBarSettings.menuBarDisplayState === "min"
    ) {
      let style = "textflow-menu-bar-min-sync-neutral";

      // check if the bar needs to communicate anything
      if (
        this.plugin.settings.flows[this.flowName].unsyncedRegionsArray.length >
          0 ||
        this.plugin.settings.flows[this.flowName].flaggedForRebuild ||
        this.plugin.flowOutOfSync.includes(this.flowName)
      ) {
        style = "textflow-menu-bar-min-sync-must"; // must sync
      }

      if (!compartmentsGood) style = "textflow-menu-bar-min-warn";

      // ------------------------------
      // now build the bar
      const menuBarEl = this.associatedView.contentEl.createDiv({
        cls: `textflow-menu-bar-min`,
      });
      const maximiseButton = new ButtonComponent(menuBarEl);
      maximiseButton
        .setIcon(compartmentsGood ? "chevron-right" : "alert-triangle")
        .setClass("spacing")
        .setClass("clickable-icon")
        .setClass(style)
        .setTooltip(
          compartmentsGood
            ? this.plugin.t("menubar Expand")
            : this.plugin.t("menubar Expand warn"),
        )
        .onClick(() => {
          this.plugin.settings.activeRegions[this.flowName][
            this.leafID
          ].leafMenuBarSettings.menuBarDisplayState = "max";
          this.plugin.saveSettings();
          this.plugin.refreshMenuBars();
        });
      return menuBarEl;
    } else {
      // ---------- THE MAXIMISED BAR ---------------------------------------------
      // checks for the design and conditional functionality
      let goSync = "neutral";
      let goRebuild = "neutral";

      // check if there is unsynced stuff for the flow
      if (
        this.plugin.settings.flows[this.flowName].unsyncedRegionsArray.length >
        0
      ) {
        goRebuild = "no-go";
        goSync = "must"; // must sync
      }
      // check if flow is flagged for rebuild
      if (
        goSync === "neutral" &&
        this.plugin.settings.flows[this.flowName].flaggedForRebuild
      ) {
        goRebuild = "must";
        goSync = "no-go";
      }

      if (this.plugin.flowOutOfSync.includes(this.flowName)) {
        goRebuild = "must";
        goSync = "no-go";
      }

      const menuBarEl = this.associatedView.contentEl.createDiv({
        cls: `textflow-menu-bar`,
      });

      // ----- SYNC BUTTON -----------
      const syncButton = new ButtonComponent(menuBarEl);
      syncButton
        .setIcon("download")
        .setClass(`menu-bar-button-sync-${goSync}`)
        .setClass("spacing")
        .setClass("clickable-icon")
        .setTooltip(this.plugin.t("switcherModal.buttons sync"))

        .onClick(async () => {
          if (goSync === "neutral" || goSync === "must") {
            await this.plugin.syncBackToSource(
              this.flowName,
              this.associatedView.editor.getValue(),
              this.leafID,
            );
            await this.plugin.saveSettings();
            this.refresh(this.associatedView.contentEl);
          } else {
            return;
          }
        });

      // ----------- REBUILD BUTTON ------------
      const rebuildButton = new ButtonComponent(menuBarEl)
        .setIcon("rotate-cw")
        .setClass(`menu-bar-button-rebuild-${goRebuild}`)
        .setClass("spacing")
        .setClass("clickable-icon")
        .setTooltip(this.plugin.t("switcherModal.buttons rebuild"))
        .onClick(async () => {
          if (goRebuild === "neutral" || goRebuild === "must") {
            await this.plugin.settingsTabFunctions.flowBuildingBundle(
              this.flowName,
              "menuBar",
            );
          }
        });

      // ----------- NAVIGATION DROPDOWN ------
      // Pacify the Red Squiggle Demon's wrath at 'path' being explicitly typed as string | undefined
      let activeRegion: string | undefined = "";

      // this always exists because it's created before the menu bar is set up
      if (this.plugin.settings.activeRegions[this.flowName][this.leafID].path) {
        activeRegion =
          this.plugin.settings.activeRegions[this.flowName][this.leafID].path;
      }

      let activeRegionNoteName = "";
      let titleClass = "blargh"; // could also have been "lalalalalala"
      if (activeRegion) {
        activeRegionNoteName = this.makeNavPath(activeRegion);
        const overlap = this.getOverlap();
        if (overlap[1].includes(activeRegion)) {
          activeRegionNoteName = `${activeRegionNoteName} ⚭`;
          titleClass = `underlined`;
        }
      }

      // If we don't have an active region - we always do, but still - be ready to use the first region
      const key = this.plugin.settings.flows[this.flowName].definitionMode;

      const pathArray = this.getPathArray();
      const firstThingNoteName = this.makeNavPath(pathArray[0]);

      // --------- THE ACTUAL DROPDOWN COMPONENT ----------
      const navigationDropdown = menuBarEl.createDiv({
        cls: `menu-bar-navigation-dropdown spacing`,
      });

      const navHeadline = navigationDropdown.createDiv({
        cls: "menu-bar-navigation-dropdown-headline",
        attr: {
          "aria-label": this.overlapText,
        },
      });

      // headline text and icon
      // just the region, if the dropdown is collapsed
      if (this.getDropdownState("nav") === "hide") {
        navHeadline.createSpan({
          cls: `align-off-center ${titleClass}`,
          text:
            activeRegionNoteName === ""
              ? firstThingNoteName
              : activeRegionNoteName,
        });

        const iconSpan = navHeadline.createSpan();
        setIcon(iconSpan, "chevrons-down-up");

        this.addManagedListener(navHeadline, "click", (event) => {
          // see if we got a search term stored; this is so the user doesn't have to
          // retype it if they use it to create a navigation environment
          if (
            this.plugin.settings.activeRegions[this.flowName][this.leafID]
              .leafMenuBarSettings.navDropdownSearchTerm
          ) {
            const query =
              this.plugin.settings.activeRegions[this.flowName][this.leafID]
                .leafMenuBarSettings.navDropdownSearchTerm;
            performSearch(event, query);
          }

          if (this.getDropdownState("nav") === "hide") {
            this.setDropdownState("nav", "show");
            this.refresh(this.associatedView.contentEl);
            const filterCriterion = this.element?.querySelector(
              ".menu-bar-navigation-dropdown-search-input",
            );
            if (filterCriterion) {
              (filterCriterion as HTMLInputElement).focus();
            }

            // Listener that will close dropdown if we click outside it
            this.addManagedListener(document, "click", (event: Event) => {
              const mouseEvent = event as MouseEvent;

              const target = mouseEvent.target as HTMLElement;
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
      } else {
        // or the search, if the dropdown is expanded
        const searchInput = navHeadline.createEl("input", {
          cls: "menu-bar-navigation-dropdown-search-input",
          type: "text",
          placeholder: "Filter...",
          value:
            this.plugin.settings.activeRegions[this.flowName][this.leafID]
              .leafMenuBarSettings.navDropdownSearchTerm,
        });

        // if we have a stored search term, select it, so it's easy to replace/remove
        if (
          this.plugin.settings.activeRegions[this.flowName][this.leafID]
            ?.leafMenuBarSettings.navDropdownSearchTerm
        ) {
          searchInput.select();
        }

        this.addManagedListener(searchInput, "input", (event) => {
          performSearch(event);
        });
      }

      // this function is in here so I don't have to hand over a million args
      const performSearch = (event: Event, query?: string) => {
        const searchItems = pathArray.map((path) => ({
          path: path,
          displayName: `${this.makeNavPath(path)}`,
        }));

        const iconSpan = navHeadline.createSpan();
        //setIcon(iconSpan, "chevrons-down-up");

        const fuse = new Fuse(searchItems, {
          keys: ["displayName"],
          threshold: 0.4,
          // We can tune these options
          includeScore: true,
          includeMatches: true,
        });

        // if the event is an input - which it is if we don't have a query
        if (!query) {
          query = (event.target as HTMLInputElement).value;
        }

        this.plugin.settings.activeRegions[this.flowName][
          this.leafID
        ].leafMenuBarSettings.navDropdownSearchTerm = query;
        // save the query debouncedly
        this.plugin.settingsTabFunctions.debouncedSaveSettings();

        // If no query (yet), return all paths
        if (!query) {
          this.filterList = pathArray;
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
          // no entries because query has been deleted -> give whole list again
          this.filterList = pathArray;
          this.refreshNavDropdownEntries(dropdownEntries, false);
        }
      };

      // a matrioshka of layout despair
      const dropdownGeneral = navigationDropdown.createDiv({
        cls: `menu-bar-navigation-dropdown-general ${this.getDropdownState(
          "nav",
        )}`,
      });

      const navDropdownScrollable = dropdownGeneral.createDiv({
        cls: "menu-bar-navigation-dropdown-scrollable",
      });

      // the initial clickable list of entries
      const dropdownEntries = navDropdownScrollable.createDiv({
        cls: "menu-bar-navigation-dropdown-entries",
      });

      for (let path of pathArray) {
        this.createNavDropdownEntry(path, dropdownEntries);
      }

      // ------ The cursor stuff -----------------------------------
      const cursorDropdown = menuBarEl.createDiv({
        cls: "menu-bar-cursor-dropdown",
      });

      const cursorHeadline = cursorDropdown.createDiv({
        cls: "menu-bar-navigation-dropdown-headline",
      });

      // the span that holds the icon
      // there used to be a text dropdown here, but I replaced it with just the button and so far I haven't hat the necessary patience to rewrite all of this as a button
      const cursorIconSpan = cursorHeadline.createSpan();
      cursorIconSpan.setAttr(
        "aria-label",
        this.plugin.t("menubar.cursor history stored cursors"),
      );
      setIcon(cursorIconSpan, "map-pin");

      // the listener to open the dropdown
      this.addManagedListener(cursorHeadline, "click", (event) => {
        if (this.getDropdownState("cursor") === "hide") {
          this.setDropdownState("cursor", "show");
          this.refresh(this.associatedView.contentEl);
          // this is just in here because I can't figure out how to
          // get the styling right otherwise -.-
          const filterCriterion = this.element?.querySelector(
            ".menu-bar-navigation-dropdown-search-input",
          );
          if (filterCriterion) {
            (filterCriterion as HTMLInputElement).focus();
          }

          // Listener that will close dropdown if we click outside it
          this.addManagedListener(document, "click", (event: Event) => {
            const mouseEvent = event as MouseEvent;

            const target = mouseEvent.target as HTMLElement;
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
          "cursor",
        )}`,
      });

      // make scrollable container for the entries
      const cursorDropdownScrollable = cursorDropdownGeneral.createDiv({
        cls: `menu-bar-navigation-dropdown-scrollable`,
      });

      let inclusiveCursorArray: [string, number, number][] = [];
      let exclusiveCursorArray: [string, number, number][] = [];
      if (
        Object.keys(this.plugin.settings.flows[this.flowName].persistentCursors)
          .length > 0
      ) {
        // Find out if we have data for the active leaf so we can show it at the top
        if (
          this.plugin.settings.flows[this.flowName].persistentCursors[
            this.leafID
          ]
        ) {
          // create headline entry that's not clickable
          const cursorDropdownEntryDate = cursorDropdownScrollable.createDiv({
            cls: `text-emphasis align-off-center`,
            text: this.plugin.t("menubar.cursor history this leaf"),
          });

          // get the sorted cursors for our leaf
          inclusiveCursorArray = this.getAndSortPersistentCursors(true);

          // create a div for each
          for (const [index, data] of inclusiveCursorArray.entries()) {
            const textTimestamp =
              this.plugin.settings.flows[this.flowName].persistentCursors[
                this.leafID
              ].update;

            const cursorDropdownEntryPos = cursorDropdownScrollable.createDiv({
              cls: "blah",
              text: `${this.makeNavPath(data[0])} (${
                inclusiveCursorArray[index][1]
              })`,
            });
            const cursorPos = inclusiveCursorArray[index][1];
            const editor = this.plugin.settingsTabFunctions.getEditor(
              this.associatedView,
            );
            if (!editor) continue;
            this.addManagedListener(
              cursorDropdownEntryPos,
              "click",
              (event) => {
                this.plugin.settingsTabFunctions.scrollToPos(editor, cursorPos);
              },
            );
          }
        }

        // check if we have cursors for other leaves
        if (
          Object.keys(
            this.plugin.settings.flows[this.flowName].persistentCursors,
          ).length > 1
        ) {
          // create headline entry that's not clickable
          const cursorDropdownEntryDate = cursorDropdownScrollable.createDiv({
            cls: `text-emphasis align-off-center`,
            text: this.plugin.t("menubar.cursor history other leaves"),
          });

          // get the cursor positions
          exclusiveCursorArray = this.getAndSortPersistentCursors(false);

          for (const [index, data] of exclusiveCursorArray.entries()) {
            const cursorDropdownEntryPos = cursorDropdownScrollable.createDiv({
              cls: `blah`,
              text: `${this.makeNavPath(data[0])} (${
                exclusiveCursorArray[index][1]
              })`,
            });

            const cursorPos = exclusiveCursorArray[index][1];

            this.addManagedListener(
              cursorDropdownEntryPos,
              "click",
              (event) => {
                const editor = this.plugin.settingsTabFunctions.getEditor(
                  this.associatedView,
                );
                if (!editor) return;
                this.plugin.settingsTabFunctions.scrollToPos(editor, cursorPos);
              },
            );
          }
        }

        // CODE FOR A FAST TRAVEL BUTTON
        // SEEMS SUPERFLUOUS BUT MAY REINSTATE IF USERS ASK FOR IT
        /*        const collectedCursors = [
          ...inclusiveCursorArray,
          ...exclusiveCursorArray,
        ].sort((a, b) => b[2] - a[2]);

         // get the most recent cursor position for the fast travel button, if we got a pos
        let mostRecentCursor = 0;
        let mostRecentRegion = "";
        if (collectedCursors.length != 0) {
          mostRecentCursor = collectedCursors[0][1];
          mostRecentRegion = this.makeNavPath(collectedCursors[0][0]);
        }
        // the button itself
        const cursorIconTarget = new ButtonComponent(cursorContainer);
        cursorIconTarget
          .setIcon("target")
          .setClass("cursor-target-button")
          .setTooltip(
            mostRecentCursor != 0 && mostRecentRegion != ""
              ? `${mostRecentRegion} - ${mostRecentCursor}`
              : this.plugin.t("menubar.cursor history no stored cursors"),
          )
          .onClick(() => {
            const editor = this.plugin.settingsTabFunctions.getEditor(this.associatedView)
            if (!editor) return;
            mostRecentCursor
              ? this.plugin.settingsTabFunctions.scrollToPos(editor, mostRecentCursor)
              : "";
          });*/
      }

      // -------------------------------------------------------
      // the button with which you can select the active region
      const selectButton = new ButtonComponent(menuBarEl);
      selectButton
        .setIcon("text-select")
        .setClass("menu-bar-button-select-export")
        .setClass("spacing")
        .setClass("clickable-icon")
        .setTooltip(
          this.plugin.t("menuBar.selectButton.setTooltip select active region"),
        )
        .onClick(async () => {
          if (activeRegion) {
            this.plugin.settingsTabFunctions.selectActiveRegion(
              this.flowName,
              activeRegion,
              this.associatedView.editor.getValue(),
              this.associatedView.editor,
            );
          }
        });

      // -------------------------------------------------------
      // a button to export the flow with UUIDs stripped
      const exportButton = new ButtonComponent(menuBarEl);
      exportButton
        .setIcon("file-up")
        .setClass("menu-bar-button-select-export")
        .setClass("spacing")
        .setClass("clickable-icon")
        .setTooltip(
          this.plugin.t("menuBar.selectButton.setTooltip export flow"),
        )
        .onClick(async () => {
          this.plugin.settingsTabFunctions.exportFlow(this.flowName);
        });

      // -------------------------------------------------------
      // a chevron to minimise (or warning triangle)
      const minimiseButton = new ButtonComponent(menuBarEl);
      minimiseButton
        .setIcon(compartmentsGood ? "chevron-left" : "alert-triangle")
        .setClass("spacing")
        .setClass("clickable-icon")
        .setClass(compartmentsGood ? "blah" : "textflow-menu-bar-min-warn")
        .setTooltip(
          compartmentsGood
            ? this.plugin.t("menubar Collapse")
            : this.plugin.t("menubar Collapse warn"),
        )
        .onClick(() => {
          this.plugin.settings.activeRegions[this.flowName][
            this.leafID
          ].leafMenuBarSettings.menuBarDisplayState = "min";
          this.plugin.saveSettings();
          this.plugin.refreshMenuBars();
        });

      // there we go.
      return menuBarEl;
    }
  };
}
