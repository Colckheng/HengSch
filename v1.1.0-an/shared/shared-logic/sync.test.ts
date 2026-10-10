import { describe, it, expect } from 'vitest';
import { mergeSyncStates, pickWinner, normalizeSynced, parseSyncFile, TOMBSTONE_TTL_MS } from './sync';
import type { Todo, Group, RecurringTodo } from '@hengsch/shared-types';

const NOW = Date.parse('2026-10-09T12:00:00');
const DAY = 86_400_000;
const todo = (over: Partial<RecurringTodo> & { id: string }): RecurringTodo => ({
  title: 'task',
  type: 'recurring',
  cycleType: 'daily',
  status: 'pending',
  createdAt: NOW - DAY,
  order: 0,
  updatedAt: NOW - DAY,
  deviceId: 'dev-a',
  ...over
});

const group = (over: Partial<Group> & { id: string }): Group => ({
  name: 'g',
  color: '#fff',
  createdAt: NOW - DAY,
  updatedAt: NOW - DAY,
  deviceId: 'dev-a',
  ...over
});

const wrap = (todos: Todo[], groups: Group[]) => ({ todos, groups });

describe('pickWinner / normalizeSynced', () => {
  it('缺字段补齐：updatedAt=createdAt、deviceId=legacy', () => {
    const r = normalizeSynced({ id: 'x', createdAt: 123, deleted: undefined } as unknown as Group);
    expect(r.updatedAt).toBe(123);
    expect(r.deviceId).toBe('legacy');
  });

  it('updatedAt 大者胜', () => {
    const a = { id: 'x', createdAt: 1, updatedAt: 10, deviceId: 'a' };
    const b = { id: 'x', createdAt: 1, updatedAt: 20, deviceId: 'b' };
    expect(pickWinner(a, b)).toBe(b);
    expect(pickWinner(b, a)).toBe(b);
  });

  it('updatedAt 相等 → deviceId 字典序大者胜（输入顺序对称）', () => {
    const a = { id: 'x', createdAt: 1, updatedAt: 10, deviceId: 'aaa' };
    const b = { id: 'x', createdAt: 1, updatedAt: 10, deviceId: 'bbb' };
    expect(pickWinner(a, b)).toBe(b);
    expect(pickWinner(b, a)).toBe(b);
  });

  it('完全相等 → 内容定序（对称）', () => {
    const a = { id: 'x', createdAt: 1, updatedAt: 10, deviceId: 'same', v: 1 };
    const b = { id: 'x', createdAt: 1, updatedAt: 10, deviceId: 'same', v: 2 };
    expect(pickWinner(a, b)).toBe(b);
    expect(pickWinner(b, a)).toBe(b);
  });

  it('单边存在 → 取存在侧', () => {
    const a = { id: 'x', createdAt: 1 };
    expect(pickWinner(a, undefined)).toBe(a);
    expect(pickWinner(undefined, a)).toBe(a);
    expect(pickWinner(undefined, undefined)).toBeUndefined();
  });
});

