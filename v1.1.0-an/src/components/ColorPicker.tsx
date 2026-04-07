import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DEFAULT_GROUP_COLORS } from '../context/GroupContext';

interface ColorPickerProps {
  selectedColor: string;
  onColorSelect: (color: string) => void;
}

export function ColorPicker({
  selectedColor,
  onColorSelect
}: ColorPickerProps): React.ReactElement {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>颜色板</Text>
      <View style={styles.grid}>
        {DEFAULT_GROUP_COLORS.map((color) => {
          const isActive = selectedColor === color;

          return (
            <Pressable
              key={color}
              style={[
                styles.option,
                { backgroundColor: color },
                isActive && styles.optionSelected
              ]}
              onPress={() => onColorSelect(color)}
            >
              <Text style={[styles.optionText, isActive && styles.optionTextSelected]}>
                {isActive ? '选中' : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7d7467'
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  option: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(47, 36, 25, 0.08)'
  },
  optionSelected: {
    borderWidth: 3,
    borderColor: '#2f2419'
  },
  optionText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2f2419'
  },
  optionTextSelected: {
    color: '#2f2419'
  }
});
