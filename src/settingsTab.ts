import { App, PluginSettingTab, Setting, TFolder, Notice } from "obsidian";
import TextFlow from "main";
import * as Modals from "./modals";

export class TextFlowSettingsTab extends PluginSettingTab {
	plugin: TextFlow;

	constructor(app: App, plugin: TextFlow) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		//#######################################################################
		//###########################   Shorthands   ############################
		//#######################################################################
		const shFlowObjects = this.plugin.settings.flowObjects


		//#######################################################################
		//###########################    Functions   ############################
		//#######################################################################

		const newTempFolderCreation = async (newTempFolderPath: string) => {
			try {
				// Ensure the folder exists, create it if necessary
				let newTempFolder =
					this.app.vault.getAbstractFileByPath(newTempFolderPath);
				if (!newTempFolder) {
					await this.app.vault.createFolder(newTempFolderPath);
					console.log(`Temp folder created at ${newTempFolderPath}`);
				} else if (!(newTempFolder instanceof TFolder)) {
					throw new Error(`"${newTempFolderPath}" exists but is not a folder.`);
				}
			} catch (e) {
				console.log(
					`Something went wrong when trying to create ${newTempFolderPath}: ${e}`
				);
			}
		};

		const constructTempFolderPath = (basePath: string) => {
			if (basePath === "") {
				return "x_textFlowTemp"; // No leading slash for root
			}
			return `${basePath}/x_textFlowTemp`;
		};

	const flowFileMaker = async () => {
		Object.keys(shFlowObjects).forEach((flow) => {
			// create file with name
			// read content
			// read and save start and end
			// read and save last modified
			// concatenate content
		});


		//#######################################################################
		//###########################   Settings Tab   ##########################
		//#######################################################################

		containerEl.empty();
		containerEl.addClass("create-flows");

		const headlineContainer = containerEl.createDiv({
			cls: "headline-container",
		});
		headlineContainer.createEl("h3", {
			text: "Create your flows",
			cls: "headline-text",
		});

		// Set a temp folder in which all temp files will be stored
		const setTempFolder = new Setting(headlineContainer)
			.setName("tempFolder")
			.setDesc(
				"textFlow needs a hidden folder to keep its temporary files in. Please specify the folder in which this may be created. If you don't specify a folder, the temp folder will be created in the root folder of your vault."
			);
		if (
			// if this is the first initialisation of the plugin
			this.plugin.settings.tempFolderPlace === null ||
			this.plugin.settings.tempFolderPlace === undefined
		) {
			this.plugin.settings.tempFolderPlace = "not set yet";
		}
		let newTempFolderPlace: string = "not set yet";
		setTempFolder
			.addText((text) =>
				text
					.setValue(
						this.plugin.settings.tempFolderPlace === "not set yet" ||
							this.plugin.settings.tempFolderPlace === ""
							? "root"
							: this.plugin.settings.tempFolderPlace
					)
					.onChange(async (value) => {
						newTempFolderPlace = value.toString();
						console.log(`newTempFolderPlace = ${value};`);
					})
			)
			.addButton((createButton) => {
				createButton.setButtonText("Create");
				createButton.onClick(async () => {
					console.log("createButton clicked.");
					// make sure newTempFolderPlace is at least ""
					if (
						newTempFolderPlace === "not set yet" ||
						newTempFolderPlace === "root" ||
						newTempFolderPlace === "/" ||
						newTempFolderPlace === undefined ||
						newTempFolderPlace === null
					) {
						newTempFolderPlace = "";
						console.log(`newTempFolderPlace changed to = ""`);
					}

					if (this.plugin.settings.tempFolderPlace === "not set yet") {
						// if this is the first init of the plugin
						this.plugin.settings.tempFolderPlace = "";
						console.log(`It's the first init of the plugin`);
						let initTempFolderPath: string = constructTempFolderPath(
							this.plugin.settings.tempFolderPlace
						);
						console.log(`initTempFolderPath: ${initTempFolderPath}`);
						try {
							let initTempFolder =
								this.app.vault.getAbstractFileByPath(initTempFolderPath);
							console.log(`make ${initTempFolder} at ${initTempFolderPath}`);
							if (!initTempFolder) {
								await this.app.vault.createFolder(initTempFolderPath);
								console.log(
									`Initial temp folder created at ${initTempFolderPath}`
								);
								await this.plugin.saveSettings();
								new Notice(
									`Successfully created a new hidden temp folder: ${initTempFolderPath}`
								);
							} else if (!(initTempFolder instanceof TFolder)) {
								throw new Error(
									`"${initTempFolderPath}" exists but is not a folder.`
								);
							}
						} catch (e) {
							console.log(
								`Something went wrong when trying to create ${initTempFolderPath}: ${e}`
							);
						}
					} else if (this.plugin.settings.tempFolderPlace !== "not set yet") {
						console.log(`Plugin has been set up before.`);
						// if the plugin has been setup before
						let oldTempFolderPlace: string =
							this.plugin.settings.tempFolderPlace;
						console.log(`oldTempFolderPlace: ${oldTempFolderPlace}`);
						console.log(`newTempFolderPlace: ${newTempFolderPlace}`);
						// get get path of old temp folder
						let oldTempFolderPath: string =
							constructTempFolderPath(oldTempFolderPlace);
						// make get path for new temp folder
						let newTempFolderPath: string =
							constructTempFolderPath(newTempFolderPlace);
						if (
							// check if new and old name are different
							newTempFolderPlace !== oldTempFolderPlace
						) {
							console.log(
								`New place ${newTempFolderPlace} is different from old place ${oldTempFolderPlace}`
							);
							// if they are different, ask user if they want to delete or rename the old temp folder
							const deleteOldTempFolder = new Modals.DeleteOldTempFolderModal(
								this.app,
								this.plugin,
								newTempFolderCreation,
								oldTempFolderPath,
								newTempFolderPath
							);
							deleteOldTempFolder.open();
						} else {
							return;
						}
					}
				});
			});

		// Create a new flow
		const createNewFlow = new Setting(headlineContainer)
			.setName("createFlow")
			.setDesc(
				"Flows can be created from folders, but also from hashtags. For the hashtag to work, you have to add it to the YAML of the files you  "
			)
			.addText((text) =>
				text
					.setPlaceholder(
						"Enter a name for the temporary file of this flow. If you don't choose one, it will be named after the folder or the hashtag is was created from."
					)
					.setValue(
						this.plugin.settings.tempFolderPlace
							? this.plugin.settings.tempFolderPlace
							: "root"
					)
					.onChange(async (value) => {
						this.plugin.settings.tempFolderPlace = value;
						await this.plugin.saveSettings();
					})
			)
			.addButton((button) => {
				button.setButtonText("Create");
				button.onClick(async () => {});
			});

		// name the flow  - > this.plugin.settings.flowObjects.flow (save on input)
		// Input a file path to make the flow out of this file; input a hashtag to make an abstract flow.
		const setFlowFile = new Setting(containerEl)
			.setName("flowFile")
			.setDesc(
				"If you want your flow's temp file to have a specific name, you can enter it here. Else it will be called after the folder or hashtag it's created from."
			)
			.addText((text) =>
				text
					.setPlaceholder("Enter the complete folder path")
					.setValue(this.plugin.settings.flowObjects.flow.flowFile)
					.onChange(async (value) => {
						this.plugin.settings.flowObjects.flow.flowFile = value;
						await this.plugin.saveSettings();
					})
			);
	}

	// ########### YOUR FLOWS ###################
	// rename flows, change flows, delete flows
}
