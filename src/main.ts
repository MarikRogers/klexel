// Einstieg: startet die Hülle (Workspace mit Projektliste), die Klexel in #app einhängt.
import './style.css';
import { startShell } from './shell/shell';

void startShell(document.getElementById('app')!).catch(err => console.error('Start fehlgeschlagen', err));
navigator.storage?.persist?.();
if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('./sw.js');
