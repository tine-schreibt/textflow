//#######################################################################
//###########################                ############################
//###########################     types      ############################
//###########################                ############################
//#######################################################################

export interface TextFlowSettings {
	tempFolderPlace: string;
	tempFolderHidden: boolean;
	activeFlow?: string;
	flowArray: string[];
	flowObjects: { [key: string]: FlowDef };
}

export interface FlowDef {
	sourcePath: string;
	flowFileName: string;
	excludedFolders?: string[];
	includedMetaData?: { [key: string]: [value: string] };
	excludedMetaData?: { [key: string]: [value: string] };
	flowMap: { [key: string]: FlowMap };
}

export interface FlowMap {
	type: "file" | "folder";
	path: string;
	sourceLastModified?: number;
	lastModifiedInFlow: number;
	minLength: string;
	lengthPlusDividers: string;
	startEndInFlow: string;
}

export const DEFAULT_SETTINGS: TextFlowSettings = {
	tempFolderPlace: "not set yet", //
	tempFolderHidden: true,
	flowArray: [],
	flowObjects: {},
};
