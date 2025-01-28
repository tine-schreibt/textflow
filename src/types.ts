//#######################################################################
//###########################                ############################
//###########################     types      ############################
//###########################                ############################
//#######################################################################

export interface TextFlowSettings {
	tempFolderPlace: string;
	tempFolderHidden: boolean;
	flowLeafInFocus?: boolean;
	activeFlows?: string[];
	divider: string;
	flows: { [key: string]: FlowDef };
}

export interface FlowDef {
	sourcePath: string;
	flowFileName: string;
	activeRegion?: string;
	activeRegionType?: string;
	activeRegionStartEnd: { start: number; end: number };
	excludedFolders?: string[];
	includedMetaData?: { [key: string]: [value: string] };
	excludedMetaData?: { [key: string]: [value: string] };
	flowPathsArray: string[];
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
	divider: "***",
	flows: {},
};

export interface mapValueBasket {
	tempFileContents: string;
	currentStart: number;
	currentEnd: number;
	initialIteration: boolean;
}
