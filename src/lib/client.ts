import axios, {
  InternalAxiosRequestConfig,
  AxiosResponse,
  AxiosInstance,
  AxiosRequestHeaders,
} from 'axios';
import {
  API_URL,
  API_CLIENT_HEADERS,
  WS_API_URL,
  WS_VERSION,
} from './request.js';
import { SmartRentAuthClient } from './auth.js';
import { SmartRentPlatform } from '../platform.js';
import WebSocket from 'ws';
import { Logger } from 'homebridge';
import { randomInt } from 'node:crypto';
import { redactSensitive } from './utils.js';

export type WSDeviceList = `devices:${string}`;
export type WSEvent = {
  id: number;
  name:
    | 'leak'
    | 'motion_binary'
    | 'fan_mode'
    | 'current_temp'
    | 'current_humidity'
    | 'heating_setpoint'
    | 'cooling_setpoint'
    | 'mode'
    | 'operating_state'
    | 'locked'
    | 'level'
    | 'on'
    | 'notifications';
  remote_id: string;
  type: string;
  last_read_state: string;
  last_read_state_changed_at: string;
};
export type WSPayload = [null, null, WSDeviceList, string, WSEvent];

export class SmartRentApiClient {
  private readonly authClient: SmartRentAuthClient;
  private readonly apiClient: AxiosInstance;
  protected readonly log: Logger | Console;

  constructor(readonly platform: SmartRentPlatform) {
    this.authClient = new SmartRentAuthClient(
      platform.api.user.storagePath(),
      platform.log
    );
    this.log = platform.log ?? console;
    this.apiClient = this._initializeApiClient();
  }

  /**
   * Initialize Axios instance for SmartRent API requests
   * @returns Axios instance
   */
  private _initializeApiClient() {
    const apiClient = axios.create({
      baseURL: API_URL,
      headers: API_CLIENT_HEADERS,
    });
    apiClient.interceptors.request.use(this._handleRequest.bind(this));
    apiClient.interceptors.response.use(this._handleResponse.bind(this));
    return apiClient;
  }

  /**
   * Get the SmartRent API access token
   * @returns Oauth access token
   */
  public async getAccessToken() {
    return this.authClient.getAccessToken({
      email: this.platform.config.email,
      password: this.platform.config.password,
      tfaSecret: this.platform.config.tfaSecret,
    });
  }

  /**
   * Get the SmartRent API access token
   * @returns Oauth access token
   */
  public async getWebSocketToken() {
    return this.authClient.getWebSocketToken({
      email: this.platform.config.email,
      password: this.platform.config.password,
      tfaSecret: this.platform.config.tfaSecret,
    });
  }

  /**
   * Attach the access token to the SmartRent API request and log the request
   * @param config Axios request config
   * @returns Axios request config
   */
  private async _handleRequest(config: InternalAxiosRequestConfig) {
    const accessToken = await this.getAccessToken();
    config.headers = {
      ...config.headers,
      Authorization: `Bearer ${accessToken}`,
    } as AxiosRequestHeaders;
    this.log.debug(
      'Request:',
      JSON.stringify(redactSensitive(config), null, 2)
    );
    return config;
  }

  /**
   * Log the SmartRent API response
   * @param response Axios response
   * @returns SmartRent response data payload
   */
  private _handleResponse(response: AxiosResponse) {
    this.log.debug(
      'Response:',
      JSON.stringify(redactSensitive(response.data), null, 2)
    );
    return response;
  }

  // API request methods

  public async get<T, D = unknown>(
    path: string,
    config?: InternalAxiosRequestConfig<D>
  ) {
    const response = await this.apiClient.get<T>(path, config);
    return response.data;
  }

  public async post<T, D = unknown>(
    path: string,
    data?: D,
    config?: InternalAxiosRequestConfig<D>
  ) {
    const response = await this.apiClient.post<T>(path, data, config);
    return response.data;
  }

  public async patch<T, D = unknown>(
    path: string,
    data?: D,
    config?: InternalAxiosRequestConfig<D>
  ) {
    const response = await this.apiClient.patch<T>(path, data, config);
    return response.data;
  }
}

export class SmartRentWebsocketClient extends SmartRentApiClient {
  public wsClient: Promise<WebSocket>;
  public event: object;
  private readonly devices: number[];
  private reconnectAttempts = 0;
  private stableTimer?: NodeJS.Timeout;

  private static readonly MAX_RECONNECT_DELAY_MS = 30000;
  /**
   * A connection must stay open this long before the backoff is allowed to
   * reset. Matches the backoff ceiling so a flapping endpoint can never
   * reconnect faster than the ceiling allows.
   */
  private static readonly CONNECTION_STABLE_MS = 30000;

