import TextFlowPlugin from "main";
import {
	App,
	Notice,
	setIcon,
	DropdownComponent,
	Modal,
	TextComponent,
	Setting,
	TFolder,
} from "obsidian";

export class DeleteOldTempFolderModal extends Modal {
	private plugin: TextFlowPlugin;
	private newTempFolderCreation: (path: string) => Promise<void>; // Changed this line
	private oldTempFolderPath: string;
	private newTempFolderPath: string;

	constructor(
		app: App,
		plugin: TextFlowPlugin,
		newTempFolderCreation: (path: string) => Promise<void>,
		oldTempFolderPath: string,
		newTempFolderPath: string
	) {
		super(app);
		this.plugin = plugin;
		this.newTempFolderCreation = newTempFolderCreation;
		this.oldTempFolderPath = oldTempFolderPath;
		this.newTempFolderPath = newTempFolderPath;
	}
	onOpen() {
		const { contentEl } = this;

		const modalTitle = contentEl.createEl("h2", {
			text: `Delete or keep old temporary folder`,
		});
		const modalText = contentEl.createEl("span", {
			text: `Do you want to delete the old temp folder or keep it and unhide it? The new temp folder will be created at the location specified in the settings.`,
		});
		//
		//
		//
		//
		///////////////  SAVe TEMPFOLDERPLACE!!!!!!!!!!!!!
		//
		//
		//
		//
		//
		//
		//
		//
		//
		//

		new Setting(modalText)
			.addButton((deleteButton) =>
				deleteButton
					.setButtonText("Delete old temp folder")
					.onClick(async () => {
						console.log(`this.oldTempFolderPath ${this.oldTempFolderPath}`);
						const oldTempFolder = this.app.vault.getAbstractFileByPath(
							this.oldTempFolderPath
						);

						// Check if the folder is either null or not an instance of TFolder
						if (oldTempFolder === null || !(oldTempFolder instanceof TFolder)) {
							console.log(
								`Folder at ${this.oldTempFolderPath} doesn't exist or is not a folder.`
							);
							return; // Exit early, as there's nothing to delete or it's not a folder.
						}
						try {
							// Delete the old folder
							await this.app.vault.delete(oldTempFolder);
							console.log(`Deleted oldTempFolder: ${oldTempFolder}`);

							// Create the new temp folder
							await this.newTempFolderCreation(this.newTempFolderPath);
							new Notice(
								`Successfully deleted old temp folder from ${this.oldTempFolderPath} and created a new hidden temp folder: ${this.newTempFolderPath}`
							);
						} catch (error) {
							console.error(`Failed to delete or create folder:`, error);
						}
						await this.plugin.saveSettings();
						this.close();
					})
			)
			.addButton((unhideButton) =>
				unhideButton
					.setButtonText("Keep and unhide old temp folder")
					.onClick(async () => {
						const oldTempFolder = this.app.vault.getAbstractFileByPath(
							this.oldTempFolderPath
						);
						if (!oldTempFolder || !(oldTempFolder instanceof TFolder)) {
							console.log(
								`Folder at ${this.oldTempFolderPath} doesn't exist or is not a folder.`
							);
							this.close();
							return;
						}

						try {
							const parentPath = oldTempFolder.parent?.path || "";
							const newPath = `${
								parentPath ? parentPath + "/" : ""
							}oldTempFolder`;
							await this.app.vault.rename(oldTempFolder, newPath);
							await this.newTempFolderCreation(this.newTempFolderPath);
							new Notice(
								`Successfully unhidden old temp folder in ${this.oldTempFolderPath} and created a new hidden temp folder: ${this.newTempFolderPath}`
							);
						} catch (error) {
							console.error(`Failed to rename folder:`, error);
						}
						await this.plugin.saveSettings();
						this.close();
					})
			);
	}

	onClose() {
		this.contentEl.empty();
	}
}
