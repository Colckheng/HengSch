import * as Notifications from 'expo-notifications';
import type { Todo } from '@hengsch/shared-types';
import { buildReminderSchedule } from '../../shared/shared-logic';

export const REMINDER_CHANNEL_ID = 'reminders';

export type PermissionState = 'granted' | 'denied' | 'undetermined';

export interface RescheduleResult {
  ok: boolean;
  scheduled: number;
  error?: string;
}

/** 权限现状，不发起请求 */
export async function getPermissionState(): Promise<PermissionState> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return 'granted';
  if (current.canAskAgain) return 'undetermined';
  return 'denied';
}

/** 由用户手势触发；拒绝后不再反复弹系统框 */
export async function requestPermission(): Promise<PermissionState> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return 'granted';
  if (!current.canAskAgain) return 'denied';
  const next = await Notifications.requestPermissionsAsync();
  return next.granted ? 'granted' : 'denied';
}

export async function ensureChannel(): Promise<void> {
  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
    name: '待办提醒',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#E1352B',
    sound: 'default'
  });
}

/**
 * 重排全部通知：先算排程，算不出来直接返回错误、不动已排通知；
 * 只有拿到有效排程才取消旧通知并逐条写入。
 */
export async function rescheduleAll(todos: Todo[]): Promise<RescheduleResult> {
  let plan: ReturnType<typeof buildReminderSchedule>;
  try {
    plan = buildReminderSchedule(todos, Date.now());
  } catch (error) {
    return { ok: false, scheduled: 0, error: error instanceof Error ? error.message : '提醒排程计算失败' };
  }

  try {
    await ensureChannel();
    await Notifications.cancelAllScheduledNotificationsAsync();
    for (const item of plan) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '待办提醒',
          body: item.title,
          data: { todoId: item.todoId },
          sound: 'default'
        },
        trigger: { date: new Date(item.at), channelId: REMINDER_CHANNEL_ID }
      });
    }
    return { ok: true, scheduled: plan.length };
  } catch (error) {
    return {
      ok: false,
      scheduled: 0,
      error: error instanceof Error ? error.message : '提醒排程写入失败'
    };
  }
}

export async function cancelAll(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/** 5 秒后一条测试通知，供设置页与真机验收使用 */
export async function scheduleTestNotification(): Promise<void> {
  await ensureChannel();
  await Notifications.scheduleNotificationAsync({
    content: { title: '待办提醒', body: '测试提醒：5 秒后应看到本通知', sound: 'default' },
    trigger: { seconds: 5, channelId: REMINDER_CHANNEL_ID }
  });
}

/** 当前已排通知数量，用于设置页展示与验收 */
export async function scheduledCount(): Promise<number> {
  const list = await Notifications.getAllScheduledNotificationsAsync();
  return list.length;
}
