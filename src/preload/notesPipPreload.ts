import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('notesPipBridge', {
  onTextChange: (text: string) => ipcRenderer.send('notes-pip-text-change', text),
});
