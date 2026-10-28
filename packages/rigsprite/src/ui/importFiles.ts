import { errorMessage } from '../core/messages';
import { useEditor } from '../state/store';
import { loadImageFile } from './loadImageFile';

/** Loads all files; valid images are added to the project, failures are returned as messages. */
export async function importFiles(files: File[]): Promise<string[]> {
  const results = await Promise.allSettled(files.map((f) => loadImageFile(f)));
  const images = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  const errors = results.flatMap((r) =>
    r.status === 'rejected' ? [errorMessage(r.reason)] : [],
  );
  if (images.length > 0) useEditor.getState().addImages(images);
  return errors;
}
