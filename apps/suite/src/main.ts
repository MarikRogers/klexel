// Einstieg: lädt die Beschreibungen der Bereiche dieses Builds und startet die Hülle (Workspace mit Projektliste).
// Styles eines Bereichs kommen mit dessen load(), damit ein Build ohne den Bereich auch dessen Styles nicht enthält.
import { loadDescriptors } from './areas';
import { startShell } from './shell/shell';

void loadDescriptors()
  .then(descriptors => startShell(document.getElementById('app')!, descriptors))
  .catch(err => console.error('Start fehlgeschlagen', err));
navigator.storage?.persist?.();
if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('./sw.js');
