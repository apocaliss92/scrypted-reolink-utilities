import { VideoClipOptions } from '@scrypted/sdk';
import { AuthFetchCredentialState, authHttpFetch } from '@scrypted/common/src/http-auth-fetch';
import { PassThrough, Readable } from 'stream';
import { HttpFetchOptions } from '../../scrypted/server/src/fetch/http-fetch';
import { getLoginParameters } from '../../scrypted/plugins/reolink/src/probe';
import { Osd } from './utils';

export interface LoginData {
    tokenLease: number;
    parameters: Record<string, string>;
}

export class ReolinkCameraClient {
    credential: AuthFetchCredentialState;
    parameters: Record<string, string>;
    tokenLease: number;
    loggingIn = false;
    refreshTokenInterval: NodeJS.Timeout;

    constructor(
        public host: string,
        public username: string,
        public password: string,
        public channelId: number,
        public console: Console,
        public readonly forceToken?: boolean
    ) {
        this.credential = {
            username,
            password,
        };
        this.parameters = {};
        // if (loginData?.parameters.token) {
        //     this.parameters.token = loginData.parameters;
        //     this.tokenLease = loginData.tokenLease;
        // }

        this.refreshTokenInterval = setInterval(async () => this.refreshSession(), 1000 * 60 * 5);
        this.refreshSession().catch(this.console.log);
    }

    async refreshSession() {
        try {
            await this.logout();
            await this.login();
        } catch (e) {
            this.console.log('Error in refreshSession', e);
        }
    }

    private async request(options: HttpFetchOptions<Readable>, body?: Readable) {
        const response = await authHttpFetch({
            ...options,
            rejectUnauthorized: false,
            credential: this.credential,
            body,
        });
        return response;
    }

    private createReadable = (data: any) => {
        const pt = new PassThrough();
        pt.write(Buffer.from(JSON.stringify(data)));
        pt.end();
        return pt;
    }

    async logout() {
        const url = new URL(`http://${this.host}/api.cgi`);
        const params = url.searchParams;
        params.set('cmd', 'Logout');
        await this.requestWithLogin({
            url,
            responseType: 'json',
        });

        this.parameters = {};
        this.tokenLease = undefined;
    }

    async login() {
        try {
            if (!this.loggingIn) {
                this.loggingIn = true;
                if (this.tokenLease > Date.now()) {
                    return;
                }

                if (this.tokenLease) {
                    this.console.log(`token expired at ${this.tokenLease}, renewing...`);
                }

                const { parameters, leaseTimeSeconds } = await getLoginParameters(this.host, this.username, this.password, this.forceToken);
                this.parameters = parameters
                this.tokenLease = Date.now() + 1000 * leaseTimeSeconds;
                this.loggingIn = false;
                this.console.log(`New token: ${parameters.token}`);
            }
        } finally {
            this.loggingIn = false;
        }
    }

    async requestWithLogin(options: HttpFetchOptions<Readable>, body?: Readable) {
        await this.login();
        const url = options.url as URL;
        const params = url.searchParams;
        for (const [k, v] of Object.entries(this.parameters)) {
            params.set(k, v);
        }
        return this.request(options, body);
    }

    async getDeviceName() {
        const url = new URL(`http://${this.host}/api.cgi`);

        const body = [
            {
                cmd: "GetDevName",
                param: { channel: this.channelId }
            },
        ];

        const response = await this.requestWithLogin({
            url,
            responseType: 'json',
            method: 'POST',
        }, this.createReadable(body));

        const error = response.body?.find(elem => elem.error)?.error;
        if (error) {
            this.console.error('error during call to getDeviceName', error);
        }

        return response.body?.[0]?.value?.DevName?.name;

    }

    async setDeviceName(name: string) {
        const url = new URL(`http://${this.host}/api.cgi`);

        const body = [
            {
                cmd: "SetDevName",
                param: {
                    channel: this.channelId,
                    DevName: {
                        name
                    }
                }
            },
        ];

        const response = await this.requestWithLogin({
            url,
            responseType: 'json',
            method: 'POST',
        }, this.createReadable(body));

        const error = response.body?.find(elem => elem.error)?.error;
        if (error) {
            this.console.error('error during call to setDeviceName', error);
        }
    }

    async getOsd() {
        const url = new URL(`http://${this.host}/api.cgi`);

        const body = [
            {
                cmd: "GetOsd",
                action: 1,
                param: { channel: this.channelId }
            },
        ];

        const response = await this.requestWithLogin({
            url,
            responseType: 'json',
            method: 'POST',
        }, this.createReadable(body));

        const error = response.body?.find(elem => elem.error)?.error;
        if (error) {
            this.console.error('error during call to getOsd', error);
        }

        return response.body?.[0] as Osd;
    }

    async setOsd(osd: Osd) {
        const url = new URL(`http://${this.host}/api.cgi`);

        const body = [
            {
                cmd: "SetOsd",
                param: {
                    Osd: {
                        channel: this.channelId,
                        osdChannel: osd.value.Osd.osdChannel,
                        osdTime: osd.value.Osd.osdTime,
                    }
                }
            }
        ];

        const response = await this.requestWithLogin({
            url,
            responseType: 'json',
            method: 'POST',
        }, this.createReadable(body));

        const error = response.body?.find(elem => elem.error)?.error;
        if (error) {
            this.console.error('error during call to getOsd', error);
        }
    }
}
