import type { DashLayout, SettingValue, WidgetSize } from '../../app/dashboardLayout';

export interface WidgetProps {
  /** Pengaturan widget yang sudah digabung dengan nilai bawaan */
  settings: Record<string, SettingValue>;
  size: WidgetSize;
  layout: DashLayout;
}

export type SettingDef =
  | { key: string; label: string; type: 'choice'; options: { value: string; label: string }[]; def: string }
  | { key: string; label: string; type: 'toggle'; def: boolean };
