import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSync } from '../context/SyncContext';

interface SyncStatusFooterProps {
  onPress: () => void;
}

function twoDigits(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function SyncStatusFooter({ onPress }: SyncStatusFooterProps): React.ReactElement {
  const { status } = useSync();

  let label: string;
  let isError = false;
  switch (status.state) {
    case 'OFF':
      label = 'SYNC OFF — 未配置';
      break;
    case 'SYNCING':
      label = 'SYNCING…';
      break;
    case 'SYNCED': {
      const d = new Date(status.at);
      label = `SYNCED ${twoDigits(d.getHours())}:${twoDigits(d.getMinutes())}`;
      break;
    }
    case 'OFFLINE':
      label = 'OFFLINE';
      isError = true;
      break;
    case 'AUTH ERROR':
      label = 'AUTH ERROR';
      isError = true;
      break;
    case 'REMOTE ERROR':
      label = 'REMOTE ERROR';
      isError = true;
      break;
    default:
      label = status.state;
  }

  return (
    <TouchableOpacity style={styles.footer} onPress={onPress} activeOpacity={0.6}>
      <Text style={[styles.text, isError && styles.textError]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  footer: {
    backgroundColor: '#FAFAF7',
    borderTopWidth: 1.5,
    borderTopColor: '#111111',
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center'
  },
  text: {
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 1.6,
    color: '#8A8A85'
  },
  textError: {
    color: '#E1352B'
  }
});
