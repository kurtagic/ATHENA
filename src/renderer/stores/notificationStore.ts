import { create } from 'zustand';

interface Notification {
  id: number;
  text: string;
  senderName: string;
  senderRole?: 'owner' | 'officer';
  targetKind?: 'everyone' | 'officers' | 'crew';
  targetLabel?: string; // e.g. "Everyone", "Officers", crew name
}

interface NotificationState {
  notifications: Notification[];
  showNotification: (text: string, senderName: string, opts?: {
    targetKind?: 'everyone' | 'officers' | 'crew';
    targetLabel?: string;
    senderRole?: 'owner' | 'officer';
  }) => void;
  removeNotification: (id: number) => void;
}

let notificationId = 0;

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  showNotification: (text, senderName, opts) => {
    const id = ++notificationId;
    set({ notifications: [...get().notifications, {
      id, text, senderName,
      targetKind: opts?.targetKind,
      targetLabel: opts?.targetLabel,
      senderRole: opts?.senderRole,
    }] });
    setTimeout(() => {
      get().removeNotification(id);
    }, 3000);
  },
  removeNotification: (id) => {
    set({ notifications: get().notifications.filter((n) => n.id !== id) });
  },
}));
