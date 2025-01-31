import sdk, { EventListenerRegister, ObjectsDetected, ScryptedInterface, Setting, Settings } from "@scrypted/sdk";
import { SettingsMixinDeviceBase, SettingsMixinDeviceOptions } from "@scrypted/sdk/settings-mixin";
import { StorageSettings } from "@scrypted/sdk/storage-settings";
import keyBy from "lodash/keyBy";
import HikvisionVideoclipssProvider from "./main";
import { ReolinkCameraClient } from "./client";
import { overlayId } from "./utils";
import { getOverlayKeys, getOverlay, getOverlaySettings, updateCameraConfigurationRegex, SupportedDevice, OverlayType } from "../../scrypted-hikvision-utilities/src/utils";

export default class HikvisionUtilitiesMixin extends SettingsMixinDeviceBase<any> implements Settings {
    client: ReolinkCameraClient;
    killed: boolean;
    lastFaceDetected: string;
    detectionListener: EventListenerRegister;

    storageSettings = new StorageSettings(this, {
        updateInterval: {
            title: 'Update interval in seconds',
            type: 'number',
            defaultValue: 10
        },
        getCurrentOverlayConfigurations: {
            title: 'Get current overlay configurations',
            type: 'button',
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

    async release() {
        this.killed = true;
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

        settings.push(...getOverlaySettings({ storage: this.storageSettings, overlayIds: [overlayId] }));

        return settings;
    }

    async putMixinSetting(key: string, value: string) {
        const updateCameraConfigurations = updateCameraConfigurationRegex.exec(key);

        if (key === 'getCurrentOverlayConfigurations') {
            await this.getOverlayData();
        } else if (updateCameraConfigurations) {
            const overlayId = updateCameraConfigurations[1];
            await this.updateOverlayData(overlayId);
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

    async updateOverlayData(overlayId: string) {
        const client = await this.getClient();
        const { device, type, prefix, text } = getOverlay({ overlayId, storage: this.storageSettings });

        let textToUpdate = text;
        if (type === OverlayType.Device && device) {
            const realDevice = sdk.systemManager.getDeviceById<SupportedDevice>(device);
            if (realDevice) {
                if (realDevice.interfaces.includes(ScryptedInterface.Thermometer)) {
                    textToUpdate = `${prefix || ''}${Number(realDevice.temperature.toFixed(0))} ${realDevice.temperatureUnit}`;
                } else if (realDevice.interfaces.includes(ScryptedInterface.HumiditySensor)) {
                    textToUpdate = `${prefix || ''}${realDevice.humidity} %`;
                }
            }
        } else if (type === OverlayType.FaceDetection) {
            textToUpdate = `${prefix || ''}${this.lastFaceDetected || '-'}`;
        }

        await client.setDeviceName(textToUpdate);
    }

    checkEventListeners(props: {
        faceEnabled: boolean
    }) {
        const { faceEnabled } = props;

        if (faceEnabled) {
            if (!this.detectionListener) {
                this.console.log('Starting Object detection for faces');
                this.detectionListener = sdk.systemManager.listenDevice(this.id, ScryptedInterface.ObjectDetector, async (_, __, data) => {
                    const detection: ObjectsDetected = data;

                    const faceLabel = detection.detections.find(det => det.className === 'face' && det.label)?.label;
                    if (faceLabel) {
                        this.console.log(`Face detected: ${faceLabel}`);
                        this.lastFaceDetected = faceLabel;
                    }
                });
            }
        } else if (this.detectionListener) {
            this.console.log('Stopping Object detection for faces');
            this.detectionListener && this.detectionListener.removeListener();
            this.detectionListener = undefined;
        }
    }

    async init() {
        await this.getOverlayData();

        setInterval(async () => {
            const overlay = getOverlay({
                overlayId,
                storage: this.storageSettings
            });

            if (overlay.type !== OverlayType.Text) {
                await this.updateOverlayData(overlayId);
            }

            if (overlay.type === OverlayType.FaceDetection) {
                this.checkEventListeners({ faceEnabled: true });
            }

        }, this.storageSettings.values.updateInterval * 1000);
    }
}