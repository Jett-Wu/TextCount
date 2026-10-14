/**
 * Entry point.
 *
 * Deliberately small: the theme is applied (the inline bootstrap in `index.html` already did it
 * before first paint, this covers the case where the module loads first), then the app renders.
 */
import { render } from 'preact';
import { applyTheme } from './app/appState';
import { App } from './ui/App';
import './styles/index.css';

applyTheme();

const container = document.getElementById('app');
if (container !== null) {
  render(<App />, container);
}
