//#######################################################################
//###########################                ############################
//###########################  types         ############################
//###########################                ############################
//#######################################################################

export interface TextFlowSettings {
	tempFolder: string;
	flowObjects: {
		flow: {
			flowFolder: string;
			scrollPosition: string;
			activeFile: string;
			flowMap: {
				folder: {
					starts: string;
					ends: string;
					subfolder: {
						starts: string;
						ends: string;
						file: {
							starts: string;
							ends: string;
						};
					};
				};
			};
		};
	};
}

export const DEFAULT_SETTINGS: TextFlowSettings = {
	tempFolder: "default", //
	flowObjects: {
		// holds all the flows
		flow: {
			// holds the flow info
			flowFolder: "default", // folder
			scrollPosition: "default",
			activeFile: "default",
			flowMap: {
				// the map of all the flow folder contents
				folder: {
					starts: "default",
					ends: "default",
					subfolder: {
						starts: "default",
						ends: "default",
						file: {
							starts: "default",
							ends: "default",
						},
					},
				},
			},
		},
	},
};
