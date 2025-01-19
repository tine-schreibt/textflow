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
	TAbstractFile,
} from "obsidian";
import { EditorState } from "@codemirror/state";
import {
	defaultHighlightStyle,
	syntaxHighlighting,
} from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { TextFlow } from "./types";

export const FLOW_VIEW_TYPE = "flow-view"; // The name of the view

export class FlowView extends MarkdownView {
	// Properties
	private flowFolder: string;
	private tempFilePath: string;

	constructor(leaf: WorkspaceLeaf, flowFolder: string, tempFile: TFile) {
		super(leaf);
		this.flowFolder = flowFolder;
		this.file = tempFile;
	}

	async onload() {
		console.log("FlowView onload started");
		await super.onload();

		// Register file change events
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (this.isFileInFlowFolder(file)) {
					this.loadContent();
				}
			})
		);

		this.registerEvent(
			this.app.vault.on("create", (file) => {
				if (this.isFileInFlowFolder(file)) {
					this.loadContent();
				}
			})
		);

		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				if (this.isFileInFlowFolder(file)) {
					this.loadContent();
				}
			})
		);

		await this.loadContent();
		console.log("FlowView onload completed");
	}

	private isFileInFlowFolder(file: TAbstractFile): boolean {
		return file.path.startsWith(this.flowFolder);
	}

	async initView(): Promise<void> {
		// Add CSS class for styling
		this.containerEl.addClass("flow-view-container");
		await this.loadContent();
	}

	async loadContent(): Promise<void> {
		console.log("loadContent started");
		try {
			const folder = this.app.vault.getAbstractFileByPath(this.flowFolder);
			console.log("Flow folder:", folder);

			if (!folder || !(folder instanceof TFolder)) {
				console.log("Invalid folder:", this.flowFolder);
				new Notice(`Flow folder not found: ${this.flowFolder}`);
				return;
			}

			console.log("Processing folder...");
			const combinedText = await this.processFolder(folder);
			console.log("Combined text length:", combinedText.length);

			if (this.file) {
				console.log("Writing to temp file...");
				await this.app.vault.modify(this.file, combinedText);
				console.log("Content written to temp file");

				if (this.editor) {
					console.log("Refreshing editor");
					this.editor.refresh();
				}
			} else {
				console.error("No temp file available!");
			}
		} catch (error) {
			console.error("Error in loadContent:", error);
			new Notice(`Error loading flow content: ${error.message}`);
		}
	}

	private async processFolder(folder: TFolder, depth = 0): Promise<string> {
		console.log(`Processing folder: ${folder.path} at depth ${depth}`);
		let content = `${"#".repeat(depth + 1)} ${folder.name}\n\n`;

		// Process files first
		for (const child of folder.children) {
			if (child instanceof TFile) {
				console.log(`Reading file: ${child.path}`);
				const noteContent = await this.app.vault.read(child);
				content += `### ${child.name}\n${noteContent}\n---\n\n`;
			}
		}

		// Then process subfolders
		for (const child of folder.children) {
			if (child instanceof TFolder) {
				content += await this.processFolder(child, depth + 1);
			}
		}

		return content;
	}

	async destroy() {
		await super.onunload();
	}

	getViewType(): string {
		return FLOW_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Flow View";
	}

	getIcon(): string {
		return "documents";
	}

	getState(): any {
		return {
			type: FLOW_VIEW_TYPE,
			folder: this.flowFolder,
		};
	}

	async setState(state: any, result: any): Promise<void> {
		await super.setState(state, result);
		if (state.folder) {
			this.flowFolder = state.folder;
			await this.loadContent();
		}
	}
}
