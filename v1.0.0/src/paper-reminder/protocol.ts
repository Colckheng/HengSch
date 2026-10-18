export interface ReminderPaper {
  todoId: string;
  title: string;
  description?: string;
  remindAt: number;
  color?: string;
  group?: string;
}
export interface ReminderCommand {
  todoId: string;
  remindAt: number;
  action: 'complete' | 'snooze' | 'dismiss';
  snoozeAt?: number;
}
export interface HitRegion { x: number; y: number; width: number; height: number }
export interface ReminderBridge {
  ready(): Promise<ReminderPaper[]>;
  onPapers(callback: (papers: ReminderPaper[]) => void): () => void;
  action(command: ReminderCommand): Promise<void>;
  resolved(todoId: string, remindAt: number): Promise<void>;
  hitRegions(regions: HitRegion[], captured: boolean): void;
}
