import sdk, { EventListenerRegister, ObjectsDetected, ScryptedDeviceBase, ScryptedInterface, Setting, Settings } from "@scrypted/sdk";
import { SettingsMixinDeviceBase, SettingsMixinDeviceOptions } from "@scrypted/sdk/settings-mixin";
import { StorageSettings } from "@scrypted/sdk/storage-settings";
import keyBy from "lodash/keyBy";
import HikvisionVideoclipssProvider from "./main";
import { ReolinkCameraClient } from "./client";
import { overlayId, overlayPositions, pluginEnabledFilter } from "./utils";
import { getOverlayKeys, getOverlay, getOverlaySettings, SupportedDevice, OverlayType, ListenersMap, ListenerType, OnUpdateOverlayFn, parseOverlayData, listenersIntevalFn } from "../../scrypted-hikvision-utilities/src/utils";

export default class HikvisionUtilitiesMixin extends SettingsMixinDeviceBase<any> implements Settings {
    client: ReolinkCameraClient;
    killed: boolean;
    listenersMap: ListenersMap = {};
    checkInterval: NodeJS.Timeout;

    storageSettings = new StorageSettings(this, {
        overlayPosition: {
            title: 'Overlay position',
            type: 'string',
            choices: overlayPositions,
            defaultValue: overlayPositions[0],
        },
        duplicateFromDevice: {
            title: 'Duplicate from device',
            description: 'Duplicate OSD information from another devices enabled on the plugin',
            type: 'device',
            deviceFilter: pluginEnabledFilter,
            immediate: true,
        },
    });

    constructor(options: SettingsMixinDeviceOptions<any>, private plugin: HikvisionVideoclipssProvider) {
        super(options);

        this.plugin.mixinsMap[this.id] = this;
        setTimeout(async () => {
            if (!this.killed) {
                await this.init();
            }
        }, 2000);
    }

    removeListeners() {
        try {
            Object.values(this.listenersMap).forEach(({ listener }) => listener && listener.removeListener());
            this.checkInterval && clearInterval(this.checkInterval);
            this.checkInterval = undefined;
        } catch (e) {
            this.console.error('Error in removeListeners', e);
        }
    }

    async release() {
        this.killed = true;
        this.removeListeners();
    }

    async getDeviceProperties() {
        const deviceSettings = await this.mixinDevice.getSettings();

        const deviceSettingsMap = keyBy(deviceSettings, setting => setting.key);
        const username = deviceSettingsMap['username']?.value;
        const password = deviceSettingsMap['password']?.value;
        const host = deviceSettingsMap['ip']?.value;
        const httpPort = deviceSettingsMap['httpPort']?.value || 80;
        const channel = deviceSettingsMap['rtspChannel']?.value ?? '101';
        const httpAddress = `${host}:${httpPort}`;

        return { username, password, httpAddress, channel, host }
    }

    async getClient() {
        if (!this.client) {
            const { channel, host, username, password } = await this.getDeviceProperties();
            this.client = new ReolinkCameraClient(
                host,
                username,
                password,
                channel,
                this.console,
                true,
            );
        }
        return this.client;
    }

    async getMixinSettings(): Promise<Setting[]> {
        const settings = await this.storageSettings.getSettings();

        settings.push(...getOverlaySettings({ storage: this.storageSettings, overlayIds: [overlayId] })
            .map(item => {
                const { subgroup, ...rest } = item;
                return rest;
            }));

        return settings;
    }

    async duplicateFromDevice(deviceId: string) {
        const deviceToDuplicate = this.plugin.mixinsMap[deviceId];

        if (deviceToDuplicate) {
            const duplicateClient = await deviceToDuplicate.getClient();
            const osd = await duplicateClient.getOsd();

            const client = await this.getClient();
            await client.setOsd(osd);
            await this.getOverlayData();

            const overlayPosition = deviceToDuplicate.storageSettings.values.overlayPosition;
            const { device, type, prefix, text } = getOverlay({ overlayId, storage: deviceToDuplicate.storageSettings });
            const { deviceKey, typeKey, prefixKey, textKey } = getOverlayKeys(overlayId);

            await this.putMixinSetting(deviceKey, device);
            await this.putMixinSetting(typeKey, type);
            await this.putMixinSetting(prefixKey, prefix);
            await this.putMixinSetting(textKey, text);
            await this.putMixinSetting('overlayPosition', overlayPosition);
        }
    }

    async putMixinSetting(key: string, value: string) {
        if (key === 'duplicateFromDevice') {
            await this.duplicateFromDevice(value);
        } else {
            this.storage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
        }
    }

    async getOverlayData() {
        const client = await this.getClient();
        const deviceName = await client.getDeviceName();

        const { textKey } = getOverlayKeys(overlayId);
        this.storageSettings.putSetting(textKey, deviceName);
    }


    private updateOverlayData: OnUpdateOverlayFn = async (props: {
        overlayId: string,
        listenerType: ListenerType,
        listenInterface: ScryptedInterface,
        data?: any,
        device: ScryptedDeviceBase
    }) => {
        const { overlayId, listenerType, data, device } = props;
        this.console.log(`Update received from device ${device.name} ${JSON.stringify({
            overlayId,
            listenerType,
            data
        })}`);

        try {
            const client = await this.getClient();
            const osd = await client.getOsd();

            osd.value.Osd.osdChannel.enable = 1;
            osd.value.Osd.osdChannel.pos = this.storageSettings.values.overlayPosition;
            await client.setOsd(osd);

            const overlay = getOverlay({ overlayId, storage: this.storageSettings });
            const textToUpdate = parseOverlayData({
                data,
                listenerType,
                overlay,
                parseNumber: (input: number) => {
                    let output = input;
                    if (output < 0) {
                        output = 0;
                    }

                    return output.toFixed(0);
                }
            });

            if (textToUpdate) {
                await client.setDeviceName(textToUpdate);
            }
        } catch (e) {
            this.console.error('Error in updateOverlayData', e);
        }
    }

    async init() {
        try {
            const funct = async () => {
                try {
                    this.listenersMap = listenersIntevalFn({
                        console: this.console,
                        currentListeners: this.listenersMap,
                        id: this.id,
                        onUpdateFn: this.updateOverlayData,
                        overlayIds: [overlayId],
                        storage: this.storageSettings,
                    });
                    await this.getOverlayData();
                } catch (e) {
                    this.console.error('Error in init interval', e);
                }

            };

            this.checkInterval = setInterval(funct, 10 * 1000);
            await funct();
        } catch (e) {
            this.console.error('Error in init', e);
        }
    }
}