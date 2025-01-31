import { DeviceBase, MixinProvider, ScryptedDeviceBase, ScryptedDeviceType, ScryptedInterface, Setting, SettingValue, WritableDeviceState } from "@scrypted/sdk";
import { StorageSettings } from "@scrypted/sdk/storage-settings";
import ReolinkUtilitiesMixin from "./cameraMixin";
import { REOLINK_UTILITIES_INTERFACE } from "./utils";

export default class ReolinkUtilitiesProvider extends ScryptedDeviceBase implements MixinProvider {
    storageSettings = new StorageSettings(this, {
    });
    public mixinsMap: Record<string, ReolinkUtilitiesMixin> = {};

    constructor(nativeId: string) {
        super(nativeId);

        this.init().catch(this.console.log);
    }

    async init() {
    }

    async getSettings() {
        const settings: Setting[] = await this.storageSettings.getSettings();

        return settings;
    }

    putSetting(key: string, value: SettingValue): Promise<void> {
        return this.storageSettings.putSetting(key, value);
    }


    async canMixin(type: ScryptedDeviceType, interfaces: string[]): Promise<string[]> {
        return [
            ScryptedInterface.Camera,
            ScryptedInterface.VideoCamera,
        ].some(int => interfaces.includes(int)) ?
            [
                REOLINK_UTILITIES_INTERFACE,
                ScryptedInterface.Settings,
            ] :
            undefined;
    }

    async getMixin(mixinDevice: DeviceBase, mixinDeviceInterfaces: ScryptedInterface[], mixinDeviceState: WritableDeviceState): Promise<any> {
        return new ReolinkUtilitiesMixin(
            {
                mixinDevice,
                mixinDeviceInterfaces,
                mixinDeviceState,
                mixinProviderNativeId: this.nativeId,
                group: 'Reolink utilities',
                groupKey: 'reolinkUtilities',
            },
            this);
    }

    async releaseMixin(id: string, mixinDevice: any): Promise<void> {
        await mixinDevice.release();
    }
}