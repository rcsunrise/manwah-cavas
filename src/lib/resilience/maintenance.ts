/**
 * Service Mode and Maintenance Control
 */

export type ServiceMode = 'normal' | 'read-only' | 'maintenance';

class MaintenanceManager {
  private mode: ServiceMode = 'normal';
  private listeners = new Set<(mode: ServiceMode) => void>();

  getMode(): ServiceMode {
    return this.mode;
  }

  setMode(newMode: ServiceMode) {
    if (this.mode !== newMode) {
      this.mode = newMode;
      console.log(`[MaintenanceManager] Service mode updated to: ${newMode}`);
      this.listeners.forEach(fn => fn(newMode));
    }
  }

  isWriteAllowed(): boolean {
    return this.mode === 'normal';
  }

  isReadAllowed(): boolean {
    return this.mode !== 'maintenance';
  }

  subscribe(listener: (mode: ServiceMode) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const maintenanceManager = new MaintenanceManager();

export class MaintenanceError extends Error {
  constructor(
    public readonly mode: ServiceMode,
    message = '系统正在维护中，请稍后重试',
  ) {
    super(message);
    this.name = 'MaintenanceError';
  }
}

export function assertWriteAllowed(mode: ServiceMode = maintenanceManager.getMode()): void {
  if (mode !== 'normal') {
    throw new MaintenanceError(mode, mode === 'read-only' ? '系统处于只读模式，暂不支持写入' : '系统正在维护，暂停所有写操作');
  }
}
