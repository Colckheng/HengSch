export const TYPE_OPTIONS = [
  { value: 'once', label: '一次性待办事项' },
  { value: 'recurring', label: '循环待办事项' }
];

export const CYCLE_OPTIONS = [
  { value: 'daily', label: '每天' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
  { value: 'custom', label: '自定义' }
];

/** 提前量（ms）。'' = 自定义走单独输入 */
export const LEAD_OPTIONS = [
  { value: '0', label: '到点提醒' },
  { value: '300000', label: '提前 5 分钟' },
  { value: '600000', label: '提前 10 分钟' },
  { value: '900000', label: '提前 15 分钟' },
  { value: '1800000', label: '提前 30 分钟' },
  { value: '3600000', label: '提前 1 小时' },
  { value: 'custom', label: '自定义…' }
];
