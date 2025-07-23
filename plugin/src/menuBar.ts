import {
  App,
  ButtonComponent,
  Editor,
  MarkdownView,
  normalizePath,
  Notice,
  setIcon,
  TFile,
} from "obsidian";
import { EditorView } from "@codemirror/view";
import { FlowService } from "./flowService";
import Fuse, { FuseResult } from "fuse.js";
import type TextFlowPlugin from "../main";

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
  }

  // ------ uitilities ---------
  // --- attachment of the menu bar
  public attach(containerEl: HTMLElement) {
    // check that element isn't attached already
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

  // To keep track of all the listeners we need to add for our custom dropdowns
  private addManagedListener(
    element: HTMLElement | Document,
    type: string,
    handler: EventListener
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

  // when we sync or rebuild, we need to refresh to see the updated button states
  public refresh(containerEl: HTMLElement) {
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

  // used by setupFlowView to coordinate
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

  // gather overlap so we can mark these regions
  private getOverlap = () => {
    // one array for flow names, the other for paths
    const overlap: string[][] = [[], []];
    if (this.plugin.settings.activeFlowObject) {
      if (Object.keys(this.plugin.settings.activeFlowObject).length > 0) {
        Object.keys(this.plugin.settings.activeFlowObject).forEach(
          (flowName) => {
            if (this.plugin.settings.flows[this.flowName].conflictObject) {
              if (
                this.plugin.settings.flows[this.flowName].conflictObject[
                  flowName
                ]
              ) {
                overlap[0].push(flowName);
                Object.keys(
                  this.plugin.settings.flows[this.flowName].conflictObject[
                    flowName
                  ]
                ).forEach((path) => {
                  overlap[1].push(path);
                });
              }
            }
          }
        );
      }
    }
    return overlap;
  };

  // initialising this for the fuzzy search
  private filterList: string[] = [];

  // handling the creation of entries
  private createNavDropdownEntry(path: string, dropdownEntries: HTMLElement) {
    // get flowOrder (also to search for start of region)

    if (path === "No results") {
      const dropdownEntry = dropdownEntries.createDiv({
        cls: "menu-bar-navigation-dropdown-entries",
        text: "No results",
      });
    } else {
      let flowOrder = 0;
      if (this.plugin.settings.flows[this.flowName].flowMap[path]) {
        flowOrder =
          this.plugin.settings.flows[this.flowName].flowMap[path].flowOrder;
      }

      // construct text and class for the dropdown entries
      let titleClass = "";
      if (path.startsWith("#")) {
        titleClass = `text-emphasis align-off-center`;
      }

      let navPath = this.makeNavPath(path);
      const overlap = this.getOverlap();
      if (overlap[1].includes(path)) {
        navPath = `${navPath} ⚭`;
        titleClass = `highlighted`;
      }

      if (this.filterList.length === 0 || this.filterList.includes(path)) {
        const dropdownEntry = dropdownEntries.createDiv({
          cls: titleClass,
          text: `- ${navPath}`,
          attr: {
            "aria-label": `Flow overlaps with ${overlap[0].join(", ")}`,
          },
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
            this.flowService.scrollToPos(editor, startPosInFlow);
          }

          this.filterList = [];
          this.setDropdownState("nav", "hide");
          this.refresh(this.associatedView.contentEl);
        });
      }
    }
  }

  // because the navDropdown needs to be dynamic
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
      const key = this.plugin.settings.flows[this.flowName].flowRecipe.bookmarks
        ? "bookmarks"
        : "foldersTagsProps";

      for (let path of this.plugin.settings.flows[this.flowName].flowRecipe[
        key
      ]) {
        this.createNavDropdownEntry(path, dropdownEntries);
      }
    }
  }

  // ----------- THE MENU BAR ITSELF

  createMenuBarElement(): HTMLElement {
    // If the menuBar is completely HIDDEN
    if (!this.plugin.settings.showMenuBar) {
      const menuBarEl = this.associatedView.contentEl.createDiv({
        cls: `hide`,
      });
      return menuBarEl;
      // if the menuBar is MINIMISED
    } else if (!this.plugin.settings.maxMenuBar) {
      const menuBarEl = this.associatedView.contentEl.createDiv({
        cls: "textflow-menu-bar-min",
      });
      setIcon(menuBarEl, "chevron-right");
      this.addManagedListener(menuBarEl, "click", (event) => {
        this.plugin.settings.maxMenuBar = true;
        this.refresh(this.associatedView.contentEl);
      });
      return menuBarEl;
    } else {
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
      const saveButton = new ButtonComponent(menuBarEl);
      saveButton
        .setIcon("download")
        .setClass(`menu-bar-button-save-${goSave}`)
        .setClass("spacing")
        .setClass("clickable-icon")
        .onClick(async () => {
          if (goSave === "neutral" || goSave === "must") {
            const syncLeafID = (this.associatedView.leaf as any).id;
            await this.plugin.saveBackToSource(
              this.flowName,
              this.associatedView.editor.getValue(),
              syncLeafID
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
        .onClick(async () => {
          if (goRebuild === "neutral" || goRebuild === "must") {
            await this.flowService.rebuildFlow(this.flowName, "menuBar");
            this.plugin.setupFlowView(this.flowName, this.associatedView);
          }
        });

      // ----------- NAVIGATION DROPDOWN ------
      // compute text for initial dropdown headline
      const hasActiveRegions =
        Object.keys(this.plugin.settings.flows[this.flowName].activeRegions)
          .length > 0;

      // get the path of the currently active region via the leafID
      const navLeafID = (this.associatedView.leaf as any).id;
      // Pacify the Red Squiggle Demon's wrath at 'path' being explicitly typed as string | undefined
      let activeRegion: string | undefined = "";
      if (
        hasActiveRegions &&
        navLeafID &&
        this.plugin.settings.flows[this.flowName].activeRegions[navLeafID].path
      ) {
        activeRegion =
          this.plugin.settings.flows[this.flowName].activeRegions[navLeafID]
            .path;
      }

      let activeRegionNoteName = "";
      let titleClass = "blargh"; // could also have been "lalalalalalalalalalalalalalalalalalal"
      if (activeRegion) {
        activeRegionNoteName = this.makeNavPath(activeRegion);
        const overlap = this.getOverlap();
        if (overlap[1].includes(activeRegion)) {
          activeRegionNoteName = `${activeRegion} ⚭`;
          titleClass = `highlighted`;
        }
      }

      // If we don't have an active region - we always do, but still - be ready to use the first region
      const key = this.plugin.settings.flows[this.flowName].flowRecipe.bookmarks
        ? "bookmarks"
        : "foldersTagsProps";
      const firstThing =
        this.plugin.settings.flows[this.flowName].flowRecipe[key][0];
      const firstThingNoteName = this.makeNavPath(firstThing);

      // --------- The actual dropdown component ----------

      const navigationDropdown = menuBarEl.createDiv({
        cls: `menu-bar-navigation-dropdown spacing`,
      });

      const navHeadline = navigationDropdown.createDiv({
        cls: "menu-bar-navigation-dropdown-headline",
      });

      // headline text and icon
      // region and icon if the dropdown is collapsed,
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
      } else {
        // fuzzy search input if the dropdown is expanded
        const searchInput = navHeadline.createEl("input", {
          cls: "menu-bar-navigation-dropdown-search-input",
          type: "text",
          placeholder: "Filter...",
        });
        const searchItems = this.plugin.settings.flows[
          this.flowName
        ].flowRecipe[key].map((path) => ({
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
              this.plugin.settings.flows[this.flowName].flowRecipe[key];
          }

          // Otherwise return filtered paths
          this.filterList = fuse
            .search(query)
            .map(
              (result) => (result as FuseResult<{ path: string }>).item.path
            );

          if (this.filterList.length === 0 && query != "") {
            // no entries because of failed filter
            this.refreshNavDropdownEntries(dropdownEntries, true);
          } else if (this.filterList.length > 0) {
            // entries because of successful filter
            this.refreshNavDropdownEntries(dropdownEntries, false);
          } else {
            // no entries because query has been deleted
            this.filterList =
              this.plugin.settings.flows[this.flowName].flowRecipe[key];
            this.refreshNavDropdownEntries(dropdownEntries, false);
          }
        });

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
      }

      // a matrioshka of layout despair
      const dropdownGeneral = navigationDropdown.createDiv({
        cls: `menu-bar-navigation-dropdown-general ${this.getDropdownState(
          "nav"
        )}`,
      });

      const navDropdownScrollable = dropdownGeneral.createDiv({
        cls: "menu-bar-navigation-dropdown-scrollable",
      });

      // the initial clickable list of entries
      const dropdownEntries = navDropdownScrollable.createDiv({
        cls: "menu-bar-navigation-dropdown-entries",
      });

      for (let path of this.plugin.settings.flows[this.flowName].flowRecipe[
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

      // initial content
      let cursorDropdownHeadline = `No stored cursors found`;
      if (this.plugin.settings.flows[this.flowName].persistentCursors) {
        if (
          Object.keys(
            this.plugin.settings.flows[this.flowName].persistentCursors
          ).length > 0
        ) {
          cursorDropdownHeadline = `Stored cursor positions`;
        }
      }

      // the span that holds abobe text, plus the fast travel icon
      cursorHeadline.createSpan({
        cls: "align-off-center",
        text: cursorDropdownHeadline,
      });
      const cursorIconSpan = cursorHeadline.createSpan();
      setIcon(cursorIconSpan, "chevrons-down-up");

      // the listener to open the dropdown
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

      // Get all the timestamps to use an array as ordering device
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

        // sort the timestamps in reverse order so newest timestamp comes first
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
            const editor = this.associatedView.editor as ObsidianEditor;
            this.addManagedListener(
              cursorDropdownEntryPos,
              "click",
              (event) => {
                this.flowService.scrollToPos(editor, cursorPos);
              }
            );
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
                      this.plugin.settings.flows[this.flowName]
                        .persistentCursors[leafID].creationDateString
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

                  this.addManagedListener(
                    cursorDropdownEntryPos,
                    "click",
                    (event) => {
                      const editor = this.associatedView
                        .editor as ObsidianEditor;
                      this.flowService.scrollToPos(editor, cursorPos);
                    }
                  );
                }
              }
            }
          });
        }

        // get the most recent cursor position for the fast travel button
        const mostRecentTimestamp: number = timestampArray[0];
        let mostRecentCursor: number = 0;
        let mostRecentRegion: string = "";
        if (this.plugin.settings.flows[this.flowName].persistentCursors) {
          Object.keys(
            this.plugin.settings.flows[this.flowName].persistentCursors
          ).forEach((leafID) => {
            if (
              this.plugin.settings.flows[this.flowName].persistentCursors[
                leafID
              ].update === mostRecentTimestamp
            ) {
              mostRecentCursor =
                this.plugin.settings.flows[this.flowName].persistentCursors[
                  leafID
                ].cursors[0][1];
              mostRecentRegion = this.makeNavPath(
                this.plugin.settings.flows[this.flowName].persistentCursors[
                  leafID
                ].cursors[0][0]
              );
            }
          });
        }

        // the button itself
        const cursorIconTarget = new ButtonComponent(cursorContainer);
        cursorIconTarget
          .setIcon("target")
          .setClass("cursor-target-button") // Add a specific class we can target
          .setTooltip(
            mostRecentCursor != 0 && mostRecentRegion != ""
              ? `${mostRecentCursor} - ${mostRecentRegion}`
              : "No cursor positions stored"
          )
          .onClick(() => {
            const editor = this.associatedView.editor as ObsidianEditor;
            mostRecentCursor
              ? this.flowService.scrollToPos(editor, mostRecentCursor)
              : "";
          });
      }

      // the button with which you can select the active region
      const selectButton = new ButtonComponent(menuBarEl);
      selectButton
        .setIcon("text-select")
        .setClass("spacing")
        .setClass("clickable-icon")
        .setTooltip("Select active region")
        .onClick(async () => {
          if (activeRegion) {
            this.flowService.selectActiveRegion(
              this.flowName,
              activeRegion,
              this.associatedView.editor.getValue(),
              this.associatedView.editor
            );
          }
        });

      // a button to export the flow with UUIDs stripped
      const exportButton = new ButtonComponent(menuBarEl);
      exportButton
        .setIcon("file-up")
        .setClass("spacing")
        .setClass("clickable-icon")
        .setTooltip("Export flow")
        .onClick(async () => {
          const path = this.plugin.settings.flows[this.flowName].flowFilePath;
          const file = this.app.vault.getAbstractFileByPath(path);
          if (file instanceof TFile) {
            const fileContent: string = await this.app.vault.read(file);
            const stripUUIDs = (text: string): string => {
              const uuidPattern =
                /[\u200B\u200C\u200D\u2060\u2061\u2062\u2063\u2064\uFEFF\u00A0]{46}/g;
              const result = text.replace(uuidPattern, "\n");
              return result;
            };
            const cleanContent = stripUUIDs(fileContent);
            const exportedFlowPath = normalizePath(
              `/${this.flowName}_export.md`
            );
            await this.flowService.safeCreateFile(
              this.app.vault,
              exportedFlowPath,
              cleanContent
            );
            new Notice(
              `textFlow: Your flow has been exported to ${exportedFlowPath}.`
            );
          }
        });

      // a chevron to minimise
      const minimiseButton = new ButtonComponent(menuBarEl);
      minimiseButton
        .setIcon("chevron-left")
        .setClass("spacing")
        .setClass("clickable-icon")
        .setTooltip("Minimise menu bar")
        .onClick(() => {
          this.plugin.settings.maxMenuBar = false;
          this.refresh(this.associatedView.contentEl);
        });

      // there we go.
      return menuBarEl;
    }
  }
}
