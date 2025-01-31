export const REOLINK_UTILITIES_INTERFACE = `REOLINK_UTILITIES`;
export const pluginEnabledFilter = `interfaces.includes('${REOLINK_UTILITIES_INTERFACE}')`;
export const overlayId = 'DevName';
export const overlayPositions = [
    "Lower Left",
    "Upper Left",
    "Top Center",
    "Upper Right",
    "Bottom Center",
    "Lower Right",
    "Other Configuration"
];

export interface Osd {
    cmd: string;
    code: number;
    initial: Initial;
    range: Range;
    value: Initial;
}

export interface Initial {
    Osd: InitialOsd;
}

export interface InitialOsd {
    bgcolor: number;
    channel: number;
    osdChannel: PurpleOsdChannel;
    osdTime: PurpleOsdTime;
    watermark: number;
}

export interface PurpleOsdChannel {
    enable: number;
    name: string;
    pos: string;
}

export interface PurpleOsdTime {
    enable: number;
    pos: string;
}

export interface Range {
    Osd: RangeOsd;
}

export interface RangeOsd {
    bgcolor: string;
    channel: number;
    osdChannel: FluffyOsdChannel;
    osdTime: FluffyOsdTime;
    watermark: string;
}

export interface FluffyOsdChannel {
    enable: string;
    name: Name;
    pos: string[];
}

export interface Name {
    maxLen: number;
}

export interface FluffyOsdTime {
    enable: string;
    pos: string[];
}
