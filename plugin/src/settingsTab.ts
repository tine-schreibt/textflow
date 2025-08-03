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

export const TEXTFLOW_SYSTEMFOLDER = "TextFlow_SystemFolder";

// --- The class that defines the settings tab
export class TextFlowSettingsTab extends PluginSettingTab {
  plugin: TextFlow;

  constructor(app: App, plugin: TextFlow) {
    super(app, plugin);
    this.plugin = plugin;
  }

  // ----- Helper functions

  //#######################################################################
  //###########################   Settings Tab   ##########################
  //#######################################################################

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    this.plugin.settings.firstLaunch = false;
    this.plugin.saveSettings();

    const importExportEl = containerEl.createDiv("import-export-wrapper");
    importExportEl.createEl(
      "a",
      {
        cls: "dynamic-highlighter-import-export import-link",
        text: "Import ",
        href: "#",
      },
      (el) => {
        el.addEventListener("click", (e) => {
          e.preventDefault();
          new Modals.ImportModal(this.plugin.app, this.plugin).open();
        });
      }
    );
    importExportEl.createEl(
      "a",
      {
        cls: "dynamic-highlighter-import-export export-link",
        text: " Export",
        href: "#",
      },
      (el) => {
        el.addEventListener("click", (e) => {
          e.preventDefault();
          new Modals.ExportModal(this.plugin.app, this.plugin).open();
        });
      }
    );

    const setUpTextFlow = containerEl.createDiv({
      cls: "headline-container",
    });

    // ###############   SET UP A SYSTEM FOLDER   ###########################
    //CHECKED AND TESTED
    const systemFolder = this.plugin.flowService.checkSystemFolder();
    let newSystemFolderParent = ".";

