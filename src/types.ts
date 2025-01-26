//#######################################################################
//###########################                ############################
//###########################     types      ############################
//###########################                ############################
//#######################################################################

export interface TextFlowSettings {
	tempFolderPlace: string;
	tempFolderHidden: boolean;
	activeFlow?: string;
	flowObjects: { [key: string]: FlowDef };
}

export interface FlowDef {
	sourcePath: string;
	flowFileName: string;
	divider: string;
	activeArea?: string;
	activeAreaType?: string;
	activeAreaStartEnd?: { start: number; end: number };
	flowArray: string[];
	excludedFolders?: string[];
	includedMetaData?: { [key: string]: [value: string] };
	excludedMetaData?: { [key: string]: [value: string] };
	flowMap: { [key: string]: FlowMap };
}

export interface FlowMap {
	type: "file" | "folder";
	path: string;
	itemName: string;
	sourceLastModified?: number;
	lastModifiedInFlow: number;
	minLength: number;
	lengthPlusDividers: number;
	startEndInFlow: { start: number; end: number };
}

export const DEFAULT_SETTINGS: TextFlowSettings = {
	tempFolderPlace: "not set yet", //
	tempFolderHidden: true,
	flowObjects: {},
};

export interface mapValueBasket {
	tempFileContents: string;
	currentStart: number;
	currentEnd: number;
	initialIteration: boolean;
}
