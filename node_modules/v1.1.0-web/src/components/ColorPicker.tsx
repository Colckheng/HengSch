import { DEFAULT_GROUP_COLORS } from '../context/GroupContext';

interface ColorPickerProps {
  selectedColor: string;
  onColorSelect: (color: string) => void;
}

export function ColorPicker({ selectedColor, onColorSelect }: ColorPickerProps): JSX.Element {
  return (
    <div className="color-picker">
      <div className="color-picker-grid">
        {DEFAULT_GROUP_COLORS.map((color) => (
          <button
            key={color}
            className={`color-option ${selectedColor === color ? 'selected' : ''}`}
            style={{ backgroundColor: color }}
            onClick={() => onColorSelect(color)}
            aria-label={`选择颜色 ${color}`}
            title={color}
          >
            {selectedColor === color && <span className="color-check">✓</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
