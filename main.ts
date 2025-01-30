import {
  App,
  Editor,
  EventRef,
  FileView,
  MarkdownView,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFolder,
  WorkspaceLeaf,
  TFile,
} from "obsidian";
import { TextFlowSettingsTab } from "./src/settingsTab";
import { TextFlowSettings, DEFAULT_SETTINGS } from "./src/types";
import { EditorView, ViewUpdate } from "@codemirror/view";
import { EditorState, StateEffect } from "@codemirror/state";
import * as Types from "src/types";
// import { TextFlow } from "./src/flowMaker";

interface ObsidianEditor extends Editor {
  cm?: EditorView;
}

// You can also create more specific types for your use cases:
interface CodeMirrorCursor {
  line: number;
  ch: number;
}

export default class TextFlowPlugin extends Plugin {
  settings: TextFlowSettings;
  tempFilePath: string;

  // ---------------- Functions ------------------------------------
  // ---------------- Functions: Utilities -------------------------
  async loadSettings(): Promise<TextFlowSettings> {
    try {
      const loadedSettings = await this.loadData();
      return Object.assign({}, DEFAULT_SETTINGS, loadedSettings);
    } catch (error) {
      console.error("Failed to load settings:", error);
      new Notice("Failed to load settings, using defaults");
      return { ...DEFAULT_SETTINGS };
    }
  }
  // ---------------------------------------------------------------
  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
  // ---------------------------------------------------------------
  async ensureTempFolder() {
    console.log(`tempFolderPlace: ${this.settings.tempFolderPlace}`);
    const tempFolderPath: string = `${this.settings.tempFolderPlace}/x_textFlowTemp`;
    try {
      let folder = this.app.vault.getAbstractFileByPath(tempFolderPath);
      if (!folder) {
        await this.app.vault.createFolder(tempFolderPath);
        console.log(`Temp folder created at ${tempFolderPath}`);
      } else if (!(folder instanceof TFolder)) {
        throw new Error(`"${tempFolderPath}" exists but is not a folder.`);
      }
    } catch (error) {
      console.error(`Error handling temp folder: ${error.message}`);
      new Notice("Failed to create or verify temp folder");
    }
  }

  // ---------------- Functions: Utilities: UI -------------------------
  discernAndSetTempFolderState = (
    tempFolderState?: boolean,
    tempFolderPlace?: string
  ): void => {
    console.log(`Checking hidden state. It is ${tempFolderState}`);

    // Remove any existing style
    const existingStyle = document.head.querySelector(
      "style[data-textflow-temp]"
    );
    if (existingStyle) {
      existingStyle.remove();
    }

    // If we're not hiding or don't have a place defined, just return after removing style
    if (!tempFolderState || tempFolderPlace === undefined) {
      return;
    }

    let hiddenStyle = document.createElement("style");
    hiddenStyle.setAttribute("data-textflow-temp", "true");

    // Construct the full path
    let tempFolderPath = tempFolderPlace
      ? `${tempFolderPlace}/x_textFlowTemp`
      : "x_textFlowTemp";

    // More specific CSS selector that only targets the temp folder and its direct children
    hiddenStyle.textContent = `
			div[data-path='${tempFolderPath}'],
			div[data-path^='${tempFolderPath}/'] {
				display: none !important;
			}
		`;

    document.head.appendChild(hiddenStyle);
    console.log(`Set style to hidden for path: ${tempFolderPath}`);
  };

  // ---------------- Functions: Listeners -------------------------
  // ---------------- Functions: Listeners: Global -----------------

