import {
	App,
	Editor,
	ItemView,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	TFolder,
	Vault,
	WorkspaceLeaf,
} from "obsidian";
import { EditorState } from "@codemirror/state";
import { defaultHighlightStyle } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { FlowView, FLOW_VIEW_TYPE } from "src/flowView";
import { DEFAULT_SETTINGS, TextFlowSettings } from "src/types";
import { TextFlowSettingTab } from "src/settingsTab";

//#######################################################################
//###########################                ############################
//###########################     main.ts    ############################
//###########################                ############################
//#######################################################################

export default class TextFlow extends Plugin {
	settings: TextFlowSettings;
	private flowView: FlowView; // Declare flowView

	async onload() {
		await this.loadSettings();

		// Ensure workspace is initialized before proceeding
		this.app.workspace.on("layout-change", () => {
			// Check if there is already a FlowView
			this.openOrFocusFlowView();
		});

		// Add a settings tab
		this.addSettingTab(new TextFlowSettingTab(this.app, this));

		// Add event listener for file explorer clicks
		this.addFileExplorerClickListener();

		console.log("FlowFolder:", this.settings.flowFolder);
	}

	onunload() {
		// Clean up any resources when the plugin is unloaded
		this.app.workspace.detachLeavesOfType(FLOW_VIEW_TYPE);
		console.log("TextFlow plugin unloaded.");
		// Call FlowView's destroy method
		if (this.flowView) {
			this.flowView.destroy();
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// Add a listener for file clicks in the file explorer
	private addFileExplorerClickListener() {
		// Listen for file clicks in the file explorer
		this.app.workspace.on("file-open", (file: TFile) => {
			if (!file) {
				console.error("File is null.");
				console.log("File click failed:", file);

				return;
			}
			// Only react to files inside the flowFolder
			if (this.isFileInFlowFolder(file)) {
				this.openOrFocusFlowView();
				console.log("File click succeeded:", file);
			}
		});
	}

	// Check if the clicked file is part of the flowFolder
	private isFileInFlowFolder(file: TFile): boolean {
		if (!file) {
			return false; // Add this check to prevent reading properties of null
		}
		const flowFolder = this.settings.flowFolder;
		return file.path.startsWith(flowFolder);
	}

	// Open a new FlowView or focus on an existing one
	private openOrFocusFlowView() {
		// First, make sure the workspace is fully loaded
		if (!this.app.workspace) {
			console.error("Workspace is not ready yet.");
			return;
		}

		const flowViewLeaf = this.app.workspace.getLeavesOfType(FLOW_VIEW_TYPE)[0];
		if (flowViewLeaf) {
			// Focus the existing FlowView if it exists
			this.app.workspace.setActiveLeaf(flowViewLeaf);
		} else {
			// Open a new FlowView if none exists
			const leaf = this.app.workspace.getLeaf(true);
			// Make sure the leaf is valid before proceeding
			if (leaf) {
				const flowView = new FlowView(leaf, this, this.settings.flowFolder);
				leaf.setViewState({
					type: FLOW_VIEW_TYPE,
					state: {},
				});
				this.app.workspace.setActiveLeaf(leaf);
			} else {
				console.error("Failed to create a new leaf for FlowView.");
			}
		}
	}
}
