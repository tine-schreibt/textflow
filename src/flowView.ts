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

	constructor(leaf: WorkspaceLeaf, flowFolder: string) {
		super(leaf);
		this.flowFolder = flowFolder;

		// Create a virtual file context
		this.file = {
			path: `${flowFolder}/_flow_view.md`,
			basename: "_flow_view",
			extension: "md",
			name: "_flow_view.md",
			parent: this.app.vault.getAbstractFileByPath(flowFolder),
			vault: this.app.vault,
			stat: {
				ctime: Date.now(),
				mtime: Date.now(),
				size: 0,
			},
		} as TFile;
	}

	async onload() {
		console.log("FlowView onload started");
		super.onload();

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
				new Notice(`Flow folder not found: ${this.flowFolder}`);
				return;
			}

			const combinedText = await this.processFolder(folder);

			// Use the editor directly
			if (this.editor) {
				console.log("Editor found, setting content");
				this.editor.setValue(combinedText);
			} else {
				console.log("Editor not found!");
			}
		} catch (error) {
			new Notice(`Error loading flow content: ${error.message}`);
			console.error("Error loading content:", error);
		}
	}

	private async processFolder(folder: TFolder, depth = 0): Promise<string> {
		let content = `${"#".repeat(depth + 1)} ${folder.name}\n\n`;

		// Process files first
		for (const child of folder.children) {
			if (child instanceof TFile) {
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
