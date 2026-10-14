import { render } from 'preact';
import { applyTheme } from './app/state';
import { App } from './ui/App';
import './styles/tokens.css';
import './styles/app.css';

applyTheme();

const container = document.getElementById('app');
if (container !== null) render(<App />, container);
