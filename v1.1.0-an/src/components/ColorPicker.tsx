import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { DEFAULT_GROUP_COLORS } from '../context/GroupContext';

interface ColorPickerProps {
  selectedColor: string;
  onColorSelect: (color: string) => void;
}

export function ColorPicker({ selectedColor, onColorSelect }: ColorPickerProps): React.ReactElement {
  return (
    <View style={styles.container}>
      <View style={styles.grid}>
        {DEFAULT_GROUP_COLORS.map((color) => (
          <TouchableOpacity
            key={color}
            style={[
              styles.option,
              { backgroundColor: color },
              selectedColor === color && styles.optionSelected,
            ]}
            onPress={() => onColorSelect(color)}
          >
            {selectedColor === color && <Text style={styles.check}>✓</Text>}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginVertical: 12 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  option: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionSelected: {
    borderWidth: 3,
    borderColor: '#333',
  },
  check: {
    color: '#333',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