  addListeners() {
    // ---------------- File mod -------------------------------
    this.registerEvent(
      // File modifications
      this.app.vault.on("modify", (file) => {
        console.log(`File modified: ${file.path}`);
      })
    );

    // ----------------  ----------------------------------
    /*	this.registerEvent(
			// Get active leaf and update active region when appropriate
			this.app.workspace.on(
				"active-leaf-change",
				(activeLeaf: WorkspaceLeaf | null) => {
					if (activeLeaf && activeLeaf.view instanceof MarkdownView) {
						const activeLeafPath = activeLeaf.view.file?.path;
						const editor = activeLeaf.view.editor;
						if (editor && activeLeafPath !== undefined) {
							const lineCharCursor = editor.getCursor(); // {line: 0, ch: 0}
							const cursorOffset = editor.posToOffset(lineCharCursor); // Convert to offset
							this.updateActiveRegion(
								this.settings,
								activeLeafPath,
								cursorOffset
							);
						}
					} else {
						console.log("No active markdown leaf on startup.");
					}
				}
			)
		);*/
    // ----------------  ----------------------------------
    /*this.registerEvent(
			this.app.workspace.on("editor-change", (editor: Editor) => {
				if (!this.cursorListener) {
					const cmEditor = (editor as any).cm; // Access CodeMirror instance using type assertion
					if (cmEditor) {
						// Create and store the new listener
						this.cursorListener = cmEditor.on("cursorActivity", () => {
							const cursor = cmEditor.getCursor(); // { line: number, ch: number }
							const offset = cmEditor.posToOffset(cursor); // Convert to offset
							console.log("Cursor moved:", cursor);
							console.log("Cursor offset:", offset);

							const activeLeaf =
								this.app.workspace.getActiveViewOfType(MarkdownView);
							if (activeLeaf && this.settings.flowLeafInFocus) {
								const activeLeafPath = activeLeaf.file?.path;
								const editor = activeLeaf.editor;
								if (editor && activeLeafPath !== undefined) {
									const lineCharCursor = editor.getCursor(); // {line: 0, ch: 0}
									const cursorOffset = editor.posToOffset(lineCharCursor); // Convert to offset
									this.updateActiveRegion(
										this.settings,
										activeLeafPath,
										cursorOffset
									);
								}
							} else {
								console.log("No active markdown leaf.");
							}
						});
					}
				}
			})
		);*/
  }
  // ---------------- Functions: Listeners: Individual ----------

  // leaf.view as MarkdownView
  listenerBasket: { [key: string]: EventRef } = {};
  addCursorListener = (leaf: MarkdownView) => {
    // called onload
    const editor = leaf.editor as ObsidianEditor;
    const cmEditor = editor.cm;
    const activeLeafPath = leaf.file?.path;

    if (
      cmEditor &&
      activeLeafPath !== undefined &&
      this.isFlowFile(activeLeafPath)
    ) {
      // Define the callback function separately so we can remove it later
      const cursorCallback = () => {
        const state = cmEditor.state;
        const selection = state.selection.main;

        // Convert selection.from (which is a flat offset) to line/column
        const pos = state.doc.lineAt(selection.from);
        const cursorOffset = selection.from;
        console.log("Cursor offset:", cursorOffset);
        this.updateActiveRegion(this.settings, activeLeafPath, cursorOffset);
      };

      // Instead of .on(), use EditorView.updateListener
      const updateListener = EditorView.updateListener.of((update) => {
        if (update.selectionSet) {
          cursorCallback();
        }
      });

      // Add the listener
      cmEditor.dispatch({
        effects: StateEffect.appendConfig.of([updateListener]),
      });
      console.log(
        `Flow ${this.isFlowFile(activeLeafPath)} is now being listened to`
      );
      //add flow to the activeFlow array if it's not in there yet
      const currentFlow = this.isFlowFile(activeLeafPath);
      if (
        currentFlow !== null &&
        activeLeafPath &&
        !this.settings.activeFlows.includes(currentFlow)
      ) {
        this.settings.activeFlows.unshift(currentFlow);
        this.saveSettings();
      }
      // Store the listener for removal later
      this.listenerBasket[activeLeafPath] = updateListener;
    }
  };
  // ---------------------------------------------------------
  removeCursorListener = (leaf: MarkdownView) => {
    const activeLeafPath = leaf.file?.path;
    if (activeLeafPath !== undefined && this.listenerBasket[activeLeafPath]) {
      const editor = leaf.editor as ObsidianEditor;
      const cmEditor = editor.cm;
      if (cmEditor) {
        // Remove the listener
        cmEditor.dispatch({
          effects: StateEffect.reconfigure.of([]),
        });
        // Remove from the basket
        delete this.listenerBasket[activeLeafPath];
        console.log(`Listener removed for: ${activeLeafPath}`);
      }
    }
  };

  // ---------------------------------------------------------
  private boundFileExplorerClick: (event: MouseEvent) => void;

