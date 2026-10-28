// Einhängbarer Bereich Klexel samt Styles. Wird nur über klexelDescriptor.load() dynamisch geladen,
// damit Editor und Styles ein eigener Chunk bleiben (und in Builds ohne Klexel ganz fehlen).
import './style.css';
import type { Area } from '@suite/shared';
import { mountKlexel } from './klexel';
import type { SavedState } from './storage/state';
import { AREA_MARKER } from './marker';

export const klexelArea: Area<SavedState> & { marker: string } = { kind: 'klexel', title: 'Klexel', marker: AREA_MARKER, mount: mountKlexel };
