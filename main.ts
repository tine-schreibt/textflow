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
} from "obsidian";
import { TextFlowSettingsTab } from "./src/settingsTab";
import { TextFlowSettings, DEFAULT_SETTINGS } from "./src/types";
// import { TextFlow } from "./src/flowMaker";

export default class TextFlowPlugin extends Plugin {
	settings: TextFlowSettings;
	tempFilePath: string;

	discernAndSetTempFolderState = (
		tempFolderState?: boolean,
		tempFolderPlace?: string
	): void => {
		console.log(`Checking hidden state. It is ${tempFolderState}`);
		// Remove any existing style first
		const existingStyle = document.head.querySelector(
			"style[data-textflow-temp]"
		);
		if (existingStyle) {
			existingStyle.remove();
		}

		let hiddenStyle = document.createElement("style");
		hiddenStyle.setAttribute("data-textflow-temp", "true");

		if (tempFolderState === undefined) {
			tempFolderState = false;
		}
		if (tempFolderState && tempFolderPlace !== undefined) {
			let tempFolderPath = `${tempFolderPlace}/x_textFlowTemp`; // Ensure correct relative path
			hiddenStyle.textContent = `
            div[data-path='${tempFolderPath}'], 
            div[data-path='${tempFolderPath}'] + div.nav-folder-children {
                display: none;
            }
        `;
			document.head.appendChild(hiddenStyle);
			console.log(`Set style to hidden`);
		}
	};

	private updateActiveRegion = (
		shSettings: TextFlowSettings,
		activeLeafPath: string, // path of the flowFile
		cursorOffset: number
	) => {
		if (shSettings.activeFlows) {
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
	//------------------------- declare cursorListener for the event listener further down -----------------------
	private cursorListener: { off: () => void } | null = null;

	//------------------------- do stuff at wakeup -----------------------
	async onload() {
		console.log("TextFlow Plugin loaded.");

		// Load settings
		this.settings = await this.loadSettings();

		if (this.settings.tempFolderPlace !== "not set yet") {
			this.ensureTempFolder();
		}

		// Initialize the TEMP FILE
		// this.tempFilePath = await this.createTempFile();
		// -------------------------------------------------------------------
		this.settings.tempFolderHidden = false; // REMOVE BEFORE SHIPPING
		// -------------------------------------------------------------------
		this.discernAndSetTempFolderState(
			this.settings.tempFolderHidden,
			this.settings.tempFolderPlace
		);
		this.saveSettings();

		// Get active leaf and update active region when appropriate
		const activeLeaf = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (activeLeaf) {
			const activeLeafPath = activeLeaf.file?.path;
			const editor = activeLeaf.editor;
			if (editor && activeLeafPath !== undefined) {
				const lineCharCursor = editor.getCursor(); // {line: 0, ch: 0}
				const cursorOffset = editor.posToOffset(lineCharCursor); // Convert to offset
				this.updateActiveRegion(this.settings, activeLeafPath, cursorOffset);
			}
		} else {
			console.log("No active markdown leaf on startup.");
		}

		// Add DOM event listeners
		this.addListeners();

		// Register settings tab
		this.addSettingTab(new TextFlowSettingsTab(this.app, this));
	}
	// ---------------------------- on unload ---------------------------------------
	onunload() {
		console.log("TextFlow Plugin unloaded.");

		// Remove listeners or clean up if needed
		this.removeListeners();
		if (this.cursorListener) {
			this.cursorListener.off(); // Detach the CodeMirror event
			this.cursorListener = null;
		}
	}
	// ---------------- utilities -------------------------
	async loadSettings(): Promise<TextFlowSettings> {
		const loadedSettings = await this.loadData();
		return Object.assign({}, DEFAULT_SETTINGS, loadedSettings);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	ensureTempFolder = async () => {
		console.log(`tempFolderPlace: ${this.settings.tempFolderPlace}`);
		const tempFolderPath: string = `${this.settings.tempFolderPlace}/x_textFlowTemp`;
		try {
			// Ensure the folder exists, create it if necessary
			let folder = this.app.vault.getAbstractFileByPath(tempFolderPath);
			if (!folder) {
				await this.app.vault.createFolder(tempFolderPath);
				console.log(`Temp folder created at ${tempFolderPath}`);
			} else if (!(folder instanceof TFolder)) {
				throw new Error(`"${tempFolderPath}" exists but is not a folder.`);
			}
		} catch {
			console.log(`Folder already exists at ${tempFolderPath}.`);
		}
	};

	// ------------------------- Listeners -------------------------------
	addListeners() {
		this.registerEvent(
			// File modifications
			this.app.vault.on("modify", (file) => {
				console.log(`File modified: ${file.path}`);
			})
		);
		this.registerEvent(
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
		);

		this.registerEvent(
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
		);
	}

	removeListeners() {}
}
