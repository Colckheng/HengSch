/**
 * 存储接口抽象
 * 不同端（桌面端、Web端、移动端）可以实现各自的存储实现
 */
export interface IStorage {
  /**
   * 获取存储的值
   */
  get<T = unknown>(key: string): Promise<T | undefined>;

  /**
   * 设置存储的值
   */
  set<T = unknown>(key: string, value: T): Promise<void>;

  /**
   * 删除存储的值
   */
  delete(key: string): Promise<void>;

  /**
   * 清空所有存储
   */
  clear?(): Promise<void>;

  /**
   * 获取所有键
   */
  keys?(): Promise<string[]>;
}
