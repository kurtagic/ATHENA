import { execFile } from 'node:child_process';

// Inline C# that uses Windows Core Audio COM APIs to mute/unmute other app sessions
const CSHARP_CODE = `
using System;
using System.Runtime.InteropServices;
using System.Collections.Generic;

[Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
class MMDeviceEnumerator { }

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(int dataFlow, int stateMask, out IMMDeviceCollection devices);
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
}

[Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceCollection {
    int GetCount(out int count);
    int Item(int index, out IMMDevice device);
}

[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
    int Activate([MarshalAs(UnmanagedType.LPStruct)] Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object instance);
}

[Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionManager2 {
    int NotImpl1();
    int NotImpl2();
    int GetSessionEnumerator(out IAudioSessionEnumerator enumerator);
}

[Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionEnumerator {
    int GetCount(out int count);
    int GetSession(int index, out IAudioSessionControl session);
}

[Guid("F4B1A599-7266-4319-A8CA-E70ACB11E8CD"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionControl {
    // We only need QueryInterface to get IAudioSessionControl2
}

[Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionControl2 {
    int NotImpl1(); // QueryInterface handled by COM
    int NotImpl2();
    int NotImpl3();
    int NotImpl4();
    int NotImpl5();
    int NotImpl6();
    int NotImpl7();
    int NotImpl8();
    int NotImpl9();
    int NotImpl10();
    int NotImpl11();
    int NotImpl12();
    int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
    int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
    int GetProcessId(out uint pid);
    int IsSystemSoundsSession();
}

[Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ISimpleAudioVolume {
    int SetMasterVolume(float level, ref Guid eventContext);
    int GetMasterVolume(out float level);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid eventContext);
    int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
}

public class AudioController {
    private static Guid IID_IAudioSessionManager2 = new Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F");
    private static Guid IID_ISimpleAudioVolume = new Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8");
    private static Guid Empty = Guid.Empty;

    public static string SetMuteOthers(bool mute, uint excludePid) {
        var results = new List<string>();
        try {
            var enumeratorType = Type.GetTypeFromCLSID(new Guid("BCDE0395-E52F-467C-8E3D-C4579291692E"));
            var enumerator = (IMMDeviceEnumerator)Activator.CreateInstance(enumeratorType);
            IMMDevice device;
            enumerator.GetDefaultAudioEndpoint(0, 1, out device);
            object o;
            device.Activate(IID_IAudioSessionManager2, 0x17, IntPtr.Zero, out o);
            var mgr = (IAudioSessionManager2)o;
            IAudioSessionEnumerator sessionEnum;
            mgr.GetSessionEnumerator(out sessionEnum);
            int count;
            sessionEnum.GetCount(out count);
            for (int i = 0; i < count; i++) {
                IAudioSessionControl ctl;
                sessionEnum.GetSession(i, out ctl);
                var ctl2 = (IAudioSessionControl2)ctl;
                uint pid;
                ctl2.GetProcessId(out pid);
                if (pid == 0 || pid == excludePid) continue;
                try {
                    var vol = (ISimpleAudioVolume)ctl;
                    vol.SetMute(mute, ref Empty);
                    results.Add(pid.ToString());
                } catch { }
            }
        } catch (Exception ex) {
            return "ERROR:" + ex.Message;
        }
        return string.Join(",", results);
    }
}
`;

const PS_ADD_TYPE = `
Add-Type -TypeDefinition @'
${CSHARP_CODE}
'@
`;

function buildScript(mute: boolean, excludePid: number): string {
  return `${PS_ADD_TYPE}
[AudioController]::SetMuteOthers($${mute}, ${excludePid})`;
}

let mutedPids: number[] = [];

export function muteOtherApps(excludePid: number): void {
  const script = buildScript(true, excludePid);
  execFile(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { timeout: 5000 },
    (err, stdout) => {
      if (err) {
        console.error('[audioSilencer] mute error:', err.message);
        return;
      }
      const result = stdout.trim();
      if (result.startsWith('ERROR:')) {
        console.error('[audioSilencer]', result);
        return;
      }
      if (result) {
        mutedPids = result.split(',').map(Number).filter(Boolean);
      }
    }
  );
}

export function unmuteOtherApps(): void {
  if (mutedPids.length === 0) return;
  const script = buildScript(false, 0);
  execFile(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { timeout: 5000 },
    (err) => {
      if (err) {
        console.error('[audioSilencer] unmute error:', err.message);
      }
      mutedPids = [];
    }
  );
}
