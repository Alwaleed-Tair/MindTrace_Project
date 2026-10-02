/** Opening a note from another page (Hypotheses, Recordings): remember which note to show, then the experiment page scrolls to it.
 *  A `?note=` in the address works too, so the link can be shared. */
let pending: number | null = null;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const noteHref = (experimentId: string, _noteId: number) => `/experiments/${encodeURIComponent(experimentId)}`;

export function rememberNote(noteId: number) {
  pending = noteId;
}

export function takePendingNote(): number | null {
  const fromUrl = Number(new URLSearchParams(window.location.search).get('note') ?? (window.location.hash.split('?')[1] ? new URLSearchParams(window.location.hash.split('?')[1]).get('note') : ''));
  const id = pending ?? (Number.isFinite(fromUrl) && fromUrl > 0 ? fromUrl : null);
  pending = null;
  return id;
}
