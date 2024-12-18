import sdk, { DeviceBase, HttpRequest, HttpRequestHandler, HttpResponse, MixinProvider, ScryptedDeviceBase, ScryptedDeviceType, ScryptedInterface, Setting, SettingValue, WritableDeviceState } from "@scrypted/sdk";
import { StorageSettings } from "@scrypted/sdk/storage-settings";
import { cleanup } from "./utils";
import ReolinkUtilitiesMixin from "./cameraMixin";

export default class ReolinkUtilitiesProvider extends ScryptedDeviceBase implements MixinProvider, HttpRequestHandler {
    storageSettings = new StorageSettings(this, {
        debug: {
            title: 'Log debug messages',
            type: 'boolean',
            defaultValue: false,
            immediate: true,
        },
        downloadFolder: {
            title: 'Directory where to cache thumbnails and videoclips',
            description: 'Default to the plugin folder',
            type: 'string',
        },
        basicAuthToken: {
            title: 'Basic authnetication token',
            type: 'string',
        },
        clearDownloadedData: {
            title: 'clear stored data',
            type: 'button',
            onPut: async () => await cleanup(this.storageSettings.values.downloadFolder)
        },
    });
    public mixinsMap: Record<string, ReolinkUtilitiesMixin> = {};

    constructor(nativeId: string) {
        super(nativeId);
    }

    async onRequest(request: HttpRequest, response: HttpResponse): Promise<void> {
        const decodedUrlWithParams = decodeURIComponent(request.url);
        const [decodedUrl] = decodedUrlWithParams.split('?');
        const [_, __, ___, ____, _____, webhook, ...rest] = decodedUrl.split('/');
        const [deviceId, ...videoclipPath] = rest;
        const videoclipId = videoclipPath.join('/');
        const dev = this.mixinsMap[deviceId];

        try {
            if (webhook === 'videoclip') {
                const api = await dev.getClient();
                const { playbackPathWithHost2 } = await api.getVideoClipUrl(videoclipId, deviceId);
                this.console.log(`Videoclip url is ${playbackPathWithHost2} for device ${deviceId}`);

                response.send('', {
                    code: 302,
                    headers: {
                        // 'Set-Cookie': `token=${basicAuthToken}`,
                        // Authentication: `Basic ${basicAuthToken}`
                        Location: playbackPathWithHost2,
                    }
                });
                return;

                // const stream = await axios.get(playbackPathWithHost, { responseType: 'stream' });
                // response.sendStream(stream.data, {
                //     code: 200
                // });
                // response.sendStream((async function* () {
                //     const stream = await axios.get(playbackPathWithHost, { responseType: 'stream' });
                //     yield stream.data;
                // })(), {
                //     code: 200
                // });
                // return;
            } else
                if (webhook === 'thumbnail') {
                    const thumbnailMo = await dev.getVideoClipThumbnail(videoclipId);
                    const jpeg = await sdk.mediaManager.convertMediaObjectToBuffer(thumbnailMo, 'image/jpeg');
                    response.send(jpeg, {
                        headers: {
                            'Content-Type': 'image/jpeg',
                        }
                    });
                    return;
                }
        } catch (e) {
            response.send(`${JSON.stringify(e)}, ${e.message}`, {
                code: 400,
            });

            return;
        }
        response.send(`Webhook not found: ${decodedUrl}`, {
            code: 404,
        });

        return;
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
                ScryptedInterface.Settings,
                ScryptedInterface.VideoClips,
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