  fileExplorerClickListener() {
    this.boundFileExplorerClick = async (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const fileItem = target.closest(".nav-file-title");

      if (!fileItem) return;
      const clickedFilePath = fileItem.getAttribute("data-path");
      console.log("File explorer click detected on:", clickedFilePath);

      if (!clickedFilePath) return;
      const file = this.app.vault.getAbstractFileByPath(clickedFilePath);
      console.log("File object:", file);

      if (!(file instanceof TFile)) return;

      const leaves = this.app.workspace.getLeavesOfType("markdown");
      let fileLeaf = leaves.find(
        (leaf) =>
          leaf.view instanceof MarkdownView &&
          (leaf.view as MarkdownView).file?.path === clickedFilePath
      );

      const currentFlow = this.isFlowFile(clickedFilePath);
      if (currentFlow) {
        // Case: File is a flow (either already open or not)
        event.preventDefault();
        console.log(`File is flow: ${currentFlow}`);

        if (fileLeaf) {
          // Flow is already open, just focus it
          console.log(`${currentFlow} is open; making it active`);
          this.app.workspace.setActiveLeaf(fileLeaf);
        } else {
          // Flow needs to be opened
          console.log(`${currentFlow} opened in new leaf`);
          fileLeaf = this.app.workspace.getLeaf(false); // Changed to false to use existing tab
          await fileLeaf.openFile(file);

          if (!this.settings.activeFlows.includes(currentFlow)) {
            this.settings.activeFlows.unshift(currentFlow);
            this.saveSettings();
          }
        }

        // Add cursor listener if it's a MarkdownView
        if (fileLeaf.view instanceof MarkdownView) {
          this.addCursorListener(fileLeaf.view);
        }
        return;
      }

      // Check if the file is part of any flow
      console.log(`${clickedFilePath} is not a flow`);
      for (const [flowName, flow] of Object.entries(
        this.settings.flows as Record<string, Types.FlowDef>
      )) {
        if (flow.flowMap[clickedFilePath]) {
          console.log(`${clickedFilePath} is part of flow ${flowName}`);
          event.preventDefault();

          const startPos = flow.flowMap[clickedFilePath].startEndInFlow.start;

          // Find if the flow is already open
          let flowLeaf = leaves.find(
            (leaf) =>
              leaf.view instanceof MarkdownView &&
              (leaf.view as MarkdownView).file?.path === flowName
          );

          if (flowLeaf) {
            console.log(`${flowName} is open; making it active`);
            this.app.workspace.setActiveLeaf(flowLeaf);
          } else {
            console.log(`${flowName} opened in new leaf`);
            flowLeaf = this.app.workspace.getLeaf(false); // Changed to false
            await flowLeaf.openFile(
              this.app.vault.getAbstractFileByPath(flowName) as TFile
            );

            if (!this.settings.activeFlows.includes(flowName)) {
              this.settings.activeFlows.unshift(flowName);
              this.saveSettings();
            }
          }

          if (flowLeaf?.view instanceof MarkdownView) {
            const editor = flowLeaf.view.editor;
            if (editor) {
              const cursorPos = editor.offsetToPos(startPos);
              editor.setCursor(cursorPos);
              editor.scrollIntoView({ from: cursorPos, to: cursorPos });
              this.addCursorListener(flowLeaf.view);
            }
          }
          return;
        }
      }

      // If the file is neither a flow nor part of a flow
      if (!currentFlow) {
        event.preventDefault();

        if (fileLeaf) {
          this.app.workspace.setActiveLeaf(fileLeaf);
        } else {
          this.app.workspace.openLinkText(
            clickedFilePath,
            "",
            false // Don't open in new pane
          );
        }
      }
    };
  }

  // ---------------- Functions: Flow management -------------------------

  isFlowFile = (activeLeafPath: string) => {
    console.log(`checking if ${activeLeafPath} is a flow`);
    const flowName = activeLeafPath.match(/([^/]+)(?=\.md$)/)?.[0]; // gets the flow name out of the path
    console.log(`Clicked file is: ${flowName}`);
    if (flowName && this.settings.flows[flowName]) {
      console.log(`Yup, it's a flow!`);
      if (!this.settings.activeFlows.includes(flowName)) {
        this.settings.activeFlows.unshift(flowName);
        this.saveSettings();
        console.log(`Set ${flowName} to active.`);
      }
      return flowName;
    } else {
      console.log(`Nope, ${activeLeafPath} is not a flow file`);
      return null;
    }
  };

