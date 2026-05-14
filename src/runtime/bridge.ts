/**
 * Small runtime bridge to avoid circular imports between App and Settings.
 * App registers handlers here once connected; Settings consumes them.
 */

type SwitchInputHandler = (deviceId: string) => Promise<void>;
type ReportNameTakenHandler = () => void;

let _switchInput: SwitchInputHandler | null = null;
let _reportNameTaken: ReportNameTakenHandler | null = null;

export function setSwitchInputHandler(handler: SwitchInputHandler | null): void {
  _switchInput = handler;
}

export function getSwitchInputHandler(): SwitchInputHandler | null {
  return _switchInput;
}

export function setReportNameTakenHandler(handler: ReportNameTakenHandler | null): void {
  _reportNameTaken = handler;
}

export function getReportNameTakenHandler(): ReportNameTakenHandler | null {
  return _reportNameTaken;
}