  constructor(readonly platform: SmartRentPlatform) {
    super(platform);
    this.wsClient = this._initializeWsClient();
    this.event = {};
    this.devices = [];
  }

  private _emitize(obj: object, eventName: string) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    let _subscriptions = new Set<Function>();
    Object.defineProperty(obj, eventName, {
      set(func) {
        _subscriptions.add(func);
      },
      get() {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const emit = (...args: any[]) => {
          _subscriptions.forEach(f => f(...args));
        };

        Object.defineProperty(emit, 'off', {
          set(func) {
            _subscriptions.delete(func);
          },
          get() {
            _subscriptions = new Set();
          },
        });

        return emit;
      },
    });
  }

  /**
   * Initialize WebSocket client for SmartRent API
   * @returns WebSocket client
   */
  private async _initializeWsClient() {
    this.log.debug('WebSocket connection opening');
    const token = String(await this.getAccessToken());
    const wsClient = new WebSocket(
      WS_API_URL +
        '?' +
        new URLSearchParams({ token, vsn: WS_VERSION }).toString()
    );
    wsClient.onopen = this._handleWsOpen.bind(this);
    wsClient.onmessage = this._handleWsMessage.bind(this);
    wsClient.onerror = this._handleWsError.bind(this);
    wsClient.onclose = this._handleWsClose.bind(this);
    return wsClient;
  }

  private _handleWsOpen() {
    this.log.debug('WebSocket connection opened');
    // A completed handshake alone doesn't mean the connection is usable — the
    // server may accept it and close immediately (e.g. rejecting the token).
    // Resetting the backoff here would make every such retry wait the initial
    // ~1s, so only reset once the connection has actually stayed open.
    clearTimeout(this.stableTimer);
    this.stableTimer = setTimeout(() => {
      this.log.debug(
        'WebSocket connection stable, resetting reconnect backoff'
      );
      this.reconnectAttempts = 0;
    }, SmartRentWebsocketClient.CONNECTION_STABLE_MS);
    this.devices.forEach(device => this.subscribeDevice(device));
  }

  private _handleWsMessage(message: WebSocket.MessageEvent) {
    try {
      this.log.debug(`WebSocket message received: Data: ${message.data}`);
      const data: WSPayload = JSON.parse(String(message.data));
      if (
        Array.isArray(data) &&
        typeof data[3] === 'string' &&
        data[3].includes('attribute_state')
      ) {
        const device = String(data[2]).split(':')[1];
        const handler = this.event[device];
        if (typeof handler === 'function') {
          this.log.debug(String(data[4]));
          handler(data[4]);
        }
      }
    } catch (err) {
      this.log.debug('Ignoring malformed WebSocket frame', err);
    }
  }

  private _handleWsError(error: WebSocket.ErrorEvent) {
    this.log.error(`WebSocket error: ${error.message}`);
    // Closing here triggers the 'close' event, which _handleWsClose uses to
    // reconnect (with backoff) — don't reconnect a second time here too.
    this.wsClient.then(client => client.close());
  }

  private _handleWsClose(event: WebSocket.CloseEvent) {
    this.log.debug(
      `WebSocket connection closed: Code: ${event.code}, Reason: ${event.reason}`
    );
    clearTimeout(this.stableTimer);
    const delay =
      Math.min(
        SmartRentWebsocketClient.MAX_RECONNECT_DELAY_MS,
        1000 * 2 ** this.reconnectAttempts
      ) + randomInt(0, 1000);
    this.reconnectAttempts++;
    setTimeout(() => {
      this.wsClient = this._initializeWsClient();
    }, delay);
  }

  /**
   * Adds device to websocket client subsciption list and announces events to device handlers
   * @param deviceId Device ID
   */
  public async subscribeDevice(deviceId: number) {
    this.log.debug(`Subscribing to device: ${deviceId}`);
    if (!this.devices.includes(deviceId)) {
      this.devices.push(deviceId);
      this._emitize(this.event, `${deviceId}`);
    }
    try {
      if ((await this.wsClient).readyState !== WebSocket.OPEN) {
        throw new Error('WebSocket not ready');
      }
      (await this.wsClient).send(
        JSON.stringify(<WSPayload>[
          null,
          null,
          `devices:${deviceId}`,
          'phx_join',
          {},
        ])
      );
      this.log.debug(`Subscribed to device: ${deviceId}`);
    } catch (err) {
      this.log.error(String(err));
      this.log.error(`Dang didnt subscribe ${deviceId}, trying again`);
      setTimeout(() => this.subscribeDevice(deviceId), 1000);
    }
  }
}
