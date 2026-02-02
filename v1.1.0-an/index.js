import { Platform } from 'react-native';
import { registerRootComponent } from 'expo';
import App from './App';

if (Platform.OS === 'web') {
  const style = document.createElement('style');
  style.textContent = `
    html, body { height: 100%; margin: 0; }
    #root { display: flex; min-height: 100%; }
  `;
  document.head.appendChild(style);
}

registerRootComponent(App);
