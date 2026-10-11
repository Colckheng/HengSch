interface OdometerProps {
  value: number;
  digits?: number;
}

export function Odometer({ value, digits = 2 }: OdometerProps): JSX.Element {
  const text = String(Math.max(0, value)).padStart(digits, '0');
  const chars = text.split('');

  return (
    <span className="odo" aria-label={String(value)}>
      {chars.map((char, index) => (
        <span className="odo-digit" key={`${index}-${char}`}>
          <span>{char}</span>
        </span>
      ))}
    </span>
  );
}
