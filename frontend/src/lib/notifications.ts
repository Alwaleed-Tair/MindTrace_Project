import { fill } from './format';
import type { Strings } from './i18n';
import type { NotificationItem } from './types';

/** The sentence shown for a notification, in the current language. */
export function notificationText(n: NotificationItem, t: Strings): string {
  const values = { actor: n.actor?.name ?? '?', experiment: n.experiment?.title ?? '' };
  switch (n.kind) {
    case 'note_added':
      return fill(t.noteAddedBy, values);
    case 'note_updated':
      return fill(t.noteUpdatedBy, values);
    case 'collaborator_added':
      return fill(t.collaboratorAddedBy, values);
    case 'status_changed':
      return fill(t.statusChangedBy, values);
    default:
      return n.message;
  }
}
