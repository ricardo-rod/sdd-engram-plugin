import type { TuiDialogAlertProps, TuiDialogConfirmProps, TuiDialogPromptProps, TuiDialogSelectProps, TuiPluginApi } from "@opencode-ai/plugin/tui";

type DialogApi = Pick<TuiPluginApi, "ui">;
export function showSelect<Value>(api: DialogApi, props: TuiDialogSelectProps<Value>, onClose?: () => void): void {
  api.ui.dialog.replace(() => api.ui.DialogSelect(props), onClose);
}
export function showPrompt(api: DialogApi, props: TuiDialogPromptProps): void {
  api.ui.dialog.replace(() => api.ui.DialogPrompt(props));
}
export function showConfirm(api: DialogApi, props: TuiDialogConfirmProps): void {
  api.ui.dialog.replace(() => api.ui.DialogConfirm(props));
}
export function showAlert(api: DialogApi, props: TuiDialogAlertProps): void {
  api.ui.dialog.replace(() => api.ui.DialogAlert(props));
}

export function selectValue<Value>(api: DialogApi, props: Omit<TuiDialogSelectProps<Value>, "onSelect">): Promise<Value | undefined> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: Value | undefined) => {
      if (settled) return;
      settled = true;
      api.ui.dialog.clear();
      resolve(value);
    };
    showSelect(api, { ...props, onSelect: (option) => finish(option.value) }, () => finish(undefined));
  });
}
export function promptValue(api: DialogApi, props: Omit<TuiDialogPromptProps, "onConfirm" | "onCancel">): Promise<string | undefined> {
  return new Promise((resolve) => showPrompt(api, { ...props, onConfirm: (value) => { api.ui.dialog.clear(); resolve(value); }, onCancel: () => { api.ui.dialog.clear(); resolve(undefined); } }));
}
export function confirmValue(api: DialogApi, props: Omit<TuiDialogConfirmProps, "onConfirm" | "onCancel">): Promise<boolean> {
  return new Promise((resolve) => showConfirm(api, { ...props, onConfirm: () => { api.ui.dialog.clear(); resolve(true); }, onCancel: () => { api.ui.dialog.clear(); resolve(false); } }));
}
