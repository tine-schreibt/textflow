import {
  App,
  ButtonComponent,
  DropdownComponent,
  Editor,
  MarkdownView,
  Plugin,
  Setting,
} from "obsidian";
import {
  EditorView,
  Decoration,
  DecorationSet,
  ViewUpdate,
  ViewPlugin,
} from "@codemirror/view";
import type TextFlowPlugin from "../main";
import * as Types from "./types";
import { FlowService } from "./flowService";

interface ObsidianEditor extends Editor {
  cm?: EditorView;
}

export class MenuBar {
  private app: App;
  private element: HTMLElement;
  private plugin: TextFlowPlugin;
  private flowName: string;
  private associatedView: MarkdownView; // Store reference to our specific view
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
    this.element = this.createMenuBarElement();
    this.element.addClass("textflow-menu-bar");
    this.element.dataset.flowPath = this.associatedView.file?.path;
  }

  public attach(containerEl: HTMLElement) {
    if (containerEl === this.associatedView.contentEl) {
      // First ensure the element isn't already attached somewhere
      this.detach();
      containerEl.prepend(this.element);
    }
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

  // ----------- THE MENU BAR ITSELF

  createMenuBarElement(): HTMLElement {
    // ---------- FUNCTIONS -----------------

    console.log("preparatory checks");
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

    const menuBarEl = document.createDiv({ cls: "textflow-menu-bar" });

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
    const navigationDropdown = new Setting(menuBarEl);
    navigationDropdown
      .setClass("menu-bar-navigation-dropdown")
      .addDropdown((navigationDropdownComponent) => {
        const key = this.plugin.settings.flows[this.flowName].flowReceipe
          .bookmarks
          ? "bookmarks"
          : "foldersTagsProps";
        for (let path in this.plugin.settings.flows[this.flowName].flowReceipe[
          key
        ]) {
          // Get the text content (needed to search for start of region)
          const editor = this.associatedView.editor as ObsidianEditor;
          const cmEditor = editor.cm;
          if (!cmEditor) {
            console.log("No cmEditor found");
            return;
          }
          const text = cmEditor.state.doc.toString();
          // get flowOrder for the same reason
          const flowOrder =
            this.plugin.settings.flows[this.flowName].flowMap[path].flowOrder;

          // construct text for the dropdown option
          let navPath = "";
          if (!path.startsWith("#")) {
            const pathArray = path.split("/");
            navPath = `- ${pathArray[pathArray.length - 1].replace(".md", "")}`;
          } else {
            navPath = `--- ${path.replace("#", "")} ---`;
          }

          // --------- The actual dropdown component ----------
          navigationDropdownComponent
            .addOption(`${flowOrder}`, `${navPath}`)
            .onChange((value) => {
              const navFlowOrder = parseInt(value, 10);
              const startPosInFlow = this.plugin.findStartOfRegion(
                this.plugin.settings.flows[this.flowName],
                navFlowOrder,
                text
              );
              // scroll into view
              if (startPosInFlow !== undefined && startPosInFlow >= 0) {
                const line = cmEditor.state.doc.lineAt(
                  Math.max(0, startPosInFlow)
                ); // Ensure position is not negative
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
      });

    return menuBarEl; // Return the element we created
  }

  // Add other menu bar specific methods
}