    const setSystemFolder = new Setting(setUpTextFlow)
      .setName(this.plugin.t("setSystemFolder.setName choose existing folder"))
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: this.plugin.t(
              "setSystemFolder.setDesc.1 what is system folder used for"
            ),
          });
          desc.createEl("br");
          desc.createSpan({
            text: this.plugin.t("setSystemFolder.setDesc.2 how to enter root"),
          });
        })
      );

    this.plugin.ensureSystemFolder();

    setSystemFolder
      .addText((newSystemFolderInput) =>
        newSystemFolderInput
          .setValue(
            this.plugin.settings.systemFolderPath
              ? normalizePath(dirname(this.plugin.settings.systemFolderPath))
              : "/"
          )
          .onChange(async (value) => {
            newSystemFolderParent = normalizePath(value);
            await this.plugin.flowService.debouncedSaveSettings();
          })
      )
      .addButton((systemFolderCreateOrMoveButton) => {
        systemFolderCreateOrMoveButton
          .setButtonText(
            !systemFolder
              ? this.plugin.t(
                  "setSystemFolder.addButton.setButtonText.alt create"
                )
              : this.plugin.t(
                  "setSystemFolder.addButton.setButtonText.alt move"
                )
          )
          .onClick(async () => {
            const newPath = normalizePath(
              `${newSystemFolderParent}/${TEXTFLOW_SYSTEMFOLDER}`
            );
            this.plugin.settings.systemFolderPath = newPath;
            await this.plugin.saveSettings();

            // Create SystemFolder
            if (!systemFolder) {
              this.plugin.textFlowOperation = true;
              await this.plugin.flowService.createSystemFolder(newPath);
              this.plugin.textFlowOperation = false;

              // set the folder hidden if appropriate
              this.plugin.discernAndSetSystemFolderState(
                this.plugin.settings.systemFolderHidden,
                newSystemFolderParent
              );
            } else {
              // Move SystemFolder
              try {
                this.plugin.textFlowOperation = true;
                await this.app.vault.rename(systemFolder, newPath);
                this.plugin.textFlowOperation = false;

                // hide if appropriate
                this.plugin.discernAndSetSystemFolderState(
                  this.plugin.settings.systemFolderHidden,
                  newSystemFolderParent
                );

                // Update the flowFilePaths
                if (this.plugin.settings.flows) {
                  Object.keys(this.plugin.settings.flows).forEach(
                    (flowName) => {
                      this.plugin.settings.flows[flowName].flowFilePath =
                        normalizePath(
                          `${this.plugin.settings.systemFolderPath}/${flowName}.md`
                        );
                    }
                  );
                  await this.plugin.saveSettings();
                }
                new Notice(
                  this.plugin.t(
                    "setSystemFolder.addButton.notice folder successfully moved",
                    { newSystemFolderParent: newSystemFolderParent }
                  )
                );
              } catch (error) {
                new Notice(
                  this.plugin.t(
                    "setSystemFolder.addButton.notice failed to move folder",
                    { error_message: error.message }
                  )
                );
              }
            }
          });
      });
    // ^CHECKED AND TESTED

    // --------------------- UI settings
    // -----------   flowSwitcherModal  ---------------
    //CHECKED AND TESTED
    const switcherModalPosition = new Setting(setUpTextFlow)
      .setName(
        this.plugin.t("switcherModalPosition.setName access flow switcher via")
      )
      .setDesc(
        this.plugin.t(
          "switcherModalPosition.setDesc changes need reload to take effect"
        )
      )
      .addDropdown((dropdown) => {
        dropdown
          .addOption(
            "statusBar",
            this.plugin.t(
              "switcherModalPosition.addDropdown.addOption.alt Status bar"
            )
          )
          .addOption(
            "ribbon",
            this.plugin.t(
              "switcherModalPosition.addDropdown.addOption.alt ribbon"
            )
          )
          .addOption(
            "command",
            this.plugin.t(
              "switcherModalPosition.addDropdown.addOption.alt command palette only"
            )
          );
        dropdown.setValue(this.plugin.settings.switcherPos);
        dropdown.onChange((value) => {
          this.plugin.settings.switcherPos = value;
          this.plugin.saveSettings();
        });
      });

    //^CHECKED AND TESTED

    //CHECKED
    // ------------ explorer Deco
    // Claude 3.5 Sonnet wrote this to preserve my sanity, which is also why it looks much more refined than my usual stuff
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
        })
      );

    const dropdownContainer = explorerDeco.controlEl.createDiv({
      cls: "explorer-deco-system",
    });

    const flowModeExplorerDecoHeadline = dropdownContainer.createDiv({
      cls: "explorer-deco-dropdown-trigger",
    });

    const flowModeExplorerDecoContainer = dropdownContainer.createDiv({
      cls: "explorer-deco-dropdown-container",
    });

    const updateHeadlineDisplay = (decoration: any[]) => {
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
      await this.plugin.saveSettings();
    };

    flowModeExplorerDecoHeadline.addEventListener("click", toggleDropdown);

    // Create entries
    const decoArray = this.plugin.flowService.explorereDecoArray;
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

      explorerDecoEntry.addEventListener("click", async (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        this.plugin.settings.explorerDecoStyle = entry;
        this.plugin.settings.explorerDecoDropdownOpen = false;
        flowModeExplorerDecoContainer.classList.remove("show");
        updateHeadlineDisplay(entry);
        this.plugin.decorateSourceNotes("redo");
        await this.plugin.saveSettings();
      });
    });

    // Handle outside clicks
    const handleOutsideClick = async (event: MouseEvent) => {
      if (!dropdownContainer.contains(event.target as HTMLElement)) {
        flowModeExplorerDecoContainer.classList.remove("show");
        this.plugin.settings.explorerDecoDropdownOpen = false;
        await this.plugin.saveSettings();
      }
    };

    document.addEventListener("click", handleOutsideClick);

    // Clean up event listeners when the tab is closed
    this.plugin.register(() => {
      document.removeEventListener("click", handleOutsideClick);
      flowModeExplorerDecoHeadline.removeEventListener("click", toggleDropdown);
    });

    // --- And we're back to my own beginner style, though Claude still helps me to get better at this -.-

    // ------------ The Quality of Life stuff
    const qol = setUpTextFlow.createEl("details", {
      cls: "advancedSettings-container",
    });

    qol
      .createEl("summary", {
        cls: "advancedSettings-headline",
      })
      .createSpan({
        text: this.plugin.t("qol.createSpan.text quality of life settings"),
      });

    const qolSettings = qol.createDiv();

    // hide explorer deco
    const hideExplorerDeco = new Setting(qol)
      .setName(this.plugin.t("qol.hideExplorerDeco.setName hide explorer deco"))
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: this.plugin.t(
              "qol.hideExplorerDeco.setDesc what is this for"
            ),
          });
        })
      )
      .addToggle((decoToggle) => {
        decoToggle
          .setValue(!this.plugin.settings.showExplorerDeco)
          .onChange(async (value) => {
            this.plugin.settings.showExplorerDeco = !value;
            if (value) {
              this.plugin.unDecorateSourceNotes();
            } else {
              this.plugin.decorateSourceNotes("redo");
            }
            await this.plugin.saveSettings();
          });
      });

    // -------------- Multi-select -----------------
    const navListener = new Setting(qol)
      .setName(this.plugin.t("qol.navListener.setName disable explorer nav"))
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: this.plugin.t(
              "qol.navListener.setDesc what is disable explorer nav for"
            ),
          });
        })
      )
      .addToggle((navListenerToggle) => {
        navListenerToggle
          .setValue(!this.plugin.settings.explorerListener)
          .onChange(async (value) => {
            this.plugin.settings.explorerListener = !value;
            await this.plugin.saveSettings();
          });
      });

    // ------------- scrollbar ------------
    const scrollbar = new Setting(qol)
      .setName(this.plugin.t("qol.scrollbar.setName hide scoll bar"))
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: this.plugin.t(
              "qol.scrollbar.setName.1 what is hide scoll bar for"
            ),
          });
          desc.createEl("br");
          desc.createSpan({
            text: this.plugin.t(
              "qol.scrollbar.setName.2 there's a toggle, too"
            ),
          });
        })
      )
      .addDropdown((dropdown) => {
        dropdown
          .addOption(
            "flows",
            this.plugin.t(
              "qol.scrollbar.addDropdown.addOption.1 hide only in flows"
            )
          )
          .addOption(
            "all",
            this.plugin.t(
              "qol.scrollbar.addDropdown.addOption.2 hide everywhere"
            )
          )
          .addOption(
            "none",
            this.plugin.t("qol.scrollbar.addDropdown.addOption.3 don't hide")
          )
          .setValue(this.plugin.settings.hideScrollbar)
          .onChange(async (value) => {
            this.plugin.settings.hideScrollbar = value;
            await this.plugin.saveSettings();
            this.plugin.flowService.updateScrollbarVisibility();
          });
      });

    // -----------   cursor restoration  ---------------

    const dontRestoreCursor = new Setting(qol)
      .setName(
        this.plugin.t(
          "qol.dontRestoreCursor.setName don't auto-restore cursor pos"
        )
      )
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: this.plugin.t(
              "qol.dontRestoreCursor.setDesc what is don't restore for"
            ),
          });
        })
      )
      .addToggle((decoToggle) => {
        decoToggle
          .setValue(!this.plugin.settings.restoreCursor)
          .onChange(async (value) => {
            this.plugin.settings.restoreCursor = !value;
            await this.plugin.saveSettings();
          });
      });

    // -----------   hide system folder  ---------------
    const hidesystemFolder = new Setting(qol)
      .setName(this.plugin.t("qol.hidesystemFolder.setName hide system folder"))
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: this.plugin.t(
              "qol.hidesystemFolder.setDesc.1 hiding is recommended"
            ),
          });
          desc.createEl("br");
          desc.createSpan({
            text: this.plugin.t(
              "qol.hidesystemFolder.setDesc.2 edits are still tracked"
            ),
          });
          desc.createEl("br");
          desc.createSpan({
            text: this.plugin.t(
              "qol.hidesystemFolder.setDesc.3 unhiding needs vault reload"
            ),
          });
        })
      )
      .addToggle((hideSystemFolderToggle) => {
        hideSystemFolderToggle
          .setValue(this.plugin.settings.systemFolderHidden)
          .onChange(async (value) => {
            this.plugin.settings.systemFolderHidden = value;
            if (this.plugin.settings.systemFolderPath) {
              this.plugin.discernAndSetSystemFolderState(
                value,
                normalizePath(this.plugin.settings.systemFolderPath)
              );
            }
            await this.plugin.saveSettings();
          });
      });
    //^CHECKED
    // --------   CREATE / EDIT FLOWS   ----------------
    const createFlows = containerEl.createDiv({
      cls: "headline-container",
    });
    createFlows.createEl("h3", {
      text: this.plugin.t("createFlows.createEl.text create a new flow"),
      cls: "headline-text",
    });

    //--------- FLOW NAME -----------------
    // CHECKED AND TESTED
    const chooseFlowName = new Setting(createFlows)
      .setName(
        this.plugin.t("createFlows.chooseFlowName.setName name your flow")
      )
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: this.plugin.t(
              "createFlows.chooseFlowName.setName some characters can't be part of a flow name"
            ),
          });
          desc.createEl("br");
          desc.createSpan({
            text: '? : # * < > [ ] / | \\ "  ^ `',
          });
        })
      );
    chooseFlowName.addText((setFlowName) => {
      setFlowName.setPlaceholder(
        this.plugin.t(
          "createFlows.chooseFlowName.setPlaceholder enter a unique name"
        )
      );
      setFlowName.setValue(this.plugin.settings.flowBuildBasket.flowName);

      setFlowName.onChange(async (value) => {
        this.plugin.settings.flowBuildBasket.flowName = value.trim();
        this.plugin.flowService.debouncedSaveSettings();
      });
    });

    //^CHECKED AND TESTED

    // --------- FOLDER TITLES ------------------
    // CHECKED
    const toggleFolderTitles = new Setting(createFlows)
      .setName(
        this.plugin.t(
          "toggleFolderTitles.setName include folder / bookmark group titles"
        )
      )
      .setDesc(
        this.plugin.t(
          "toggleFolderTitles.setName will also turn off titles in nav dropdown"
        )
      )
      .addToggle((sortToggle) => {
        sortToggle
          .setValue(this.plugin.settings.flowBuildBasket.folderTitles)
          .onChange(async (value) => {
            this.plugin.settings.flowBuildBasket.folderTitles = value;
            this.plugin.saveSettings();
          });
      });

    // ^CHECKED

    //------- DEFINE FLOW --------------------
    //CHECKED
    const defineFlow = new Setting(createFlows)
      .setName(this.plugin.t("defineFlow.setName define your flow"))
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: this.plugin.t(
              "defineFlow.setDesc only active method will be used"
            ),
          });
          desc.createEl("br");
          desc.createSpan({
            text: this.plugin.t(
              "defineFlow.setDesc.2 if no criteria, whole vault will be used"
            ),
            cls: "text-emphasis",
          });
        })
      );
    //^CHECKED

    //------- RADIO BUTTONS
    const radioButtonContainer = defineFlow.controlEl.createDiv({
      cls: "radio-button-group",
    });
    const buttons: { [key: string]: ButtonComponent } = {};

    // -------- Radio Buttons ---------------
    // Just creating and styling the buttons; the dependent UI and .onClick behaviour
    // are below the input element setup because I want to keep the hide/show with its elements
    buttons.bookmarks = new ButtonComponent(radioButtonContainer)
      .setButtonText(
        this.plugin.t("buttons.bookmarks.setButtonText by bookmark group")
      )
      .setClass("settings-radio-button");
    if (this.plugin.settings.flowBuildBasket.definitionMode === "bookmarks") {
      buttons.bookmarks.buttonEl.addClass("settings-radio-button-active");
    }

    buttons.foldersTagsProps = new ButtonComponent(radioButtonContainer)
      .setButtonText(
        this.plugin.t(
          "buttons.foldersTagsProps.setButtonText by folders, tags, props"
        )
      )
      .setClass("settings-radio-button");
    if (
      this.plugin.settings.flowBuildBasket.definitionMode === "foldersTagsProps"
    ) {
      buttons.foldersTagsProps.buttonEl.addClass(
        "settings-radio-button-active"
      );
    }

    // ------ BOOKMARKS INPUT ELEMENT AND STUFF --------------------------------------
    //CHECKED

    const bookmarksSortOrder = new Setting(createFlows);
    bookmarksSortOrder.settingEl.hide(); // HIDE INITIALLY
    bookmarksSortOrder
      .setName(this.plugin.t("bookmarksSortOrder.setName sort order"))
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: this.plugin.t("bookmarksSortOrder.setDesc.1 depth first"),
            cls: "text-emphasis",
          });
          desc.createSpan({
            text: this.plugin.t(
              "bookmarksSortOrder.setDesc.2 description of depth first"
            ),
          });
          desc.createEl("br");
          desc.createSpan({
            text: this.plugin.t("bookmarksSortOrder.setDesc.3 notes first"),
            cls: "text-emphasis",
          });
          desc.createSpan({
            text: this.plugin.t(
              "bookmarksSortOrder.setDesc.4 description of notes first"
            ),
          });
          desc.createEl("br");
          desc.createSpan({
            text: this.plugin.t("bookmarksSortOrder.setDesc.5 custom"),
            cls: "text-emphasis",
          });
          desc.createSpan({
            text: this.plugin.t(
              "bookmarksSortOrder.setDesc.6 description of custom"
            ),
          });
          desc.createEl("br");
          desc.createSpan({
            text: this.plugin.t(
              "bookmarksSortOrder.setDesc.7 test them all out"
            ),
          });
        })
      )
      .addDropdown((dropdown) => {
        dropdown
          .addOption(
            "depthFirst",
            this.plugin.t(
              "bookmarksSortOrder.addDropdown.addOption.1 depth first"
            )
          )
          .addOption(
            "filesFirst",
            this.plugin.t(
              "bookmarksSortOrder.addDropdown.addOption.2 files first"
            )
          )
          .addOption(
            "custom",
            this.plugin.t("bookmarksSortOrder.addDropdown.addOption.3 custom")
          );
        dropdown.setValue(
          this.plugin.settings.flowBuildBasket.flowCookbook
            .bookmarksSortOrder ?? "depthFirst"
        );
        dropdown.onChange((value) => {
          this.plugin.settings.flowBuildBasket.flowCookbook.bookmarksSortOrder =
            value as Types.SortOrder;
          this.plugin.saveSettings();
        });
      });

    const chooseBookmarks = new Setting(createFlows);
    chooseBookmarks.settingEl.hide(); // HIDE INITIALLY
    chooseBookmarks.settingEl.addClass("input-width-200");
    chooseBookmarks.setDesc(
      createFragment((desc) => {
        desc.createSpan({
          text: this.plugin.t(
            "chooseBookmarks.setDesc.1 input the name of a bookmarks group"
          ),
        });
        desc.createEl("br");
        desc.createSpan({
          text: this.plugin.t(
            "chooseBookmarks.setDesc.2 how to choose a subgroup"
          ),
        });
        desc.createEl("br");
        desc.createSpan({
          text: this.plugin.t("chooseBookmarks.setDesc.3 example path"),
        });
        desc.createEl("br");
        desc.createSpan({
          text: this.plugin.t(
            "chooseBookmarks.setDesc.4 how to exclude subgroup"
          ),
        });
      })
    );
    chooseBookmarks.addText((setBookmarksGroup) => {
      setBookmarksGroup.onChange(async (value) => {
        this.plugin.settings.flowBuildBasket.flowCookbook.bookmarks =
          value.trim();
        this.plugin.flowService.debouncedSaveSettings();
      });
    });
    //^CHECKED

    // ---------- FOLDERS, TAGS AND PROPERTIES INPUT ELEMENT -----------------------------------------
    // This function used to be called IHateCSSAndHTML.
    // I just can't get the layout to work with containers and
    // I am NOT going to try again.

    //CHECKED
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
    //^CHECKED

    //CHECKED
    // --- headline object ------

    // ---- SORT FLOW ---------
    // CHECKED
    const sortFlowPathsTagsProperties = new Setting(createFlows).setName(
      this.plugin.t("sortFlowPathsTagsProperties.setName sort order")
    );
    sortFlowPathsTagsProperties.settingEl.hide();
    sortFlowPathsTagsProperties.setDesc(
      createFragment((desc) => {
        desc.createSpan({
          text: this.plugin.t(
            "sortFlowPathsTagsProperties.setDesc.1 depth first"
          ),
          cls: "text-emphasis",
        });
        desc.createSpan({
          text: this.plugin.t(
            "sortFlowPathsTagsProperties.setDesc.2 description of depth first"
          ),
        });
        desc.createEl("br");
        desc.createSpan({
          text: this.plugin.t(
            "sortFlowPathsTagsProperties.setDesc.3 notes first"
          ),
          cls: "text-emphasis",
        });
        desc.createSpan({
          text: this.plugin.t(
            "sortFlowPathsTagsProperties.setDesc.4 description of notes first"
          ),
        });
        desc.createEl("br");
        desc.createSpan({
          text: this.plugin.t(
            "sortFlowPathsTagsProperties.setDesc.5 test them all out"
          ),
        });
      })
    );

    sortFlowPathsTagsProperties.addDropdown((dropdown) => {
      dropdown
        .addOption(
          "depthFirst",
          this.plugin.t(
            "sortFlowPathsTagsProperties.addDropdown.addOption.1 depth first"
          )
        )
        .addOption(
          "filesFirst",
          this.plugin.t(
            "sortFlowPathsTagsProperties.addDropdown.addOption.2 files first"
          )
        );
      dropdown.setValue(
        // remove "custom" as option
        this.plugin.settings.flowBuildBasket.flowCookbook
          .pathsTagsPropertiesSortOrder
          ? this.plugin.settings.flowBuildBasket.flowCookbook
              .pathsTagsPropertiesSortOrder
          : "depthFirst"
      );
      dropdown.onChange((value) => {
        this.plugin.settings.flowBuildBasket.flowCookbook.pathsTagsPropertiesSortOrder =
          value as Types.SortOrder;
        this.plugin.saveSettings();
      });
    });
    // ^ CHECKED

    const headlineChoosePathsTagsProperties = new Setting(createFlows);
    headlineChoosePathsTagsProperties.settingEl.hide();
    headlineChoosePathsTagsProperties.setClass("input-width").setDesc(
      createFragment((desc) => {
        desc.createSpan({
          text: this.plugin.t(
            "headlineChoosePathsTagsProperties.setDesc.1 inputs are optional, explanation of logic"
          ),
        });
        desc.createEl("br");
        desc.createSpan({
          text: this.plugin.t(
            "headlineChoosePathsTagsProperties.setDesc.2 use dataview for complex logic"
          ),
        });
      })
    );
    //^CHECKED

    //CHECKED
    // ----- Folder include
    const folderIncludeInput = new Setting(createFlows);
    folderIncludeInput.settingEl.hide();
    folderIncludeInput.settingEl.addClass("border-top-none");
    folderIncludeInput.settingEl.addClass("input-width-400");
    folderIncludeInput.setDesc(
      createFragment((desc) => {
        desc.createSpan({
          text: this.plugin.t(
            "folderIncludeInput.setDesc.1 choose single folder"
          ),
        });
        desc.createEl("br");
        desc.createSpan({
          text: this.plugin.t("folderIncludeInput.setDesc.2 default is root"),
        });
        desc.createEl("br");
        desc.createSpan({
          text: this.plugin.t(
            "folderIncludeInput.setDesc.3 how to exlude subfolders"
          ),
        });
      })
    );

    folderIncludeInput.addText((folderIncludeInput) => {
      const storedValue =
        this.plugin.settings.flowBuildBasket.flowCookbook.folderIncluded;

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
        delete this.plugin.settings.flowBuildBasket.flowCookbook.folderIncluded;
      }
      // When displaying the value
      folderIncludeInput.setValue(
        this.plugin.settings.flowBuildBasket.flowCookbook.folderIncluded
      );

      folderIncludeInput.onChange(async (value) => {
        // do not normalise because we need those trailing slashes!
        // When storing the value; "root/" is handled by getPathsByFoldersTagsProps()
        this.plugin.settings.flowBuildBasket.flowCookbook.folderIncluded =
          !value ||
          value === "" ||
          value === "root" ||
          value === "/" ||
          value === "//" ||
          value === "."
            ? ""
            : value;
        this.plugin.flowService.debouncedSaveSettings();
      });
    });
    //^CHECKED

    //CHECKED
    // ----- Folder exclude
    const folderExcludeInput = new Setting(createFlows);
    folderExcludeInput.settingEl.hide();
    folderExcludeInput.settingEl.addClass("border-top-none");
    folderExcludeInput.settingEl.addClass("input-width-400");
    folderExcludeInput
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: this.plugin.t(
              "folderExcludeInput.setDesc.1 choose paths to exclude"
            ),
          });
          desc.createEl("br");
          desc.createSpan({
            text: this.plugin.t(
              "folderExcludeInput.setDesc.2 comma separated list"
            ),
          });
        })
      )
      .addText((chooseExcludedFolders) => {
        chooseExcludedFolders.setValue(
          this.plugin.settings.flowBuildBasket.flowCookbook.folderExcluded
        );
        chooseExcludedFolders.onChange(async (value) => {
          // cleanup happens on preview/save
          this.plugin.settings.flowBuildBasket.flowCookbook.folderExcluded =
            value;

          this.plugin.flowService.debouncedSaveSettings();
        });
      });

    //^CHECKED
    //CHECKED
    // ----- Tags
    const tagsIncludeInput = new Setting(createFlows);
    tagsIncludeInput.settingEl.hide();
    tagsIncludeInput.settingEl.addClass("border-top-none");
    tagsIncludeInput.settingEl.addClass("input-width-400");
    tagsIncludeInput
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: this.plugin.t(
              "tagsIncludeInput.setDesc.1 choose tags to include"
            ),
          });
          desc.createEl("br");
          desc.createSpan({
            text: this.plugin.t(
              "tagsIncludeInput.setDesc.2 comma separated list"
            ),
          });
        })
      )
      .addText((chooseIncludedTags) => {
        chooseIncludedTags.setValue(
          this.plugin.settings.flowBuildBasket.flowCookbook.tagsIncluded
        );
        chooseIncludedTags.onChange(async (value) => {
          // cleanup happens on preview/save
          this.plugin.settings.flowBuildBasket.flowCookbook.tagsIncluded =
            value;

          this.plugin.flowService.debouncedSaveSettings();
        });
      });
    //^CHECKED
    //CHECKED
    const tagsExcludeInput = new Setting(createFlows);
    tagsExcludeInput.settingEl.hide();
    tagsExcludeInput.settingEl.addClass("border-top-none");
    tagsExcludeInput.settingEl.addClass("input-width-400");
    tagsExcludeInput
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: this.plugin.t(
              "tagsExcludeInput.setDesc.1 choose tags to exclude"
            ),
          });
          desc.createEl("br");
          desc.createSpan({
            text: this.plugin.t(
              "tagsExcludeInput.setDesc.2 comma separated list"
            ),
          });
        })
      )
      .addText((chooseExcludedTags) => {
        chooseExcludedTags.setValue(
          this.plugin.settings.flowBuildBasket.flowCookbook.tagsExcluded
        );
        chooseExcludedTags.onChange(async (value) => {
          // cleanup happens on preview/save
          this.plugin.settings.flowBuildBasket.flowCookbook.tagsExcluded =
            value;
          this.plugin.flowService.debouncedSaveSettings();
        });
      });
    //^CHECKED
    //CHECKED
    // ----- Properties
    const propertiesIncludeInput = new Setting(createFlows);
    propertiesIncludeInput.settingEl.hide();
    propertiesIncludeInput.settingEl.addClass("border-top-none");
    propertiesIncludeInput.settingEl.addClass("input-width-400");
    propertiesIncludeInput
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: this.plugin.t(
              "propertiesIncludeInput.setDesc.1 choose properties to include"
            ),
          });
          desc.createEl("br");
          desc.createSpan({
            text: this.plugin.t(
              "propertiesIncludeInput.setDesc.2 comma separated list"
            ),
          });
          desc.createEl("br");
          desc.createSpan({
            text: this.plugin.t(
              "propertiesIncludeInput.setDesc.3 property = value is valid"
            ),
          });
        })
      )
      .addText((chooseIncludedProperties) => {
        chooseIncludedProperties.setValue(
          this.plugin.settings.flowBuildBasket.flowCookbook.propsIncluded
        );
        chooseIncludedProperties.onChange(async (value) => {
          // cleanup happens on preview/save
          this.plugin.settings.flowBuildBasket.flowCookbook.propsIncluded =
            value;
          this.plugin.flowService.debouncedSaveSettings();
        });
      });
    //^CHECKED
    //CHECKED
    const propertiesExcludeInput = new Setting(createFlows);
    propertiesExcludeInput.settingEl.hide();
    propertiesExcludeInput.settingEl.addClass("border-top-none");
    propertiesExcludeInput.settingEl.addClass("input-width-400");
    propertiesExcludeInput
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: this.plugin.t(
              "propertiesExcludeInput.setDesc.1 choose properties to exclude"
            ),
          });
          desc.createEl("br");
          desc.createSpan({
            text: this.plugin.t(
              "propertiesExcludeInput.setDesc.2 comma separated list"
            ),
          });
          desc.createEl("br");
          desc.createSpan({
            text: this.plugin.t(
              "propertiesExcludeInput.setDesc.3 property = value is valid"
            ),
          });
        })
      )
      .addText((chooseExcludedProperties) => {
        chooseExcludedProperties.setValue(
          this.plugin.settings.flowBuildBasket.flowCookbook.propsExcluded
        );
        chooseExcludedProperties.onChange(async (value) => {
          // cleanup happens on preview/save
          this.plugin.settings.flowBuildBasket.flowCookbook.propsExcluded =
            value;
          this.plugin.flowService.debouncedSaveSettings();
        });
      });
    //^CHECKED

    //CHECKED
    // ---- RADIO BUTTON SETTINGS AND LOGIC
    // --- Presets for the BOOKMARKS button
    if (this.plugin.settings.flowBuildBasket.definitionMode === "bookmarks") {
      showOrHideAlLFoldersTagsProps("hide");
      bookmarksSortOrder.settingEl.show();
      chooseBookmarks.settingEl.show();
    }

    // onClick for the BOOKMARKS button
    buttons.bookmarks.onClick(() => {
      // set correct definition mode and show/hide correct elements
      this.plugin.settings.flowBuildBasket.definitionMode = "bookmarks";
      console.log(
        this.plugin.settings.flowBuildBasket.flowCookbook.bookmarksSortOrder
      );
      // update button
      this.plugin.flowService.radioButtonManager(
        buttons.bookmarks,
        buttons.foldersTagsProps
      );

      // hide/show input elements
      bookmarksSortOrder.settingEl.show();
      chooseBookmarks.settingEl.show();
      showOrHideAlLFoldersTagsProps("hide");
      this.plugin.saveSettings();
      this.display();
    });

    // ---- Presets for the foldersTagsProps button
    if (
      this.plugin.settings.flowBuildBasket.definitionMode === "foldersTagsProps"
    ) {
      bookmarksSortOrder.settingEl.hide();
      chooseBookmarks.settingEl.hide();
      showOrHideAlLFoldersTagsProps("show");
    }

    // onClick for the foldersTagsProps button
    buttons.foldersTagsProps.onClick(() => {
      this.plugin.settings.flowBuildBasket.definitionMode = "foldersTagsProps";
      this.plugin.flowService.radioButtonManager(
        buttons.foldersTagsProps,
        buttons.bookmarks
      );

      bookmarksSortOrder.settingEl.hide();
      chooseBookmarks.settingEl.hide();
      showOrHideAlLFoldersTagsProps("show");
      this.plugin.saveSettings();
      this.display();
    });
    //^CHECKED

    // ----------- Preview and save BUTTONS --------------------
    //CHECKED
    const previewButton = new ButtonComponent(containerEl);
    previewButton
      .setButtonText(
        this.plugin.t("previewButton.setButtonText preview your flow structure")
      )
      .onClick(async (buttonEl: MouseEvent) => {
        // set up missing values
        this.plugin.settings.flowBuildBasket.dataviewSearchPath = "";
        this.plugin.settings.flowBuildBasket.success = false;

        // Make sure the flow name is okay
        const validation = this.plugin.flowService.isValidFlowName(
          this.plugin.settings.flowBuildBasket.flowName
        );
        if (!validation.valid && validation.reason) {
          new Notice(validation.reason);
          return;
        }
        // do the logic that leads to a list of note paths
        await this.plugin.flowService.createFlowDefinition(
          this.plugin.settings.flowBuildBasket
        );

        // make the modal
        if (this.plugin.settings.flowBuildBasket.success) {
          const previewModal = new Modals.previewModal(
            this.app,
            this.plugin,
            this.plugin.settings.flowBuildBasket
          );
          previewModal.open();
        }
      });
    //^CHECKED

    //CHECKED
    const saveButton = new ButtonComponent(containerEl);
    saveButton
      .setButtonText(this.plugin.t("saveButton.setButtonText save flow def"))
      .onClick(async (buttonEl: MouseEvent) => {
        // if the user is renaming the flow:
        this.plugin.flowService.renameFlow();

        // if checks and flow creation haven't been performed by the preview button
        const validation = await this.plugin.flowService.isValidFlowName(
          this.plugin.settings.flowBuildBasket.flowName
        );
        if (!validation.valid && validation.reason) {
          new Notice(validation.reason);
          return;
        }

        await this.plugin.flowService.createFlowDefinition(
          this.plugin.settings.flowBuildBasket
        );
        if (!this.plugin.settings.flowBuildBasket.success) {
          return;
        }

        // write the whole stuff (also flags for rebuild)
        await this.plugin.flowService.writeFlowDef(
          this.plugin.settings,
          this.plugin.settings.flowBuildBasket
        );

        // update conflicts,
        await this.plugin.flowService.syncConflictObjects(
          this.plugin.settings.flowBuildBasket
        );

        // and clean up the basket.
        await this.plugin.flowService.resetFlowBuildBasket(
          this.plugin.settings.flowBuildBasket
        );

        //
        this.plugin.saveSettings();
        this.display();
      });
    //^CHECKED

    //CHECKED
    // ----- Clear the input mask
    const clearValues = new ButtonComponent(containerEl);
    clearValues
      .setButtonText(this.plugin.t("clearValues.setButtonText clear values"))
      .onClick(async (buttonEl: MouseEvent) => {
        // Clear all input values and reset the basket
        this.plugin.flowService.resetFlowBuildBasket(
          this.plugin.settings.flowBuildBasket
        );
        this.plugin.saveSettings();
        this.display();
      });
    //^CHECKED
    //CHECKED
    // ------- FLOW DISPLAY -----------------------------
    const flowDisplay = containerEl.createDiv({
      cls: "headline-container",
    });
    flowDisplay.createEl("h3", {
      text: this.plugin.t("flowDisplay.createEl.text your flow definitions"),
      cls: "headline-text",
    });

    const flowSorted: string[] = [];
    Object.keys(this.plugin.settings.flows).forEach((flowName) => {
      flowSorted.push(flowName);
    });

    flowSorted.sort();

    for (let flowName of flowSorted) {
      const shownFlow = this.plugin.settings.flows[flowName];

      // --- DISPLAY PREPARATIONS ----------------------------------
      // Set up strings to display flow criteria

      // SOURCE
      let source = "";
      if (shownFlow.flowCookbook.bookmarks) {
        source += this.plugin.t("flowDisplay.source.alt bookmark group", {
          shownFlow_flowCookbook_bookmarks: shownFlow.flowCookbook.bookmarks,
        });
      } else if (
        shownFlow.flowCookbook.folderIncluded === "" ||
        shownFlow.flowCookbook.folderIncluded === "/"
      ) {
        source += "/";
      } else {
        source += `/${shownFlow.flowCookbook.folderIncluded}`;
      }

      // INCLUSION
      const included: string[] = [];
      if (shownFlow.flowCookbook.tagsIncluded?.trim()) {
        included.push(
          this.plugin.t("flowDisplay.included tags", {
            shownFlow_flowCookbook_tagsIncluded:
              shownFlow.flowCookbook.tagsIncluded,
          })
        );
      }
      if (shownFlow.flowCookbook.propsIncluded?.trim()) {
        included.push(
          this.plugin.t("flowDisplay.included props", {
            shownFlow_flowCookbook_propsIncluded:
              shownFlow.flowCookbook.propsIncluded,
          })
        );
      }
      const inclusionString = included.length > 0 ? included.join(" / ") : "";

      // EXCLUSION
      const excluded: string[] = [];
      if (
        !shownFlow.flowCookbook.bookmarks &&
        shownFlow.flowCookbook.folderExcluded?.trim()
      ) {
        excluded.push(
          this.plugin.t("flowDisplay.excluded folders", {
            shownFlow_flowCookbook_folderExcluded:
              shownFlow.flowCookbook.folderExcluded,
          })
        );
      }
      if (shownFlow.flowCookbook.tagsExcluded?.trim()) {
        excluded.push(
          this.plugin.t("flowDisplay.excluded tags", {
            shownFlow_flowCookbook_tagsExcluded:
              shownFlow.flowCookbook.tagsExcluded,
          })
        );
      }
      if (shownFlow.flowCookbook.propsExcluded?.trim()) {
        excluded.push(
          this.plugin.t("flowDisplay.excluded props", {
            shownFlow_flowCookbook_propsExcluded:
              shownFlow.flowCookbook.propsExcluded,
          })
        );
      }
      const exclusionString = excluded.length > 0 ? excluded.join(" / ") : "";

      // --- THE DISPLAY ITSELF -------------------------------
      const flowShow = new Setting(flowDisplay);
      flowShow
        .setName(`${shownFlow.flowName}`)
        .setDesc(
          createFragment((desc) => {
            desc.createSpan({
              text: this.plugin.t("flowDisplay.flowShow.setDesc. source", {
                source: source,
              }),
            });
            if (inclusionString != "" && inclusionString != undefined) {
              desc.createEl("br");
              desc.createSpan({
                text: this.plugin.t(
                  "flowDisplay.flowShow.setDesc.2 inclusion criteria",
                  { inclusionString: inclusionString }
                ),
              });
            }
            if (exclusionString != "" && exclusionString != undefined) {
              desc.createEl("br");
              desc.createSpan({
                text: this.plugin.t(
                  "flowDisplay.flowShow.setDesc.3 exclusion criteria",
                  { exclusionString: exclusionString }
                ),
              });
            }
          })
        )
        //^CHECKED
        //CHECKED  AND TESTED
        .addButton((rebuildButton) =>
          rebuildButton
            .setButtonText(
              this.plugin.t("flowDisplay.rebuildButton.setButtonText (re)build")
            )
            .onClick(async () => {
              // delete unneeded flowDef information
              if (
                shownFlow.definitionMode === "bookmarks" &&
                shownFlow.flowCookbook.foldersTagsProps
              ) {
                delete shownFlow.flowCookbook.foldersTagsProps;
                delete shownFlow.flowCookbook.foldersTagsPropsSortOrder;
              } else if (
                shownFlow.definitionMode === "foldersTagsProps" &&
                shownFlow.flowCookbook.bookmarks
              ) {
                delete shownFlow.flowCookbook.bookmarks;
                delete shownFlow.flowCookbook.bookmarksSortOrder;
              }

              // gather all info for the flowDefinition
              this.plugin.flowService.rebuildFlow(flowName, "settingsTab");
              this.plugin.refreshMenuBars();
              await this.plugin.saveSettings();
              this.display();
            })
        )
        //^CHECKED AND TESTED
        //CHECKED AND TESTED
        .addButton((editFlow) => {
          editFlow
            .setButtonText(
              this.plugin.t("flowDisplay.rebuildButton.setButtonText edit")
            )
            .onClick(async () => {
              // putting values in the flowBuildBasket
              this.plugin.settings.flowBuildBasket = {
                createOrEdit: "edit",
                dataviewSearchPath: "",
                success: true,
                flowName: shownFlow.flowName,
                oldFlowName: shownFlow.flowName,
                definitionMode: shownFlow.definitionMode,
                folderTitles: shownFlow.folderTitles,
                flowCookbook: shownFlow.flowCookbook,
                finalRecipe: shownFlow.flowRecipe,
                conflictObject: shownFlow.conflictObject,
                activeRegions: shownFlow.activeRegions,
                persistentCursors: shownFlow.persistentCursors,
              };

              // save to make them stick
              this.plugin.saveSettings();

              // rebuild display so values are shown in the input mask
              this.display();
            });
        })
        //^CHECKED AND TESTED

        //CHECKED AND TESTED
        .addButton((deleteDef) => {
          deleteDef
            .setButtonText(
              this.plugin.t(
                "flowDisplay.rebuildButton.setButtonText delete definition"
              )
            )
            .onClick(async () => {
              const DeleteFlowDefModal = new Modals.DeleteFlowDefModal(
                this.app,
                this.plugin,
                this,
                shownFlow.flowName
              );
              DeleteFlowDefModal.open();
            });
        });
    }
  }
}