  // --------------------------------------------------------------------
  private updateActiveRegion = (
    shSettings: TextFlowSettings,
    activeLeafPath: string, // path of the flowFile
    cursorOffset: number
  ) => {
    if (shSettings.activeFlows) {
      console.log(`updating active region`);
      const flowName = activeLeafPath.match(/([^/]+)(?=\.md$)/)?.[0]; // gets the flow name out of the path
      console.log(`Active flow is: ${flowName}`);
      if (flowName && shSettings.activeFlows.includes(flowName)) {
        shSettings.flowLeafInFocus = true;
        Object.entries(shSettings.flows[flowName].flowMap).forEach(
          ([key, flowMapItem]) => {
            const shStartEndInFlow = flowMapItem.startEndInFlow;
            const shActiveRegionStartEnd =
              shSettings.flows[flowName].activeRegionStartEnd;
            // Check start and end and update if appropriate
            if (
              shActiveRegionStartEnd.start > cursorOffset ||
              shActiveRegionStartEnd.end < cursorOffset
            ) {
              shSettings.flows[flowName].activeRegion = flowMapItem.path;
              console.log(`Active region is: ${flowMapItem.path}`);
              shActiveRegionStartEnd.start = shStartEndInFlow.start;
              shActiveRegionStartEnd.end =
                shStartEndInFlow.end - shSettings.divider.length;
            }
            // check and set region type
            if (
              (flowMapItem.type === "file" &&
                cursorOffset >
                  shActiveRegionStartEnd.end - shSettings.divider.length &&
                cursorOffset < shActiveRegionStartEnd.end) ||
              (flowMapItem.type === "folder" &&
                cursorOffset >
                  shActiveRegionStartEnd.start - shSettings.divider.length &&
                cursorOffset < shActiveRegionStartEnd.end)
            ) {
              shSettings.flows[flowName].activeRegionType = "divider";
            }
          }
        );
      } else {
        shSettings.flowLeafInFocus = false;
        // Update cursor listening
        console.log(`The active leaf doesn't contain a flow`);
      }
    }
  };
  // -------------------------------------------------------
  //------------------------- ONLOAD -----------------------
  // -------------------------------------------------------
  async onload() {
    console.log("TextFlow Plugin loaded.");

    // ------ ONLOAD: get the settings ------------------
    this.settings = await this.loadSettings();

    // ------ ONLOAD: if plugin has been set up before, make sure the temp folder exists ------------
    if (
      this.settings.tempFolderPlace !== "not set yet" &&
      this.settings.tempFolderPlace !== undefined
    ) {
      this.ensureTempFolder();
    }

    // ----- ONLOAD: set up UI -------------------------
    // -------------------------------------------------------------------
    //this.settings.tempFolderHidden = false; // REMOVE BEFORE SHIPPING
    // -------------------------------------------------------------------
    this.discernAndSetTempFolderState(
      this.settings.tempFolderHidden,
      this.settings.tempFolderPlace
    );
    this.saveSettings();

    // ------- ONLOAD: check all markdown leaves if they are a flow and add cursor listener ------

    const allLeaves = this.app.workspace.getLeavesOfType("markdown");
    // Iterate over all the leaves
    for (const leaf of allLeaves) {
      if (leaf.view instanceof MarkdownView) {
        const activeLeafPath = leaf.view.file?.path;
        // Now you can check if the leaf's path should be in the listener basket or not
        // If it's part of the active flow, attach the listener
        if (activeLeafPath !== undefined && this.isFlowFile(activeLeafPath)) {
          this.addCursorListener(leaf.view);
          const flowName = this.isFlowFile(activeLeafPath);
          if (flowName && !this.settings.activeFlows.includes(flowName)) {
            this.settings.activeFlows.push(flowName);
            this.saveSettings();
          }
          console.log(`onload added listener to flow ${flowName}}`);
        }
      }
    }
    // ------------------- ONLOAD: add listener for clicks
    // Wait for the file explorer to be available in the DOM
    this.app.workspace.onLayoutReady(() => {
      this.fileExplorerClickListener(); // This only creates the function

      // Add this to actually attach the listener:
      const fileExplorer = document.querySelector(".nav-files-container");
      if (fileExplorer && this.boundFileExplorerClick) {
        fileExplorer.addEventListener("click", this.boundFileExplorerClick);
        console.log("File explorer click listener added");
      } else {
        console.log(
          "Could not find file explorer or click listener not defined"
        );
      }
    });

    // ----------- ONLOAD: add global listeners ------------------------------------

    this.addListeners();

    // ----------- ONLOAD: register settingsTab ------------------------------------
    this.addSettingTab(new TextFlowSettingsTab(this.app, this));
  }

  // -------------------------------------------------------
  // ------------------ ONUNLOAD---------------------------
  // -------------------------------------------------------
  onunload() {
    console.log("TextFlow Plugin unloaded.");

    // ------------ ONUNLOAD: REMOVE cursor listeners -----------
    for (const path in this.listenerBasket) {
      // Get all leaves of the MarkdownView type
      const leaves = this.app.workspace.getLeavesOfType("markdown");

      for (const leaf of leaves) {
        // Check if the leaf's view is a MarkdownView and if its file path matches
        if (
          leaf.view instanceof MarkdownView &&
          leaf.view.file?.path === path
        ) {
          let markdownView = leaf.view as MarkdownView; // Cast the view to MarkdownView
          this.removeCursorListener(markdownView);
        }
      }
    }

    //------------ ONUNLOAD: REMOVE explorer click listener -----------
    const fileExplorer = document.querySelector(".nav-files-container");
    if (fileExplorer && this.boundFileExplorerClick) {
      fileExplorer.removeEventListener("click", this.boundFileExplorerClick);
    }
  }
  // ------------------ ONUNLOAD: remove global listeners -------------------
  removeListeners() {}
}
