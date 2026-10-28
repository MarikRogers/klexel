import { describe, it, expect } from 'vitest';
import { PixelDocument } from '../model/Document';
import { docHasContent } from './hasContent';

describe('docHasContent', () => {
  it('leeres Dokument: false', () => {
    expect(docHasContent(new PixelDocument(4, 4))).toBe(false);
  });
  it('ein deckendes Pixel: true', () => {
    const doc = new PixelDocument(4, 4);
    doc.set(1, 1, 0xff0000ff);
    expect(docHasContent(doc)).toBe(true);
  });
  it('Pixel nur in einem zweiten Frame: true', () => {
    const doc = new PixelDocument(4, 4);
    const f = doc.createFrame();
    doc.insertFrame(f, 1);
    doc.setCurrentFrame(f.id);
    doc.set(2, 2, 0x00ff00ff);
    doc.setCurrentFrame(doc.frames[0].id);
    expect(docHasContent(doc)).toBe(true);
  });
  it('Inhalt in einer versteckten Ebene zählt mit', () => {
    const doc = new PixelDocument(4, 4);
    doc.set(1, 1, 0xff0000ff);
    doc.setLayerProps(doc.layers[0].id, { visible: false });
    expect(docHasContent(doc)).toBe(true);
  });
  it('Inhalt in einer Ebene mit Deckkraft 0 zählt mit', () => {
    const doc = new PixelDocument(4, 4);
    doc.set(1, 1, 0xff0000ff);
    doc.setLayerProps(doc.layers[0].id, { opacity: 0 });
    expect(docHasContent(doc)).toBe(true);
  });
  it('nur vollständig transparente Pixel: false', () => {
    const doc = new PixelDocument(4, 4);
    doc.set(0, 0, 0x12345600);
    expect(docHasContent(doc)).toBe(false);
  });
});
