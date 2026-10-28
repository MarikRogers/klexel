import { expect, test } from 'vitest';
import { errorMessage, unsupportedImage } from './messages';

test('errorMessage returns the message of an Error and stringifies anything else', () => {
  expect(errorMessage(new Error('boom'))).toBe('boom');
  expect(errorMessage('plain')).toBe('plain');
  expect(errorMessage(42)).toBe('42');
  expect(errorMessage(undefined)).toBe('undefined');
});

test('unsupportedImage names the file', () => {
  expect(unsupportedImage('a.txt')).toBe('a.txt ist kein unterstütztes Bild');
});
