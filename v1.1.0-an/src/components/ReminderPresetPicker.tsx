import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { ReminderPreset } from '../utils/reminderPresets';
import { REMINDER_PRESETS, formatReminderAt, resolveReminderPreset } from '../utils/reminderPresets';

interface ReminderPresetPickerProps {
  value: ReminderPreset;
  onChange: (next: ReminderPreset) => void;
  /** 编辑时回显：当前已有提醒时间 */
  currentAt?: number;
}

/** 到点提醒选择：与 Add/Edit 的其它选项同款 Swiss 直角发丝线样式 */
export function ReminderPresetPicker({ value, onChange, currentAt }: ReminderPresetPickerProps): React.ReactElement {
  const selected = resolveReminderPreset(value);
  const shownAt = value === 'keep' ? currentAt : selected;

  return (
    <View style={styles.field}>
      <Text style={styles.label}>到点提醒</Text>
      <View style={styles.row}>
        {value === 'keep' && typeof currentAt === 'number' ? (
          <View style={[styles.option, styles.optionActive]}>
            <Text style={[styles.optionText, styles.optionTextActive]}>当前 {formatReminderAt(currentAt)}</Text>
          </View>
        ) : null}
        {REMINDER_PRESETS.map((preset) => (
          <TouchableOpacity
            key={preset.key}
            style={[styles.option, value === preset.key && styles.optionActive]}
            onPress={() => onChange(preset.key)}
          >
            <Text style={[styles.optionText, value === preset.key && styles.optionTextActive]}>
              {preset.label}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={[styles.option, value === 'none' && styles.optionActive]}
          onPress={() => onChange('none')}
        >
          <Text style={[styles.optionText, value === 'none' && styles.optionTextActive]}>清除</Text>
        </TouchableOpacity>
      </View>
      {typeof shownAt === 'number' ? (
        <Text style={styles.hint}>将在 {formatReminderAt(shownAt)} 提醒</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 22, marginTop: 4 },
  label: { fontFamily: 'monospace', fontSize: 10, letterSpacing: 2, color: '#8A8A85', marginBottom: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 0,
    borderWidth: 1.5,
    borderColor: '#111111',
    backgroundColor: '#FAFAF7'
  },
  optionActive: { backgroundColor: '#111111' },
  optionText: { fontFamily: 'monospace', fontSize: 11, letterSpacing: 1, color: '#111111' },
  optionTextActive: { color: '#FAFAF7', fontWeight: '700' },
  hint: { fontSize: 11, color: '#8A8A85', marginTop: 8 }
});
