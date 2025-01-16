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
	private flowViews: Map<WorkspaceLeaf, FlowView> = new Map(); // Better handling of multiple views
	private boundFileOpenHandler: (file: TFile | null) => void; // Store bound handler for cleanup

	async onload() {
		await this.loadSettings();

		// Register view
		this.registerView(FLOW_VIEW_TYPE, (leaf) => {
			const view = new FlowView(leaf, this, this.settings.flowFolder);
			this.flowViews.set(leaf, view);
			return view;
		});

		// Add click event listener to file explorer
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (file instanceof TFile && this.isFileInFlowFolder(file)) {
					menu.addItem((item) => {
						item
							.setTitle("Open in Flow View")
							.setIcon("document")
							.onClick(() => this.openOrFocusFlowView());
					});
				}
			})
		);

		// Intercept clicks in file explorer
		this.registerDomEvent(
			document,
			"click",
			(evt: MouseEvent) => {
				const target = evt.target as HTMLElement;
				const fileItem = target.closest(".nav-file-title") as HTMLElement;

				if (fileItem && fileItem.dataset.path) {
					const file = this.app.vault.getAbstractFileByPath(
						fileItem.dataset.path
					);
					if (file instanceof TFile && this.isFileInFlowFolder(file)) {
						evt.preventDefault();
						evt.stopPropagation();
						this.openOrFocusFlowView();
					}
				}
			},
			true
		); // true for useCapture - important to intercept before Obsidian

		// Add settings tab
		this.addSettingTab(new TextFlowSettingTab(this.app, this));
	}

	async onunload() {
		// Clean up views
		for (const [leaf, view] of this.flowViews) {
			await view.destroy(); // Make sure destroy is async-aware if needed
			await leaf.detach();
		}
		this.flowViews.clear();

		// Although registerEvent handles cleanup automatically, being explicit doesn't hurt
		this.app.workspace.off("file-open", this.boundFileOpenHandler);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
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
	private async openOrFocusFlowView() {
		const existingLeaf = this.app.workspace.getLeavesOfType(FLOW_VIEW_TYPE)[0];

		if (existingLeaf) {
			await this.app.workspace.setActiveLeaf(existingLeaf, { focus: true });
		} else {
			const leaf = this.app.workspace.getLeaf("split");
			await leaf.setViewState({
				type: FLOW_VIEW_TYPE,
				state: {},
			});
		}
	}
}
