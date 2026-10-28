// Kleine Browser-Helfer (DOM), die Hülle und Bereiche gemeinsam nutzen. Bewusst nicht im Haupt-Einstieg
// '@suite/shared', damit dieser DOM-frei bleibt.
export { showToast } from './toast';
export { saveBlob } from './saveBlob';
export { pixelsToDataUrl, pixelsToRgba, rgbaToDataUrl } from './pixelsToDataUrl';
