import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import crypto from 'crypto';
import { supabaseAdmin } from '../../src/lib/supabase';

export interface ConnectedDevice {
  deviceId: string;
  userId: string;
  deviceName: string;
  authorizedDirs: string[];
  ws: WebSocket;
  connectedAt: Date;
  lastPingAt: Date;
}

export interface BridgeRpcResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

// Memory fallback store for pair codes and devices if Supabase is offline in dev
const memoryPairCodes = new Map<string, { userId: string; expiresAt: number }>();
const memoryDevices = new Map<string, { id: string; userId: string; deviceName: string; deviceToken: string; authorizedDirs: string[] }>();

export class BridgeRelayHub {
  private static instance: BridgeRelayHub | null = null;
  private wss: WebSocketServer | null = null;
  private connectedDevices = new Map<string, ConnectedDevice>(); // deviceId -> ConnectedDevice
  private pendingRequests = new Map<string, { resolve: (res: any) => void; reject: (err: any) => void; timeout: NodeJS.Timeout }>();

  private constructor() {}

  public static getInstance(): BridgeRelayHub {
    if (!BridgeRelayHub.instance) {
      BridgeRelayHub.instance = new BridgeRelayHub();
    }
    return BridgeRelayHub.instance;
  }

  /**
   * Attach WebSocket server to existing HTTP/Express server
   */
  public attachServer(server: any): void {
    if (this.wss) return;

    this.wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (request: IncomingMessage, socket: any, head: Buffer) => {
      const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
      if (url.pathname === '/ws/bridge-hub') {
        this.wss?.handleUpgrade(request, socket, head, (ws) => {
          this.wss?.emit('connection', ws, request);
        });
      }
    });

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });

    console.log('[BridgeRelayHub] WebSocket Relay Server attached at /ws/bridge-hub');
  }

  /**
   * Handle incoming WebSocket client from Local Asset Bridge (Tauri / Native)
   */
  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    let currentDeviceId: string | null = null;

    ws.on('message', async (data: Buffer | string) => {
      try {
        const messageStr = typeof data === 'string' ? data : data.toString('utf8');
        const packet = JSON.parse(messageStr);

        // 1. Handshake Auth
        if (packet.type === 'auth') {
          const { deviceId, deviceToken } = packet;
          const authResult = await this.verifyDevice(deviceId, deviceToken);

          if (!authResult.valid || !authResult.device) {
            ws.send(JSON.stringify({ type: 'auth_response', success: false, error: 'Device authentication failed' }));
            ws.close(4001, 'Unauthorized device');
            return;
          }

          currentDeviceId = deviceId;
          const device: ConnectedDevice = {
            deviceId,
            userId: authResult.device.userId,
            deviceName: authResult.device.deviceName,
            authorizedDirs: packet.authorizedDirs || authResult.device.authorizedDirs || [],
            ws,
            connectedAt: new Date(),
            lastPingAt: new Date()
          };

          this.connectedDevices.set(deviceId, device);
          console.log(`[BridgeRelayHub] Device authenticated: ${device.deviceName} (User: ${device.userId})`);

          ws.send(JSON.stringify({
            type: 'auth_response',
            success: true,
            deviceId,
            userId: device.userId,
            message: 'Bridge Relay Connected'
          }));
          return;
        }

        // 2. Response to pending RPC request from Cloud
        if (packet.type === 'rpc_response' && packet.requestId) {
          const pending = this.pendingRequests.get(packet.requestId);
          if (pending) {
            clearTimeout(pending.timeout);
            this.pendingRequests.delete(packet.requestId);
            if (packet.success) {
              pending.resolve(packet.data);
            } else {
              pending.reject(new Error(packet.error || 'Local Bridge RPC execution failed'));
            }
          }
          return;
        }

        // 3. Heartbeat Pong
        if (packet.type === 'pong' && currentDeviceId) {
          const dev = this.connectedDevices.get(currentDeviceId);
          if (dev) dev.lastPingAt = new Date();
        }
      } catch (err: any) {
        console.warn('[BridgeRelayHub] Malformed packet received:', err);
      }
    });

    ws.on('close', () => {
      if (currentDeviceId) {
        this.connectedDevices.delete(currentDeviceId);
        console.log(`[BridgeRelayHub] Device disconnected: ${currentDeviceId}`);
      }
    });
  }

  /**
   * Verify device existence and user ownership
   */
  private async verifyDevice(deviceId: string, deviceToken: string): Promise<{ valid: boolean; device?: { userId: string; deviceName: string; authorizedDirs: string[] } }> {
    try {
      const { data, error } = await supabaseAdmin
        .from('user_devices')
        .select('user_id, device_name, authorized_directories, device_token')
        .eq('id', deviceId)
        .eq('device_token', deviceToken)
        .maybeSingle();

      if (!error && data) {
        return {
          valid: true,
          device: {
            userId: data.user_id,
            deviceName: data.device_name,
            authorizedDirs: data.authorized_directories || []
          }
        };
      }
    } catch (e) {
      // Supabase lookup failed, check in-memory
    }

    // Fallback to memory
    const memDev = memoryDevices.get(deviceId);
    if (memDev && memDev.deviceToken === deviceToken) {
      return {
        valid: true,
        device: {
          userId: memDev.userId,
          deviceName: memDev.deviceName,
          authorizedDirs: memDev.authorizedDirs
        }
      };
    }

    return { valid: false };
  }

  /**
   * Check if a specific user has an online Local Asset Bridge
   */
  public isUserDeviceOnline(userId: string): boolean {
    for (const dev of this.connectedDevices.values()) {
      if (dev.userId === userId && dev.ws.readyState === WebSocket.OPEN) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get active connected device for user
   */
  public getUserDevice(userId: string): ConnectedDevice | null {
    for (const dev of this.connectedDevices.values()) {
      if (dev.userId === userId && dev.ws.readyState === WebSocket.OPEN) {
        return dev;
      }
    }
    return null;
  }

  /**
   * Invoke RPC command on user's local Bridge
   */
  public async callUserDevice<T = any>(userId: string, action: string, payload: any = {}, timeoutMs = 15000): Promise<T> {
    const device = this.getUserDevice(userId);
    if (!device) {
      throw new Error(`设计师未运行或未连接 Local Asset Bridge 本地助手 (User: ${userId})`);
    }

    const requestId = `req_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Local Asset Bridge RPC 超时 (action: ${action}, timeout: ${timeoutMs}ms)`));
      }, timeoutMs);

      this.pendingRequests.set(requestId, { resolve, reject, timeout });

      const requestPacket = {
        type: 'rpc_request',
        requestId,
        action,
        payload
      };

      try {
        device.ws.send(JSON.stringify(requestPacket));
      } catch (err) {
        clearTimeout(timeout);
        this.pendingRequests.delete(requestId);
        reject(err);
      }
    });
  }

  // === Pairing Helpers ===

  public createPairCode(userId: string): string {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000;
    memoryPairCodes.set(code, { userId, expiresAt });
    return code;
  }

  public async completePairing(pairCode: string, deviceName: string, deviceFingerprint: string): Promise<{ deviceId: string; deviceToken: string; userId: string }> {
    const pairRecord = memoryPairCodes.get(pairCode);
    if (!pairRecord || pairRecord.expiresAt < Date.now()) {
      throw new Error('配对码无效或已过期，请在网页端重新生成');
    }

    const { userId } = pairRecord;
    memoryPairCodes.delete(pairCode);

    const deviceId = crypto.randomUUID();
    const deviceToken = `dtk_${crypto.randomBytes(24).toString('hex')}`;

    // Store in memory
    memoryDevices.set(deviceId, {
      id: deviceId,
      userId,
      deviceName,
      deviceToken,
      authorizedDirs: []
    });

    // Store in Supabase if reachable
    try {
      await supabaseAdmin.from('user_devices').insert({
        id: deviceId,
        user_id: userId,
        device_name: deviceName,
        device_fingerprint: deviceFingerprint,
        device_token: deviceToken,
        status: 'offline',
        authorized_directories: []
      });
    } catch (e) {
      console.warn('[BridgeRelayHub] Failed to persist device to Supabase, retained in memory:', e);
    }

    return { deviceId, deviceToken, userId };
  }
}

export const bridgeRelayHub = BridgeRelayHub.getInstance();