describe('mergeSyncStates · LWW 矩阵', () => {
  it('本地更新 → 保留本地', () => {
    const local = wrap([todo({ id: 't1', title: 'local-new', updatedAt: NOW })], []);
    const remote = wrap([todo({ id: 't1', title: 'remote-old', updatedAt: NOW - DAY })], []);
    const out = mergeSyncStates(local, remote, NOW);
    expect(out.todos[0].title).toBe('local-new');
  });

  it('远端更新 → 保留远端', () => {
    const local = wrap([todo({ id: 't1', title: 'local-old', updatedAt: NOW - DAY })], []);
    const remote = wrap([todo({ id: 't1', title: 'remote-new', updatedAt: NOW })], []);
    const out = mergeSyncStates(local, remote, NOW);
    expect(out.todos[0].title).toBe('remote-new');
  });

  it('单边新增（远端有本地无）→ 进入结果', () => {
    const out = mergeSyncStates(wrap([], []), wrap([todo({ id: 't2' })], []), NOW);
    expect(out.todos.map((t) => t.id)).toEqual(['t2']);
  });

  it('删 vs 改：墓碑更新 → 删除胜出', () => {
    const local = wrap([todo({ id: 't1', deleted: true, updatedAt: NOW })], []);
    const remote = wrap([todo({ id: 't1', title: 'edited', updatedAt: NOW - 1000 })], []);
    const out = mergeSyncStates(local, remote, NOW);
    expect(out.todos[0].deleted).toBe(true);
  });

  it('删 vs 改：编辑更新 → 复活（编辑发生在删除之后，LWW 正确语义）', () => {
    const local = wrap([todo({ id: 't1', deleted: true, updatedAt: NOW - 1000 })], []);
    const remote = wrap([todo({ id: 't1', title: 'edited-later', updatedAt: NOW })], []);
    const out = mergeSyncStates(local, remote, NOW);
    expect(out.todos[0].deleted).toBeUndefined();
    expect(out.todos[0].title).toBe('edited-later');
  });

  it('30 天前的墓碑被清除', () => {
    const old = NOW - TOMBSTONE_TTL_MS - DAY;
    const local = wrap([todo({ id: 'dead', deleted: true, updatedAt: old })], []);
    const remote = wrap([], []);
    expect(mergeSyncStates(local, remote, NOW).todos).toHaveLength(0);
  });

  it('29 天的墓碑仍保留', () => {
    const recent = NOW - TOMBSTONE_TTL_MS + DAY;
    const local = wrap([todo({ id: 'dead', deleted: true, updatedAt: recent })], []);
    expect(mergeSyncStates(local, remoteEmpty(), NOW).todos).toHaveLength(1);
  });

  it('updatedAt 相等跨设备 → deviceId 定序，两端结果一致', () => {
    const a = wrap([todo({ id: 't1', title: 'from-A', updatedAt: NOW, deviceId: 'dev-a' })], []);
    const b = wrap([todo({ id: 't1', title: 'from-B', updatedAt: NOW, deviceId: 'dev-b' })], []);
    const ab = mergeSyncStates(a, b, NOW);
    const ba = mergeSyncStates(b, a, NOW);
    expect(ab.todos[0].title).toBe('from-B');
    expect(ba.todos[0].title).toBe('from-B');
  });

  it('迁移：缺同步元数据的存量记录参与合并并被补齐', () => {
    const legacy = { id: 't1', title: 'legacy', type: 'once', status: 'pending', createdAt: 1000, order: 0 } as Todo;
    const out = mergeSyncStates(wrap([legacy], []), wrap([], []), NOW);
    expect(out.todos[0]).toMatchObject({ updatedAt: 1000, deviceId: 'legacy' });
  });
});

const remoteEmpty = () => wrap([], []);

describe('mergeSyncStates · 分组与孤儿', () => {
  it('分组被墓碑 → 引用它的任务改绑 default', () => {
    const groups = [group({ id: 'g1', deleted: true, updatedAt: NOW })];
    const todos = [todo({ id: 't1', groupId: 'g1' })];
    const out = mergeSyncStates(wrap(todos, groups), wrap([], []), NOW);
    expect(out.todos[0].groupId).toBe('default');
    expect(out.todos[0].deleted).toBeUndefined(); // 改绑不盖章不删除
  });

  it('分组完全不存在（远端删过、墓碑已清）→ 改绑 default', () => {
    const todos = [todo({ id: 't1', groupId: 'ghost' })];
    const out = mergeSyncStates(wrap(todos, []), wrap([], []), NOW);
    expect(out.todos[0].groupId).toBe('default');
  });

  it('可见分组保持引用', () => {
    const groups = [group({ id: 'g1' })];
    const todos = [todo({ id: 't1', groupId: 'g1' })];
    const out = mergeSyncStates(wrap(todos, groups), wrap([], []), NOW);
    expect(out.todos[0].groupId).toBe('g1');
  });

  it('groupId 为 default / 缺省 → 不动', () => {
    const todos = [todo({ id: 't1', groupId: 'default' }), todo({ id: 't2' })];
    const out = mergeSyncStates(wrap(todos, []), wrap([], []), NOW);
    expect(out.todos[0].groupId).toBe('default');
    expect(out.todos[1].groupId).toBeUndefined();
  });

  it('已墓碑任务不参与孤儿改绑（保持墓碑原样）', () => {
    const todos = [todo({ id: 't1', groupId: 'ghost', deleted: true, updatedAt: NOW })];
    const out = mergeSyncStates(wrap(todos, []), wrap([], []), NOW);
    expect(out.todos[0].groupId).toBe('ghost');
    expect(out.todos[0].deleted).toBe(true);
  });

  it('分组按 createdAt 排序（两端收敛）', () => {
    const g1 = group({ id: 'g1', createdAt: 100 });
    const g2 = group({ id: 'g2', createdAt: 50 });
    const ab = mergeSyncStates(wrap([], [g1, g2]), wrap([], []), NOW);
    const ba = mergeSyncStates(wrap([], []), wrap([], [g2, g1]), NOW);
    expect(ab.groups.map((g) => g.id)).toEqual(['g2', 'g1']);
    expect(ba.groups.map((g) => g.id)).toEqual(['g2', 'g1']);
  });
});

