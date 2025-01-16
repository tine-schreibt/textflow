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

export class FlowView extends ItemView {
	// Properties
	private editorView: EditorView;
	private flowFolder: string;

	constructor(leaf: WorkspaceLeaf, private plugin: Plugin, flowFolder: string) {
		super(leaf);
		this.app = plugin.app; // Initialize this.app properly
		this.flowFolder = flowFolder;
	}

	async onload() {
		super.onload();
		await this.initView();

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
	}

	private isFileInFlowFolder(file: TAbstractFile): boolean {
		return file.path.startsWith(this.flowFolder);
	}

	async initView(): Promise<void> {
		const container = this.containerEl.createDiv("flow-view-container");

		this.editorView = new EditorView({
			state: EditorState.create({
				doc: "Loading content...",
				extensions: [
					basicSetup,
					syntaxHighlighting(defaultHighlightStyle),
					EditorView.editable.of(false), // Make read-only for now
				],
			}),
			parent: container,
		});

		await this.loadContent();
	}

	async loadContent(): Promise<void> {
		try {
			const folder = this.app.vault.getAbstractFileByPath(this.flowFolder);

			if (!folder || !(folder instanceof TFolder)) {
				new Notice(`Flow folder not found: ${this.flowFolder}`);
				return;
			}

			const combinedText = await this.processFolder(folder);

			this.editorView.dispatch({
				changes: {
					from: 0,
					to: this.editorView.state.doc.length,
					insert: combinedText,
				},
			});
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
		// Clean up the editor view
		this.editorView?.destroy();
		// Call the parent's onunload
		await super.onunload();
	}

	getViewType(): string {
		return FLOW_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Flow View";
	}
}
