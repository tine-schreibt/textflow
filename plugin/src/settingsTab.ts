import * as Modals from "./modals";
import {
  App,
  ButtonComponent,
  normalizePath,
  Notice,
  PluginSettingTab,
  setIcon,
  Setting,
} from "obsidian";
import TextFlow from "../main";
import * as Types from "./types";
import { dirname } from "path";

// Any code that was actually written by AI is labelled

// ----------------------------------
// Find TOC by looking at settingsTab
// ----------------------------------

// --- The class that defines the settings tab
export class TextFlowSettingsTab extends PluginSettingTab {
  plugin: TextFlow;

  constructor(app: App, plugin: TextFlow) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display = () => {
    const { containerEl } = this;
    containerEl.empty();

    const setUpTextFlow = containerEl.createDiv({
      cls: "headline-container",
    });

    //--------------------------------------------------------------------------------
    // SET UP A SYSTEM FOLDER

    const systemFolder = this.plugin.settingsTabFunctions.checkSystemFolder();
    if (systemFolder) {
      this.plugin.settings.systemFolderPath = systemFolder.path;
    }
    let newSystemFolderParent = "";
    const setSystemFolder = new Setting(setUpTextFlow)
      .setName(
        this.plugin.t("setSystemFolder.setName choose existing folder", {
          textFlowSystemFolderName: this.plugin.textFlowSystemFolderName,
        }),
      )
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: this.plugin.t(
              "setSystemFolder.setDesc.1 what is system folder used for",
            ),
          });
          desc.createEl("br");
          desc.createSpan({
            text: this.plugin.t("setSystemFolder.setDesc.2 how to enter root"),
          });
        }),
      );

    setSystemFolder
      .addText((newSystemFolderInput) =>
        newSystemFolderInput
          .setValue(
            this.plugin.settings.systemFolderPath
              ? normalizePath(dirname(this.plugin.settings.systemFolderPath))
              : "/",
          )
          .onChange(async (value) => {
            newSystemFolderParent = normalizePath(value);
            await this.plugin.settingsTabFunctions.debouncedSaveSettings();
          }),
      )
      .addButton((systemFolderCreateOrMoveButton) => {
        systemFolderCreateOrMoveButton
          .setButtonText(
            !systemFolder
              ? this.plugin.t(
                  "setSystemFolder.addButton.setButtonText.alt create",
                )
              : this.plugin.t(
                  "setSystemFolder.addButton.setButtonText.alt move",
                ),
          )
          .onClick(async () => {
            const newPath = normalizePath(
              `${newSystemFolderParent}/${this.plugin.textFlowSystemFolderName}`,
            );
            this.plugin.settings.systemFolderPath = newPath;

            await this.plugin.saveSettings();

            // Create SystemFolder
            if (!systemFolder) {
              this.plugin.textFlowOperation = true;
              await this.plugin.settingsTabFunctions.createSystemFolder(
                newPath,
              );
              this.plugin.textFlowOperation = false;

              // set the folder hidden if appropriate
              await this.plugin.discernAndSetSystemFolderState();
            } else {
              // Move SystemFolder
              try {
                this.plugin.textFlowOperation = true;
                await this.app.vault.rename(systemFolder, newPath);
                this.plugin.textFlowOperation = false;

                // hide if appropriate
                await this.plugin.discernAndSetSystemFolderState();

                // Update the flowFilePaths
                if (this.plugin.settings.flows) {
                  Object.keys(this.plugin.settings.flows).forEach(
                    (flowName) => {
                      this.plugin.settings.flows[flowName].flowFilePath =
                        normalizePath(
                          `${this.plugin.settings.systemFolderPath}/${flowName}.md`,
                        );
                    },
                  );
                }
                const _newSystemFolderParent = newSystemFolderParent
                  ? newSystemFolderParent
                  : "root";
                new Notice(
                  this.plugin.t(
                    "setSystemFolder.addButton.notice folder successfully moved",
                    {
                      textFlowSystemFolderName:
                        this.plugin.textFlowSystemFolderName,
                      _newSystemFolderParent: _newSystemFolderParent,
                    },
                  ),
                );
              } catch {
                new Notice(
                  this.plugin.t(
                    "setSystemFolder.addButton.notice failed to move folder",
                  ),
                );
              }
            }
          });
      });

    // --------------------- UI settings

    const menuBarDefault = new Setting(setUpTextFlow);
    menuBarDefault
      .setName(this.plugin.t("menuBarDefault.setName default menu bar setting"))
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: this.plugin.t("menuBarDefault.setName desc"),
          });
        }),
      )
      .addDropdown((dropdown) => {
        dropdown
          .addOption(
            "min",
            this.plugin.t("menuBarDefault.addDropdown.addOption.alt min"),
          )
          .addOption(
            "max",
            this.plugin.t("menuBarDefault.addDropdown.addOption.alt max"),
          );
        dropdown.setValue(this.plugin.settings.menuBarDefault);
        dropdown.onChange(async (value) => {
          this.plugin.settings.menuBarDefault =
            value as Types.MenuBarDisplayState;
          await this.plugin.saveSettings();
        });
      });

    // ----------- flowSwitcherModal ---------------
    const switcherModalPosition = new Setting(setUpTextFlow);
    switcherModalPosition
      .setName(
        this.plugin.t("switcherModalPosition.setName access flow switcher via"),
      )
      .setDesc(
        this.plugin.t(
          "switcherModalPosition.setDesc changes need reload to take effect",
        ),
      )
      .addDropdown((dropdown) => {
        dropdown
          .addOption(
            "statusBar",
            this.plugin.t(
              "switcherModalPosition.addDropdown.addOption.alt Status bar",
            ),
          )
          .addOption(
            "ribbon",
            this.plugin.t(
              "switcherModalPosition.addDropdown.addOption.alt ribbon",
            ),
          )
          .addOption(
            "command",
            this.plugin.t(
              "switcherModalPosition.addDropdown.addOption.alt command palette only",
            ),
          );
        dropdown.setValue(this.plugin.settings.switcherPos);
        dropdown.onChange(async (value) => {
          this.plugin.settings.switcherPos = value;
          await this.plugin.saveSettings();
        });
      });

    // ------------ explorer Deco
    const explorerDeco = new Setting(setUpTextFlow)
      .setName(this.plugin.t("explorerDeco.setName.1 choose deco"))
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: this.plugin.t("explorerDeco.setDesc.2 what does deco do"),
          });
          desc.createEl("br");
          desc.createSpan({
            text: this.plugin.t("explorerDeco.setDesc.3 what do symbols mean"),
          });
          desc.createEl("br");
          desc.createSpan({
            text: this.plugin.t("explorerDeco.setDesc.4 how to set colour"),
          });
        }),
      );

    // Claude 3.5 Sonnet wrote this dropdown to preserve my sanity
    const dropdownContainer = explorerDeco.controlEl.createDiv({
      cls: "explorer-deco-system",
    });

    const flowModeExplorerDecoHeadline = dropdownContainer.createDiv({
      cls: "explorer-deco-dropdown-trigger",
    });

    const flowModeExplorerDecoContainer = dropdownContainer.createDiv({
      cls: "explorer-deco-dropdown-container",
    });

    const updateHeadlineDisplay = (decoration: string[]) => {
      flowModeExplorerDecoHeadline.empty();
      flowModeExplorerDecoHeadline.createSpan({
        text: decoration[0],
        cls: decoration[2],
      });
      flowModeExplorerDecoHeadline.createSpan({
        text: decoration[1],
        cls: decoration[3],
      });
      const iconSpan = flowModeExplorerDecoHeadline.createSpan();
      setIcon(iconSpan, "chevrons-up-down");
    };

    updateHeadlineDisplay(this.plugin.settings.explorerDecoStyle);

    // Handle dropdown toggle
    const toggleDropdown = async (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const isOpen = flowModeExplorerDecoContainer.classList.contains("show");
      flowModeExplorerDecoContainer.classList.toggle("show");
      this.plugin.settings.explorerDecoDropdownOpen = !isOpen;
    };

    flowModeExplorerDecoHeadline.addEventListener("click", toggleDropdown);

    // Create entries
    const decoArray = this.plugin.settingsTabFunctions.explorerDecoArray;
    decoArray.forEach((entry) => {
      const explorerDecoEntry = flowModeExplorerDecoContainer.createDiv({
        cls: "explorer-deco-dropdown-entry",
      });
      explorerDecoEntry.createSpan({
        text: entry[0],
        cls: entry[2],
      });
      explorerDecoEntry.createSpan({
        text: entry[1],
        cls: entry[3],
      });

      explorerDecoEntry.addEventListener("click", (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        this.plugin.settings.explorerDecoStyle = entry;
        this.plugin.settings.explorerDecoDropdownOpen = false;
        flowModeExplorerDecoContainer.classList.remove("show");
        updateHeadlineDisplay(entry);
        void this.plugin
          .decorateSourceNotes("redo")
          .catch((err) => console.error("decorateSourceNotes failed:", err));
        void this.plugin
          .saveSettings()
          .catch((err) => console.error("saveSettings failed:", err));
      });
    });

    // Handle outside clicks
    const handleOutsideClick = async (event: MouseEvent) => {
      if (!dropdownContainer.contains(event.target as HTMLElement)) {
        flowModeExplorerDecoContainer.classList.remove("show");
        this.plugin.settings.explorerDecoDropdownOpen = false;
      }
    };

    document.addEventListener("click", handleOutsideClick);

    // Clean up event listeners when the tab is closed
    this.plugin.register(() => {
      document.removeEventListener("click", handleOutsideClick);
      flowModeExplorerDecoHeadline.removeEventListener("click", toggleDropdown);
    });

    //--------------------------------------------------------------------------------
    const sourceHighlight = new Setting(setUpTextFlow);
    sourceHighlight
      .setName(
        this.plugin.t(
          "activeRegionDeco.setName choose highlight type for active region",
        ),
      )
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: this.plugin.t("activeRegionDeco.setDesc what does this do?"),
          });
        }),
      )
      .addDropdown((highlightDropdown) => {
        highlightDropdown
          .addOption("off", this.plugin.t("activeRegionDeco.addOption.0 off"))
          .addOption(
            "bgAccent",
            this.plugin.t(
              "activeRegionDeco.addOption.1 background accent colour",
            ),
          )
          .addOption(
            "bgMuted",
            this.plugin.t("activeRegionDeco.addOption.2 background text muted"),
          )
          .addOption(
            "olAccent",
            this.plugin.t("activeRegionDeco.addOption.3 outline accent"),
          )
          .addOption(
            "olText",
            this.plugin.t("activeRegionDeco.addOption.4 outline full"),
          )
          .addOption(
            "olMuted",
            this.plugin.t("activeRegionDeco.addOption.5 outline muted"),
          )
          .addOption(
            "arrow",
            this.plugin.t("activeRegionDeco.addOption.6 arrow"),
          )
          .setValue(this.plugin.settings.activeRegionHighlight)
          .onChange(async (value) => {
            this.plugin.settings.activeRegionHighlight = value;
            await this.plugin.decorateSourceNotes("update");
            await this.plugin.saveSettings();
          });
      });

    //-----------------------------------------------------------------------
    const qol = containerEl.createEl("details", {
      cls: "advancedSettings-container",
    });

    qol
      .createEl("summary", {
        cls: "advancedSettings-headline",
      })
      .createSpan({
        text: this.plugin.t("qol.createSpan.text quality of life settings"),
      });

    // qolSettings
    qol.createDiv();

    // -------------- Navigation listener -----------------
    const navListener = new Setting(qol);
    navListener
      .setName(this.plugin.t("qol.navListener.setName enable explorer nav"))
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: this.plugin.t(
              "qol.navListener.setDesc what is enable explorer nav for",
            ),
          });
        }),
      )
      .addToggle((navListenerToggle) => {
        navListenerToggle
          .setValue(this.plugin.settings.explorerListener)
          .onChange(async (value) => {
            this.plugin.settings.explorerListener = value;
            await this.plugin.saveSettings();
          });
      });

    // can't get this to work right now, so I'm shelving it
    /* // ------------ menu bar top margin
const menuBarTopMargin = new Setting(qol)
.setName(this.plugin.t("menuBarTopMargin.setName top margin"))
.setDesc(
createFragment((desc) => {
desc.createSpan({
text: this.plugin.t("menuBarTopMargin.setName desc"),
});
}),
)
.addText((setFlowName) => {
setFlowName.setPlaceholder(
this.plugin.t("menuBarTopMargin.setName placeholder"),
);
setFlowName.setValue(this.plugin.settings.menuBarTopMargin);
  
setFlowName.onChange(async (value) => {
// remove anything that's not a digit
this.plugin.settings.menuBarTopMargin = value.replace(/\D/g, "");
await this.plugin.settingsTabFunctions.debouncedSaveSettings();
});
});*/

    // ------------- scrollbar ------------
    const scrollbar = new Setting(qol);
    scrollbar
      .setName(this.plugin.t("qol.scrollbar.setName hide scroll bar"))
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: this.plugin.t(
              "qol.scrollbar.setName.1 what is hide scroll bar for",
            ),
          });
          desc.createEl("br");
          desc.createSpan({
            text: this.plugin.t(
              "qol.scrollbar.setName.2 there's a toggle, too",
            ),
          });
        }),
      )
      .addDropdown((dropdown) => {
        dropdown
          .addOption(
            "flows",
            this.plugin.t(
              "qol.scrollbar.addDropdown.addOption.1 hide only in flows",
            ),
          )
          .addOption(
            "all",
            this.plugin.t(
              "qol.scrollbar.addDropdown.addOption.2 hide everywhere",
            ),
          )
          .addOption(
            "none",
            this.plugin.t("qol.scrollbar.addDropdown.addOption.3 don't hide"),
          )
          .setValue(this.plugin.settings.hideScrollbar)
          .onChange(async (value) => {
            this.plugin.settings.hideScrollbar = value;
            await this.plugin.settingsTabFunctions.updateScrollbarVisibility();
            await this.plugin.saveSettings();
          });
      });

    // ----------- hash ---------------
    const checkForExternalEdits = new Setting(qol);
    checkForExternalEdits
      .setName(this.plugin.t("qol.hash.setName hash?"))
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: this.plugin.t("qol.hash.setDesc.1 when should you check?"),
          });
          desc.createEl("br");
          desc.createSpan({
            text: "mtime: ",
            cls: "text-emphasis",
          });
          desc.createSpan({
            text: this.plugin.t("qol.hash.setDesc.2 mtime"),
          });
          desc.createEl("br");
          desc.createSpan({
            text: "mtime + hash: ",
            cls: "text-emphasis",
          });
          desc.createSpan({
            text: this.plugin.t("qol.hash.setDesc.3 xxhash"),
          });
          desc.createEl("br");
          desc.createSpan({
            text: "hash: ",
            cls: "text-emphasis",
          });
          desc.createSpan({
            text: this.plugin.t("qol.hash.setDesc.4 always hash"),
          });
        }),
      )
      .addDropdown((dropdown) => {
        dropdown
          .addOption(
            "no",
            this.plugin.t("qol.hash.addDropdown.addOption.1 don't check"),
          )
          .addOption("mtime", "mtime")
          .addOption("mtime+hash", "mitme + hash")
          .addOption("always hash", "hash")
          .setValue(this.plugin.settings.checkExternalEdits)
          .onChange(async (value) => {
            if (
              // mtime is always stored in flowMaps, regardless of settings
              !this.plugin.settings.checkExternalEdits.includes("hash") &&
              value.includes("hash")
            ) {
              Object.keys(this.plugin.settings.flows).forEach((flowName) => {
                void this.plugin
                  .initialHashing(flowName)
                  .catch((err) => console.error("initialHashing failed:", err));
              });
            } else if (
              // if they stop using hashes, delete the record to prevent stale data
              this.plugin.settings.checkExternalEdits.includes("hash") &&
              !value.includes("hash")
            ) {
              if (Object.keys(this.plugin.settings.hashes).length > 0) {
                this.plugin.settings.hashes = {};
              }
            }

            this.plugin.settings.checkExternalEdits =
              value as Types.ExternalEditsType;

            await this.plugin.saveSettings();
          });
      });

    // ----------- hide system folder ---------------
    const hidesystemFolder = new Setting(qol);
    hidesystemFolder
      .setName(
        this.plugin.t("qol.showsystemFolder.setName show system folder", {
          textFlowSystemFolderName: this.plugin.textFlowSystemFolderName,
        }),
      )
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: this.plugin.t(
              "qol.showsystemFolder.setDesc.1 hiding is recommended",
            ),
          });
          desc.createEl("br");
          desc.createSpan({
            text: this.plugin.t(
              "qol.showsystemFolder.setDesc.2 edits are still tracked",
            ),
          });
        }),
      )
      .addToggle((hideSystemFolderToggle) => {
        hideSystemFolderToggle
          .setValue(!this.plugin.settings.systemFolderHidden)
          .onChange(async (value) => {
            this.plugin.settings.systemFolderHidden = !value;

            await this.plugin.saveSettings();

            if (this.plugin.settings.systemFolderPath) {
              await this.plugin.discernAndSetSystemFolderState();
            }
          });
      });

    // --------- MAIN TOGGLE EMBEDS ------------------
    const toggleEmbed = new Setting(qol);
    toggleEmbed
      .setName(this.plugin.t("toggleEmbed main toggle name"))
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: this.plugin.t("toggleEmbed main toggle desc 1"),
          });
          desc.createEl("br");
          desc.createSpan({
            text: this.plugin.t("toggleEmbed main toggle desc 2"),
          });
        }),
      )
      .addToggle((sortToggle) => {
        sortToggle
          .setValue(this.plugin.settings.embeds ?? false)
          .onChange(async (value) => {
            if (value === true) {
              const plugins = (
                this.app as App & { plugins: Types.PluginRegistry }
              ).plugins;
              const isActive = !!plugins.plugins["sync-embeds"];
              if (!isActive) {
                new Notice(this.plugin.t("Please install sync embeds"), 0);
              }
            }
            this.plugin.settings.embeds = value;
            await this.plugin.saveSettings();
            this.display();
          });
      });

    // -------- CREATE / EDIT FLOWS ----------------
    const createFlowsContainer = containerEl.createDiv({
      cls: "headline-container",
    });

    const createFlows = new Setting(createFlowsContainer);
    createFlows
      .setName(this.plugin.t("createFlows.createEl.text define a new flow"))
      .setHeading();

    //--------- FLOW NAME -----------------
    const chooseFlowName = new Setting(createFlowsContainer)
      .setName(
        this.plugin.t("createFlows.chooseFlowName.setName name your flow"),
      )
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: this.plugin.t(
              "createFlows.chooseFlowName.setDesc some characters can't be part of a flow name",
            ),
          });
          desc.createEl("br");
          desc.createSpan({
            text: '? : # * < > [ ] / | \\ " ^ `',
          });
        }),
      );
    chooseFlowName.addText((setFlowName) => {
      setFlowName.setPlaceholder(
        this.plugin.t(
          "createFlows.chooseFlowName.setPlaceholder enter a unique name",
        ),
      );
      setFlowName.setValue(this.plugin.settings.flowBuildBasket.flowName);

      setFlowName.onChange(async (value) => {
        this.plugin.settings.flowBuildBasket.flowName = value.trim();
        await this.plugin.settingsTabFunctions.debouncedSaveSettings();
      });
    });

    // --------- FOLDER TITLES ------------------
    const toggleFolderTitles = new Setting(createFlowsContainer);
    toggleFolderTitles
      .setName(
        this.plugin.t(
          "toggleFolderTitles.setName include folder / bookmark group titles",
        ),
      )
      .setDesc(
        this.plugin.t(
          "toggleFolderTitles.setDesc will also turn off titles in nav dropdown",
        ),
      )
      .addToggle((sortToggle) => {
        sortToggle
          .setValue(this.plugin.settings.flowBuildBasket.folderTitles)
          .onChange(async (value) => {
            this.plugin.settings.flowBuildBasket.folderTitles = value;
          });
      });

    // --------- TOGGLE EMBEDS ------------------
    if (this.plugin.settings.embeds) {
      const toggleEmbed = new Setting(createFlowsContainer);
      toggleEmbed
        .setName(this.plugin.t("toggleEmbed name"))
        .addToggle((sortToggle) => {
          sortToggle
            .setValue(this.plugin.settings.flowBuildBasket.embed ?? false)
            .onChange(async (value) => {
              this.plugin.settings.flowBuildBasket.embed = value;
              await this.plugin.saveSettings();
            });
        });
    }

    //------- DEFINE FLOW --------------------
    const defineFlow = new Setting(createFlowsContainer)
      .setName(this.plugin.t("defineFlow.setName define your flow"))
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: this.plugin.t(
              "defineFlow.setDesc.1 only active method will be used",
            ),
          });
        }),
      );

    //------- RADIO BUTTONS
    const radioButtonContainer = defineFlow.controlEl.createDiv({
      cls: "radio-button-group",
    });
    const buttons: { [key: string]: ButtonComponent } = {};

    // -------- Radio Buttons ---------------
    // Just creating and styling the buttons; the dependent UI and .onClick behaviour
    // are below the input element setup because I want to keep the hide/show with its elements

    buttons.dvQuery = new ButtonComponent(radioButtonContainer)
      .setButtonText(this.plugin.t("buttons.dvQuery.setButtonText by dvQuery"))
      .setClass("settings-radio-button");
    if (this.plugin.settings.flowBuildBasket.definitionMode === "dvQuery") {
      buttons.dvQuery.buttonEl.addClass("settings-radio-button-active");
    }

    buttons.foldersTagsProps = new ButtonComponent(radioButtonContainer)
      .setButtonText(
        this.plugin.t(
          "buttons.foldersTagsProps.setButtonText by folders, tags, props",
        ),
      )
      .setClass("settings-radio-button");
    if (
      this.plugin.settings.flowBuildBasket.definitionMode === "foldersTagsProps"
    ) {
      buttons.foldersTagsProps.buttonEl.addClass(
        "settings-radio-button-active",
      );
    }

    buttons.bookmarks = new ButtonComponent(radioButtonContainer)
      .setButtonText(
        this.plugin.t("buttons.bookmarks.setButtonText by bookmark group"),
      )
      .setClass("settings-radio-button");
    if (this.plugin.settings.flowBuildBasket.definitionMode === "bookmarks") {
      buttons.bookmarks.buttonEl.addClass("settings-radio-button-active");
    }

    // ------ dvQuery INPUT ELEMENT AND STUFF --------------------------------------
    const dvQuerySortOrder = new Setting(createFlowsContainer);
    dvQuerySortOrder.settingEl.hide(); // HIDE INITIALLY
    dvQuerySortOrder
      .setName(this.plugin.t("sortOrder.setName sort order"))
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: this.plugin.t("sortOrder.setDesc.1 note order"),
            cls: "text-emphasis",
          });
          desc.createSpan({
            text: this.plugin.t(
              "sortFlowPathsTagsProperties.setDesc.2 description of note order",
            ),
          });
          desc.createEl("br");
          desc.createSpan({
            text: this.plugin.t(
              "sortFlowPathsTagsProperties.setDesc.3 folder order",
            ),
            cls: "text-emphasis",
          });
          desc.createSpan({
            text: this.plugin.t(
              "sortFlowPathsTagsProperties.setDesc.4 description of folder order",
            ),
          });
          desc.createEl("br");
          desc.createSpan({
            text: this.plugin.t("sortOrder.setDesc.7 test them all out"),
          });
        }),
      )
      .addDropdown((dropdown) => {
        dropdown
          .addOption(
            "noteOrder",
            this.plugin.t("sortOrder.addDropdown.addOption.1 note order"),
          )
          .addOption(
            "folderOrder",
            this.plugin.t("sortOrder.addDropdown.addOption.2 folder order"),
          );
        dropdown.setValue(
          this.plugin.settings.flowBuildBasket.flowDefinition
            .dvQuerySortOrder ?? "noteOrder",
        );
        dropdown.onChange(async (value) => {
          this.plugin.settings.flowBuildBasket.flowDefinition.dvQuerySortOrder =
            value as Types.SortOrder;
          await this.plugin.saveSettings();
        });
      });

    //-----------------------------------------------------------------------------
    const chooseDvQuery = new Setting(createFlowsContainer);
    chooseDvQuery.settingEl.hide(); // HIDE INITIALLY
    chooseDvQuery.settingEl.addClass("input-width-200");
    chooseDvQuery.setDesc(
      createFragment((desc) => {
        desc.createSpan({
          text: this.plugin.t("choosedvQuery.setDesc.1 input only query"),
        });
        desc.createEl("br");
        desc.createSpan({
          text: this.plugin.t(
            "choosedvQuery.setDesc.2 systemFolder will be excluded",
          ),
        });
      }),
    );

    chooseDvQuery.addTextArea((setDvQueryGroup) => {
      setDvQueryGroup.inputEl.addClass("dvQuery-text-input");
      setDvQueryGroup.setValue(
        this.plugin.settings.flowBuildBasket.flowDefinition.dvQuery ?? "LIST",
      );
      setDvQueryGroup.onChange(async (value) => {
        this.plugin.settings.flowBuildBasket.flowDefinition.dvQuery =
          value.trim();
        await this.plugin.settingsTabFunctions.debouncedSaveSettings();
      });
    });

    //-------------COOSE PATHS / TAGS / PROPS ---------------------------------------------
    // ---------- FOLDERS, TAGS AND PROPERTIES INPUT ELEMENT -----------------------------------------
    // This function used to be called IHateCSSAndHTML.
    // I just can't get the layout to work with containers and
    // I am NOT going to try again.

    const showOrHideAlLFoldersTagsProps = (state: string) => {
      if (state === "show") {
        sortFlowPathsTagsProperties.settingEl.show();
        headlineChoosePathsTagsProperties.settingEl.show();
        folderIncludeInput.settingEl.show();
        folderExcludeInput.settingEl.show();
        tagsIncludeInput.settingEl.show();
        tagsExcludeInput.settingEl.show();
        propertiesIncludeInput.settingEl.show();
        propertiesExcludeInput.settingEl.show();
      }
      if (state === "hide") {
        sortFlowPathsTagsProperties.settingEl.hide();
        headlineChoosePathsTagsProperties.settingEl.hide();
        folderIncludeInput.settingEl.hide();
        folderExcludeInput.settingEl.hide();
        tagsIncludeInput.settingEl.hide();
        tagsExcludeInput.settingEl.hide();
        propertiesIncludeInput.settingEl.hide();
        propertiesExcludeInput.settingEl.hide();
      }
    };

    // --- headline object ------

    // ---- SORT FLOW ---------
    const sortFlowPathsTagsProperties = new Setting(
      createFlowsContainer,
    ).setName(this.plugin.t("sortFlowPathsTagsProperties.setName sort order"));
    sortFlowPathsTagsProperties.settingEl.hide();
    sortFlowPathsTagsProperties.setDesc(
      createFragment((desc) => {
        desc.createSpan({
          text: this.plugin.t(
            "sortFlowPathsTagsProperties.setDesc.1 note order",
          ),
          cls: "text-emphasis",
        });
        desc.createSpan({
          text: this.plugin.t(
            "sortFlowPathsTagsProperties.setDesc.2 description of note order",
          ),
        });
        desc.createEl("br");
        desc.createSpan({
          text: this.plugin.t(
            "sortFlowPathsTagsProperties.setDesc.3 folder order",
          ),
          cls: "text-emphasis",
        });
        desc.createSpan({
          text: this.plugin.t(
            "sortFlowPathsTagsProperties.setDesc.4 description of folder order",
          ),
        });
        desc.createEl("br");
        desc.createSpan({
          text: this.plugin.t(
            "sortFlowPathsTagsProperties.setDesc.5 test them all out",
          ),
        });
      }),
    );

    sortFlowPathsTagsProperties.addDropdown((dropdown) => {
      dropdown
        .addOption(
          "noteOrder",
          this.plugin.t(
            "sortFlowPathsTagsProperties.addDropdown.addOption.1 note order",
          ),
        )
        .addOption(
          "folderOrder",
          this.plugin.t(
            "sortFlowPathsTagsProperties.addDropdown.addOption.2 folder order",
          ),
        );
      dropdown.setValue(
        // remove "custom" as option
        this.plugin.settings.flowBuildBasket.flowDefinition
          .pathsTagsPropertiesSortOrder
          ? this.plugin.settings.flowBuildBasket.flowDefinition
              .pathsTagsPropertiesSortOrder
          : "noteOrder",
      );
      dropdown.onChange(async (value) => {
        this.plugin.settings.flowBuildBasket.flowDefinition.pathsTagsPropertiesSortOrder =
          value as Types.SortOrder;
        await this.plugin.saveSettings();
      });
    });
    const headlineChoosePathsTagsProperties = new Setting(createFlowsContainer);
    headlineChoosePathsTagsProperties.settingEl.hide();
    headlineChoosePathsTagsProperties.setClass("input-width").setDesc(
      createFragment((desc) => {
        desc.createSpan({
          text: this.plugin.t(
            "headlineChoosePathsTagsProperties.setDesc.1 inputs are optional, explanation of logic",
          ),
        });
        desc.createSpan({
          text: this.plugin.t(
            "headlineChoosePathsTagsProperties.setDesc.1 inputs are optional, explanation of logic emphasis",
          ),
          cls: "text-emphasis",
        });
        desc.createEl("br");
        desc.createSpan({
          text: this.plugin.t(
            "headlineChoosePathsTagsProperties.setDesc.1 inputs are optional, explanation of logic ctd",
          ),
        });
        desc.createEl("br");
        desc.createSpan({
          text: this.plugin.t(
            "headlineChoosePathsTagsProperties.setDesc.2 use dataview for complex logic",
          ),
        });
      }),
    );

    // ----- Folder include ----------
    const folderIncludeInput = new Setting(createFlowsContainer);
    folderIncludeInput.settingEl.hide();
    folderIncludeInput.settingEl.addClass("border-top-none");
    folderIncludeInput.settingEl.addClass("input-width-400");
    folderIncludeInput.setDesc(
      createFragment((desc) => {
        desc.createSpan({
          text: this.plugin.t("folderIncludeInput.setDesc.1 sources"),
        });
        desc.createEl("br");
        desc.createSpan({
          text: this.plugin.t("folderIncludeInput.setDesc.2 default is root"),
        });
        desc.createEl("br");
        desc.createSpan({
          text: this.plugin.t(
            "folderIncludeInput.setDesc.3 how to exclude subfolders",
          ),
        });
      }),
    );

    folderIncludeInput.addText((folderIncludeInput) => {
      const storedValue =
        this.plugin.settings.flowBuildBasket.flowDefinition.folderIncluded;

      // this is so setValue is either a filled string or undefined;
      // with an empty string for some reason not all folders get included when editing
      if (
        !storedValue ||
        storedValue === "" ||
        storedValue === "root" ||
        storedValue === "/" ||
        storedValue === "//" ||
        storedValue === "."
      ) {
        delete this.plugin.settings.flowBuildBasket.flowDefinition
          .folderIncluded;
      }
      folderIncludeInput.setPlaceholder(
        this.plugin.t("folderIncludeInput.setPlaceholder"),
      );
      // When displaying the value
      folderIncludeInput.setValue(
        this.plugin.settings.flowBuildBasket.flowDefinition.folderIncluded,
      );

      folderIncludeInput.onChange(async (value) => {
        // do not normalise because we need those trailing slashes!
        // When storing the value; "root/" is handled by getPathsByFoldersTagsProps()
        this.plugin.settings.flowBuildBasket.flowDefinition.folderIncluded =
          !value ||
          value === "" ||
          value === "root" ||
          value === "/" ||
          value === "//" ||
          value === "."
            ? ""
            : value;
        await this.plugin.settingsTabFunctions.debouncedSaveSettings();
      });
    });

    // ----- Folder exclude ---------------
    const folderExcludeInput = new Setting(createFlowsContainer);
    folderExcludeInput.settingEl.hide();
    folderExcludeInput.settingEl.addClass("border-top-none");
    folderExcludeInput.settingEl.addClass("input-width-400");
    folderExcludeInput
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: this.plugin.t(
              "folderExcludeInput.setDesc.1 choose paths to exclude",
            ),
          });
        }),
      )
      .addText((chooseExcludedFolders) => {
        chooseExcludedFolders.setPlaceholder(
          this.plugin.t("folderExcludeInput.setPlaceholder"),
        );
        chooseExcludedFolders.setValue(
          this.plugin.settings.flowBuildBasket.flowDefinition.folderExcluded,
        );
        chooseExcludedFolders.onChange(async (value) => {
          // cleanup happens on preview/save
          this.plugin.settings.flowBuildBasket.flowDefinition.folderExcluded =
            value;

          await this.plugin.settingsTabFunctions.debouncedSaveSettings();
        });
      });

    // ----- Tags include --------------
    const tagsIncludeInput = new Setting(createFlowsContainer);
    tagsIncludeInput.settingEl.hide();
    tagsIncludeInput.settingEl.addClass("border-top-none");
    tagsIncludeInput.settingEl.addClass("input-width-400");
    tagsIncludeInput
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: this.plugin.t(
              "tagsIncludeInput.setDesc.1 choose tags to include",
            ),
          });
        }),
      )
      .addText((chooseIncludedTags) => {
        chooseIncludedTags.setPlaceholder(
          this.plugin.t("tagsIncludeInput.setPlaceholder"),
        );
        chooseIncludedTags.setValue(
          this.plugin.settings.flowBuildBasket.flowDefinition.tagsIncluded,
        );
        chooseIncludedTags.onChange(async (value) => {
          // cleanup happens on preview/save
          this.plugin.settings.flowBuildBasket.flowDefinition.tagsIncluded =
            value;

          await this.plugin.settingsTabFunctions.debouncedSaveSettings();
        });
      });

    //-------- Tags exclude -------
    const tagsExcludeInput = new Setting(createFlowsContainer);
    tagsExcludeInput.settingEl.hide();
    tagsExcludeInput.settingEl.addClass("border-top-none");
    tagsExcludeInput.settingEl.addClass("input-width-400");
    tagsExcludeInput
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: this.plugin.t(
              "tagsExcludeInput.setDesc.1 choose tags to exclude",
            ),
          });
        }),
      )
      .addText((chooseExcludedTags) => {
        chooseExcludedTags.setPlaceholder(
          this.plugin.t("tagsExcludeInput.setPlaceholder"),
        );
        chooseExcludedTags.setValue(
          this.plugin.settings.flowBuildBasket.flowDefinition.tagsExcluded,
        );
        chooseExcludedTags.onChange(async (value) => {
          // cleanup happens on preview/save
          this.plugin.settings.flowBuildBasket.flowDefinition.tagsExcluded =
            value;
          await this.plugin.settingsTabFunctions.debouncedSaveSettings();
        });
      });

    // ----- Properties include ------------
    const propertiesIncludeInput = new Setting(createFlowsContainer);
    propertiesIncludeInput.settingEl.hide();
    propertiesIncludeInput.settingEl.addClass("border-top-none");
    propertiesIncludeInput.settingEl.addClass("input-width-400");
    propertiesIncludeInput
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: this.plugin.t(
              "propertiesIncludeInput.setDesc.1 choose properties to include",
            ),
          });
          desc.createEl("br");
          desc.createSpan({
            text: this.plugin.t(
              "propertiesIncludeInput.setDesc.3 property = value is valid",
            ),
          });
        }),
      )
      .addText((chooseIncludedProperties) => {
        chooseIncludedProperties.setPlaceholder(
          this.plugin.t("propertiesIncludeInput.setPlaceholder"),
        );
        chooseIncludedProperties.setValue(
          this.plugin.settings.flowBuildBasket.flowDefinition.propsIncluded,
        );
        chooseIncludedProperties.onChange(async (value) => {
          // cleanup happens on preview/save
          this.plugin.settings.flowBuildBasket.flowDefinition.propsIncluded =
            value;
          await this.plugin.settingsTabFunctions.debouncedSaveSettings();
        });
      });

    // ---------- Properties exclude ---------
    const propertiesExcludeInput = new Setting(createFlowsContainer);
    propertiesExcludeInput.settingEl.hide();
    propertiesExcludeInput.settingEl.addClass("border-top-none");
    propertiesExcludeInput.settingEl.addClass("input-width-400");
    propertiesExcludeInput
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: this.plugin.t(
              "propertiesExcludeInput.setDesc.1 choose properties to exclude",
            ),
          });
          desc.createEl("br");
          desc.createSpan({
            text: this.plugin.t(
              "propertiesExcludeInput.setDesc.3 property = value is valid",
            ),
          });
        }),
      )
      .addText((chooseExcludedProperties) => {
        chooseExcludedProperties.setPlaceholder(
          this.plugin.t("propertiesExcludeInput.setPlaceholder"),
        );
        chooseExcludedProperties.setValue(
          this.plugin.settings.flowBuildBasket.flowDefinition.propsExcluded,
        );
        chooseExcludedProperties.onChange(async (value) => {
          // cleanup happens on preview/save
          this.plugin.settings.flowBuildBasket.flowDefinition.propsExcluded =
            value;
          await this.plugin.settingsTabFunctions.debouncedSaveSettings();
        });
      });

    // ------ BOOKMARKS INPUT ELEMENT AND STUFF --------------------------------------
    const bookmarksSortOrder = new Setting(createFlowsContainer);
    bookmarksSortOrder.settingEl.hide(); // HIDE INITIALLY
    bookmarksSortOrder
      .setName(this.plugin.t("sortOrder.setName sort order"))
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: this.plugin.t("sortOrder.setDesc.1 note order"),
            cls: "text-emphasis",
          });
          desc.createSpan({
            text: this.plugin.t(
              "sortOrder.setDesc.2 description of note order",
            ),
          });
          desc.createEl("br");
          desc.createSpan({
            text: this.plugin.t("sortOrder.setDesc.3 folder order"),
            cls: "text-emphasis",
          });
          desc.createSpan({
            text: this.plugin.t(
              "sortOrder.setDesc.4 description of folder order",
            ),
          });
          desc.createEl("br");
          desc.createSpan({
            text: this.plugin.t("sortOrder.setDesc.5 custom"),
            cls: "text-emphasis",
          });
          desc.createSpan({
            text: this.plugin.t("sortOrder.setDesc.6 description of custom"),
          });
          desc.createEl("br");
          desc.createSpan({
            text: this.plugin.t("sortOrder.setDesc.7 test them all out"),
          });
        }),
      )
      .addDropdown((dropdown) => {
        dropdown
          .addOption(
            "noteOrder",
            this.plugin.t("sortOrder.addDropdown.addOption.1 note order"),
          )
          .addOption(
            "folderOrder",
            this.plugin.t("sortOrder.addDropdown.addOption.2 folder order"),
          )
          .addOption(
            "custom",
            this.plugin.t("sortOrder.addDropdown.addOption.3 custom"),
          );
        dropdown.setValue(
          this.plugin.settings.flowBuildBasket.flowDefinition
            .bookmarksSortOrder ?? "noteOrder",
        );
        dropdown.onChange(async (value) => {
          this.plugin.settings.flowBuildBasket.flowDefinition.bookmarksSortOrder =
            value as Types.SortOrder;
          await this.plugin.saveSettings();
        });
      });

    //-----------------------------------------------------------------------------
    const chooseBookmarks = new Setting(createFlowsContainer);
    chooseBookmarks.settingEl.hide(); // HIDE INITIALLY
    chooseBookmarks.settingEl.addClass("input-width-200");
    chooseBookmarks.setDesc(
      createFragment((desc) => {
        desc.createSpan({
          text: this.plugin.t(
            "chooseBookmarks.setDesc.1 input the name of a bookmarks group",
          ),
        });
        desc.createEl("br");
        desc.createSpan({
          text: this.plugin.t(
            "chooseBookmarks.setDesc.2 how to choose a subgroup",
          ),
        });
        desc.createEl("br");
        desc.createSpan({
          text: this.plugin.t("chooseBookmarks.setDesc.3 example path"),
        });
        desc.createEl("br");
        desc.createSpan({
          text: this.plugin.t(
            "chooseBookmarks.setDesc.4 how to exclude subgroup",
          ),
        });
      }),
    );
    chooseBookmarks.addText((setBookmarksGroup) => {
      setBookmarksGroup.setValue(
        this.plugin.settings.flowBuildBasket.flowDefinition.bookmarks ?? "",
      );
      setBookmarksGroup.onChange(async (value) => {
        this.plugin.settings.flowBuildBasket.flowDefinition.bookmarks =
          value.trim();
        await this.plugin.settingsTabFunctions.debouncedSaveSettings();
      });
    });

    // ---- RADIO BUTTON SETTINGS AND LOGIC ---------------------

    // ---- Presets for the foldersTagsProps button
    if (
      this.plugin.settings.flowBuildBasket.definitionMode === "foldersTagsProps"
    ) {
      bookmarksSortOrder.settingEl.hide();
      chooseBookmarks.settingEl.hide();
      showOrHideAlLFoldersTagsProps("show");
    }

    // onClick for the foldersTagsProps button
    buttons.foldersTagsProps.onClick(async () => {
      this.plugin.settings.flowBuildBasket.definitionMode = "foldersTagsProps";
      this.plugin.settingsTabFunctions.radioButtonManager(
        buttons.foldersTagsProps,
        buttons.bookmarks,
        buttons.dvQuery,
      );

      dvQuerySortOrder.settingEl.hide();
      chooseDvQuery.settingEl.hide();
      showOrHideAlLFoldersTagsProps("show");
      bookmarksSortOrder.settingEl.hide();
      chooseBookmarks.settingEl.hide();
      this.display();
    });

    // --- Presets for the BOOKMARKS button
    if (this.plugin.settings.flowBuildBasket.definitionMode === "bookmarks") {
      dvQuerySortOrder.settingEl.hide();
      chooseDvQuery.settingEl.hide();
      showOrHideAlLFoldersTagsProps("hide");
      bookmarksSortOrder.settingEl.show();
      chooseBookmarks.settingEl.show();
    }

    // onClick for the BOOKMARKS button
    buttons.bookmarks.onClick(async () => {
      // set correct definition mode and show/hide correct elements
      this.plugin.settings.flowBuildBasket.definitionMode = "bookmarks";
      // update button
      this.plugin.settingsTabFunctions.radioButtonManager(
        buttons.bookmarks,
        buttons.foldersTagsProps,
        buttons.dvQuery,
      );

      // hide/show input elements
      dvQuerySortOrder.settingEl.hide();
      chooseDvQuery.settingEl.hide();
      showOrHideAlLFoldersTagsProps("hide");
      bookmarksSortOrder.settingEl.show();
      chooseBookmarks.settingEl.show();
      this.display();
    });

    if (this.plugin.settings.flowBuildBasket.definitionMode === "dvQuery") {
      dvQuerySortOrder.settingEl.show();
      chooseDvQuery.settingEl.show();
      showOrHideAlLFoldersTagsProps("hide");
      bookmarksSortOrder.settingEl.hide();
      chooseBookmarks.settingEl.hide();
    }

    // onClick for the DVQUERY button
    buttons.dvQuery.onClick(async () => {
      // set correct definition mode and show/hide correct elements
      this.plugin.settings.flowBuildBasket.definitionMode = "dvQuery";
      // update button
      this.plugin.settingsTabFunctions.radioButtonManager(
        buttons.dvQuery,
        buttons.foldersTagsProps,
        buttons.bookmarks,
      );

      // hide/show input elements
      dvQuerySortOrder.settingEl.show();
      chooseDvQuery.settingEl.show();
      showOrHideAlLFoldersTagsProps("hide");
      bookmarksSortOrder.settingEl.hide();
      chooseBookmarks.settingEl.hide();
      this.display();
    });

    // ----------- Preview and save BUTTONS --------------------
    const previewButton = new ButtonComponent(containerEl);
    previewButton
      .setClass("setting-tab-button-spacing")
      .setButtonText(
        this.plugin.t(
          "previewButton.setButtonText preview your flow structure",
        ),
      )
      .onClick(async (buttonEl: MouseEvent) => {
        // set up missing values
        this.plugin.settings.flowBuildBasket.dataviewSearchArray = [];
        this.plugin.settings.flowBuildBasket.success = false;

        // Make sure the flow name is okay
        const validation = this.plugin.settingsTabFunctions.isValidFlowName(
          this.plugin.settings.flowBuildBasket.flowName,
        );
        if (!validation.valid && validation.reason) {
          new Notice(validation.reason);
          return;
        }
        // do the logic that leads to a list of note paths
        await this.plugin.settingsTabFunctions.createSourceNotePathArray(
          this.plugin.settings.flowBuildBasket,
        );

        // make the modal
        if (this.plugin.settings.flowBuildBasket.success) {
          const PreviewModal = new Modals.PreviewModal(
            this.app,
            this.plugin,
            this.plugin.settings.flowBuildBasket,
          );
          PreviewModal.open();
        }
      });

    //-------------------------------------------------------------------
    const saveButton = new ButtonComponent(containerEl);
    saveButton
      .setClass("setting-tab-button-spacing")
      .setButtonText(this.plugin.t("saveButton.setButtonText save flow def"))
      .onClick(async (buttonEl: MouseEvent) => {
        if (!this.plugin.settings.systemFolderPath) {
          new Notice(
            this.plugin.t("saveButton.notice create sys folder first"),
          );
          return;
        }

        // check if the user is renaming a flow
        await this.plugin.settingsTabFunctions.renameFlow();

        // checks and flow creation
        const validation = this.plugin.settingsTabFunctions.isValidFlowName(
          this.plugin.settings.flowBuildBasket.flowName,
        );
        if (!validation.valid && validation.reason) {
          new Notice(validation.reason);
          return;
        }

        await this.plugin.settingsTabFunctions.createSourceNotePathArray(
          this.plugin.settings.flowBuildBasket,
        );
        if (!this.plugin.settings.flowBuildBasket.success) {
          return;
        }

        // write the whole stuff (also flags for rebuild, just to be sure)
        await this.plugin.settingsTabFunctions.writeAndSaveFlowDef(
          this.plugin.settings.flowBuildBasket,
        );

        // (re)build
        await this.plugin.settingsTabFunctions.flowBuildingBundle(
          this.plugin.settings.flowBuildBasket.flowName,
          "settingsTab",
        );
        await this.plugin.refreshMenuBars();

        // update overlaps,
        this.plugin.settingsTabFunctions.syncOverlaps(
          this.plugin.settings.flowBuildBasket,
        );

        // save so we can pull our backup
        await this.plugin.saveSettings();

        // and clean up the basket.
        this.plugin.settingsTabFunctions.resetFlowBuildBasket(
          this.plugin.settings.flowBuildBasket,
        );

        await this.plugin.saveSettings();

        this.display();
      });

    // ----- Clear the input mask ---------
    const clearValues = new ButtonComponent(containerEl);
    clearValues
      .setButtonText(this.plugin.t("clearValues.setButtonText clear values"))
      .onClick(async (buttonEl: MouseEvent) => {
        // Clear all input values and reset the basket
        this.plugin.settingsTabFunctions.resetFlowBuildBasket(
          this.plugin.settings.flowBuildBasket,
        );
        await this.plugin.saveSettings();
        this.display();
      });

    // ------- FLOW DISPLAY -----------------------------
    const flowDisplay = containerEl.createDiv({
      cls: "headline-container",
    });
    flowDisplay.createEl("h3", {
      text: this.plugin.t("flowDisplay.createEl.text your flow definitions"),
      cls: "headline-text",
    });

    let flowsSorted: string[] = [];
    Object.keys(this.plugin.settings.flows).forEach((flowName) => {
      flowsSorted.push(flowName);
    });
    flowsSorted.sort((a, b) => a.localeCompare(b));

    for (const flowName of flowsSorted) {
      const shownFlow = this.plugin.settings.flows[flowName];

      // --- DISPLAY PREPARATIONS ----------------------------------
      // Set up strings to display flow criteria

      // SOURCE
      let source = "";
      if (shownFlow.definitionMode === "dvQuery") {
        source +=
          this.plugin.t("flowDisplay.flowShow. source dvQuery") +
          `(${shownFlow.flowDefinition.dvQuery}`;
      }

      if (shownFlow.definitionMode === "foldersTagsProps") {
        source += this.plugin.t("flowDisplay.flowShow.setDesc.1 source");

        if (
          shownFlow.flowDefinition.folderIncluded === "" ||
          shownFlow.flowDefinition.folderIncluded === "/"
        ) {
          source += "/";
        } else {
          source += `${shownFlow.flowDefinition.folderIncluded}`;
        }
      }

      if (shownFlow.definitionMode === "bookmarks") {
        source +=
          this.plugin.t("flowDisplay.source.alt bookmark group") +
          shownFlow.flowDefinition.bookmarks;
      }

      // string creation for foldersTagsProps
      // INCLUSION
      const included: string[] = [];
      if (shownFlow.flowDefinition.tagsIncluded?.trim()) {
        included.push(
          this.plugin.t("flowDisplay.included tags", {
            shownFlow_flowDefinition_tagsIncluded:
              shownFlow.flowDefinition.tagsIncluded,
          }),
        );
      }
      if (shownFlow.flowDefinition.propsIncluded?.trim()) {
        included.push(
          this.plugin.t("flowDisplay.included props", {
            shownFlow_flowDefinition_propsIncluded:
              shownFlow.flowDefinition.propsIncluded,
          }),
        );
      }
      const inclusionString = included.length > 0 ? included.join(" | ") : "";

      // EXCLUSION
      const excluded: string[] = [];
      if (
        !shownFlow.flowDefinition.bookmarks &&
        shownFlow.flowDefinition.folderExcluded?.trim()
      ) {
        excluded.push(
          this.plugin.t("flowDisplay.excluded folders", {
            shownFlow_flowDefinition_folderExcluded:
              shownFlow.flowDefinition.folderExcluded,
          }),
        );
      }
      if (shownFlow.flowDefinition.tagsExcluded?.trim()) {
        excluded.push(
          this.plugin.t("flowDisplay.excluded tags", {
            shownFlow_flowDefinition_tagsExcluded:
              shownFlow.flowDefinition.tagsExcluded,
          }),
        );
      }
      if (shownFlow.flowDefinition.propsExcluded?.trim()) {
        excluded.push(
          this.plugin.t("flowDisplay.excluded props", {
            shownFlow_flowDefinition_propsExcluded:
              shownFlow.flowDefinition.propsExcluded,
          }),
        );
      }
      const exclusionString = excluded.length > 0 ? excluded.join(" | ") : "";

      // --- THE DISPLAY ITSELF -------------------------------
      const flowShow = new Setting(flowDisplay);
      flowShow
        .setName(`${flowName}`)
        .setDesc(
          createFragment((desc) => {
            desc.createSpan({
              text: source,
            });
            if (inclusionString != "" && inclusionString != undefined) {
              desc.createEl("br");
              desc.createSpan({
                text: this.plugin.t(
                  "flowDisplay.flowShow.setDesc.2 inclusion criteria",
                  { inclusionString: inclusionString },
                ),
              });
            }
            if (exclusionString != "" && exclusionString != undefined) {
              desc.createEl("br");
              desc.createSpan({
                text: this.plugin.t(
                  "flowDisplay.flowShow.setDesc.3 exclusion criteria",
                  { exclusionString: exclusionString },
                ),
              });
            }
          }),
        )

        //-----------------------------------------------------------------------------
        .addButton((rebuildButton) => {
          rebuildButton
            .setButtonText(
              this.plugin.t(
                "flowDisplay.rebuildButton.setButtonText (re)build",
              ),
            )
            .onClick(async () => {
              // delete unneeded flowDef information
              if (
                shownFlow.definitionMode === "bookmarks" &&
                shownFlow.flowDefinition.foldersTagsProps
              ) {
                delete shownFlow.flowDefinition.foldersTagsProps;
                delete shownFlow.flowDefinition.foldersTagsPropsSortOrder;
              } else if (
                shownFlow.definitionMode === "foldersTagsProps" &&
                shownFlow.flowDefinition.bookmarks
              ) {
                delete shownFlow.flowDefinition.bookmarks;
                delete shownFlow.flowDefinition.bookmarksSortOrder;
              }

              // gather all info for the flowDefinition
              await this.plugin.settingsTabFunctions.flowBuildingBundle(
                flowName,
                "settingsTab",
              );

              await this.plugin.refreshMenuBars();
              await this.plugin.saveSettings();
              this.display();
            });
        })

        //-----------------------------------------------------------------------------
        .addButton((editFlow) => {
          editFlow
            .setButtonText(
              this.plugin.t("flowDisplay.editButton.setButtonText edit"),
            )
            .onClick(async () => {
              // putting values in the flowBuildBasket
              this.plugin.settings.flowBuildBasket = {
                createOrEdit: "edit",
                dataviewSearchArray: [],
                success: true,
                flowName: flowName,
                oldFlowName: flowName,
                definitionMode: shownFlow.definitionMode,
                folderTitles: shownFlow.folderTitles,
                embed: shownFlow.embed,
                flowDefinition: shownFlow.flowDefinition,
                flowNotesPathArray: [],
                overlapObject: shownFlow.overlapObject,
                lastActiveLeaves: shownFlow.lastActiveLeaves,
                persistentCursors: shownFlow.persistentCursors,
              };

              // save to make them stick
              await this.plugin.saveSettings();

              // rebuild display so values are shown in the input mask
              this.display();
            });
        })

        //-----------------------------------------------------------------------------
        .addButton((deleteDef) => {
          deleteDef
            .setButtonText(
              this.plugin.t(
                "flowDisplay.deleteButton.setButtonText delete definition",
              ),
            )
            .onClick(async () => {
              const DeleteFlowDefModal = new Modals.DeleteFlowDefModal(
                this.app,
                this.plugin,
                this,
                flowName,
              );
              DeleteFlowDefModal.open();
            });
        });
    }

    //------------------------------
    const restoreSettings = new Setting(flowDisplay);
    restoreSettings
      .setName(this.plugin.t("restoreSettings.setName restore definitions"))
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: this.plugin.t("restoreSettings.setDesc1 explanation"),
          });
          desc.createEl("br");
          desc.createSpan({
            text: this.plugin.t("restoreSettings.setDesc2 explanation"),
          });
        }),
      )

      //-----------------------------------------------------------------------------
      .addButton((backupBackupButton) => {
        backupBackupButton
          .setButtonText(
            this.plugin.t("restoreSettings.setButtonText copy to vault"),
          )
          .onClick(async () => {
            await this.plugin.settingsTabFunctions.backupFlowDefs();
            new Notice(
              this.plugin.t("restoreSettings.notice .json has been copied"),
            );
          });
      })

      //-----------------------------------------------------------------------------
      .addButton((restore) => {
        restore
          .setButtonText(
            this.plugin.t("restoreSettings.setButtonText restore definitions"),
          )
          .onClick(async () => {
            new Modals.RestoreFlowDefModal(this.app, this.plugin, this).open();
          });
      });
  };
}