describe('mergeSyncStates · 顺序与对称性', () => {
  it('todos 按 order 排序（含墓碑穿插，可见顺序不受影响）', () => {
    const a = todo({ id: 't1', order: 5 });
    const b = todo({ id: 't2', order: 1 });
    const t = todo({ id: 't3', order: 3, deleted: true, updatedAt: NOW });
    const out = mergeSyncStates(wrap([a, t, b], []), wrap([], []), NOW);
    expect(out.todos.map((x) => x.id)).toEqual(['t2', 't3', 't1']);
  });

  it('双向对称：merge(A,B) 与 merge(B,A) 深度相等（双机收敛）', () => {
    const A = wrap(
      [
        todo({ id: 't1', title: 'A版', updatedAt: NOW, deviceId: 'dev-a', order: 0 }),
        todo({ id: 't2', deleted: true, updatedAt: NOW - 5000, deviceId: 'dev-a', order: 1 }),
        todo({ id: 't3', order: 2 })
      ],
      [group({ id: 'g1', name: 'A组', updatedAt: NOW - 100, deviceId: 'dev-a' })]
    );
    const B = wrap(
      [
        todo({ id: 't1', title: 'B版', updatedAt: NOW, deviceId: 'dev-b', order: 0 }),
        todo({ id: 't4', order: 3, deviceId: 'dev-b' }),
        todo({ id: 't3', title: 'B改', updatedAt: NOW, deviceId: 'dev-b', order: 2 })
      ],
      [group({ id: 'g1', name: 'B组', updatedAt: NOW - 100, deviceId: 'dev-b' }), group({ id: 'g2', deviceId: 'dev-b', createdAt: NOW - 50 })]
    );
    const ab = mergeSyncStates(A, B, NOW);
    const ba = mergeSyncStates(B, A, NOW);
    expect(ab).toEqual(ba);
    expect(ab.todos.map((t) => t.id)).toEqual(['t1', 't2', 't3', 't4']);
    expect(ab.todos.find((t) => t.id === 't1')!.title).toBe('B版');
    expect(ab.todos.find((t) => t.id === 't3')!.title).toBe('B改');
    expect(ab.todos.find((t) => t.id === 't3')!.groupId).toBeUndefined(); // t3 无分组引用
    expect(ab.groups.map((g) => g.id)).toEqual(['g1', 'g2']); // createdAt 升序
    expect(ab.groups.find((g) => g.id === 'g1')!.name).toBe('B组'); // 同戳 deviceId 定序
  });

  it('孤儿改绑与排序叠加后仍对称', () => {
    const A = wrap([todo({ id: 't1', groupId: 'gone', deviceId: 'dev-a', updatedAt: NOW })], []);
    const B = wrap([], [group({ id: 'gone', deleted: true, updatedAt: NOW, deviceId: 'dev-b' })]);
    expect(mergeSyncStates(A, B, NOW)).toEqual(mergeSyncStates(B, A, NOW));
  });
});

describe('parseSyncFile', () => {
  it('合法文件解析', () => {
    const text = JSON.stringify({ version: 1, todos: [], groups: [] });
    expect(parseSyncFile(text)).toEqual({ version: 1, todos: [], groups: [] });
  });

  it('非 JSON → null', () => {
    expect(parseSyncFile('garbage')).toBeNull();
  });

  it('缺 todos/groups → null', () => {
    expect(parseSyncFile('{"version":1}')).toBeNull();
  });

  it('版本不符 → null', () => {
    expect(parseSyncFile('{"version":2,"todos":[],"groups":[]}')).toBeNull();
  });
});
