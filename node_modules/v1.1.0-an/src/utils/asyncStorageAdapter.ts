import AsyncStorage from '@react-native-async-storage/async-storage';
import type { IStorage } from '@hengsch/shared-storage';

/**
 * 基于 AsyncStorage 的存储实现（移动端）
 */
export class AsyncStorageAdapter implements IStorage {
  async get<T = unknown>(key: string): Promise<T | undefined> {
    try {
      const item = await AsyncStorage.getItem(key);
      if (item === null) return undefined;
      return JSON.parse(item) as T;
    } catch (error) {
      console.error(`[AsyncStorage] Failed to get key "${key}":`, error);
      return undefined;
    }
  }

  async set<T = unknown>(key: string, value: T): Promise<void> {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`[AsyncStorage] Failed to set key "${key}":`, error);
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.error(`[AsyncStorage] Failed to delete key "${key}":`, error);
      throw error;
    }
  }

  async clear(): Promise<void> {
    try {
      await AsyncStorage.clear();
    } catch (error) {
      console.error('[AsyncStorage] Failed to clear:', error);
      throw error;
    }
  }

  async keys(): Promise<string[]> {
    try {
      return await AsyncStorage.getAllKeys();
    } catch (error) {
      console.error('[AsyncStorage] Failed to get keys:', error);
      return [];
    }
  }
}

export const storage = new AsyncStorageAdapter();
