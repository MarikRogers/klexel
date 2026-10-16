export const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICON = {
  // Radiergummi: schräger Block, Gummiteil gefüllt
  eraser: svg('<g transform="rotate(-45 12 12)"><rect x="3" y="8" width="18" height="8" rx="2"/><rect x="11" y="8" width="10" height="8" rx="2" fill="currentColor" fill-opacity=".4"/></g>'),
  // Farbeimer: gekippter Eimer mit Farbtropfen
  fill: svg('<path d="M4.5 12 11 5.5l7 7-5.6 5.6a2 2 0 0 1-2.8 0L4.5 14.8a2 2 0 0 1 0-2.8z"/><path d="M5 12h12.5"/><path d="M20.5 15.5c1 1.4 1.5 2.3 1.5 3a1.5 1.5 0 0 1-3 0c0-.7.5-1.6 1.5-3z" fill="currentColor"/>'),
  // Pipette: Gummihütchen oben rechts, Spitze unten links
  picker: svg('<path d="M15.5 3.5a2.1 2.1 0 0 1 3 0l1 1a2.1 2.1 0 0 1 0 3l-2 2-4-4z"/><path d="m13.5 7.5 3 3-8 8h-3v-3z"/><path d="m5.5 18.5-1.5 1.5"/>'),
  // Ebenen: drei gestapelte Rauten
  layers: svg('<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 16 9 5 9-5"/>'),
  eye: svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M4 4l16 16"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  unlock: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>'),
  add: svg('<path d="M12 5v14M5 12h14"/>'),
  // Duplizieren: zwei überlappende Rechtecke
  duplicate: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
  // Nach unten zusammenführen: zwei Pfeile treffen sich
  mergeDown: svg('<path d="M12 3v9"/><path d="m8 8 4 4 4-4"/><path d="M4 21h16"/><path d="M12 12v6"/>'),
  trash: svg('<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>'),
  up: svg('<path d="M12 19V5"/><path d="m6 11 6-6 6 6"/>'),
  down: svg('<path d="M12 5v14"/><path d="m6 13 6 6 6-6"/>'),
  // Frames: Filmstreifen mit Lochrand
  frames: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 5v14M16 5v14"/><path d="M3 9.5h5M3 14.5h5M16 9.5h5M16 14.5h5"/>'),
  addFrame: svg('<rect x="3" y="6" width="14" height="12" rx="2"/><path d="M20 9v6M17 12h6"/>'),
  duplicateFrame: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/><path d="M14 11v6M11 14h6"/>'),
  left: svg('<path d="M19 12H5"/><path d="m11 6-6 6 6 6"/>'),
  right: svg('<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>'),
  play: svg('<path d="M7 4.5v15l12-7.5z"/>'),
  stop: svg('<rect x="6" y="6" width="12" height="12" rx="1.5"/>'),
  // Auswahl: gestricheltes Rechteck
  select: svg('<rect x="4" y="5" width="16" height="14" rx="1" stroke-dasharray="3 2.5"/>'),
  // Alles auswählen: Rahmen mit gefülltem Kern
  selAll: svg('<rect x="4" y="5" width="16" height="14" rx="1" stroke-dasharray="3 2.5"/><rect x="8" y="9" width="8" height="6" fill="currentColor" fill-opacity=".4"/>'),
  // Aufheben: Rahmen mit Kreuz
  deselect: svg('<rect x="4" y="5" width="16" height="14" rx="1" stroke-dasharray="3 2.5"/><path d="m9 9.5 6 5M15 9.5l-6 5"/>'),
  copy: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
  // Ausschneiden: Schere
  cut: svg('<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m7.8 16.2 10-12.7M16.2 16.2l-10-12.7"/>'),
  // Einfügen: Klemmbrett
  paste: svg('<rect x="5" y="5" width="14" height="16" rx="2"/><rect x="9" y="3" width="6" height="4" rx="1"/>'),
  flipH: svg('<path d="M12 4v16" stroke-dasharray="2 2"/><path d="M9 7 3 17h6z"/><path d="m15 7 6 10h-6z" fill="currentColor" fill-opacity=".4"/>'),
  flipV: svg('<path d="M4 12h16" stroke-dasharray="2 2"/><path d="M7 9 17 3v6z" transform="rotate(0)"/><path d="m7 15 10 6v-6z" fill="currentColor" fill-opacity=".4"/>'),
  rotate: svg('<path d="M20 12a8 8 0 1 1-2.5-5.8"/><path d="M20 4v5h-5"/>'),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  // Onion Skin: zwei versetzte Kreise
  onion: svg('<circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6" stroke-dasharray="2 2"/>'),
};
