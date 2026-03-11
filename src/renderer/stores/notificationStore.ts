import { create } from 'zustand';

interface Notification {
  id: number;
  text: string;
  senderName: string;
}

interface NotificationState {
  notifications: Notification[];
  showNotification: (text: string, senderName: string) => void;
  removeNotification: (id: number) => void;
}

let notificationId = 0;

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  showNotification: (text, senderName) => {
    const id = ++notificationId;
    set({ notifications: [...get().notifications, { id, text, senderName }] });
    setTimeout(() => {
      get().removeNotification(id);
    }, 3000);
  },
  removeNotification: (id) => {
    set({ notifications: get().notifications.filter((n) => n.id !== id) });
  },
}));
