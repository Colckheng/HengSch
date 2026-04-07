import type { IStorage } from '@hengsch/shared-storage';

/**
 * 基于 localStorage 的存储实现
 */
export class LocalStorageAdapter implements IStorage {
  async get<T = unknown>(key: string): Promise<T | undefined> {
    try {
      const item = localStorage.getItem(key);
      if (item === null) {
        return undefined;
      }
      return JSON.parse(item) as T;
    } catch (error) {
      console.error(`Failed to get key "${key}" from localStorage:`, error);
      return undefined;
    }
  }

  async set<T = unknown>(key: string, value: T): Promise<void> {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`Failed to set key "${key}" to localStorage:`, error);
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error(`Failed to delete key "${key}" from localStorage:`, error);
      throw error;
    }
  }

  async clear(): Promise<void> {
    try {
      localStorage.clear();
    } catch (error) {
      console.error('Failed to clear localStorage:', error);
      throw error;
    }
  }

  async keys(): Promise<string[]> {
    try {
      return Object.keys(localStorage);
    } catch (error) {
      console.error('Failed to get keys from localStorage:', error);
      return [];
    }
  }
}

// 导出单例实例
export const storage = new LocalStorageAdapter();
