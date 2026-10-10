import type {
  SectFacilityState,
  SectMapHotspot,
  SectPermissionState,
} from '@daoyou/game-rules/sect-organization';

export type SectMapMode = 'member' | 'visitor';

export interface SectMapHotspotState {
  facility?: SectFacilityState;
  locked: boolean;
  selectable: boolean;
  reason?: string;
  restrictionLabel?: string;
}

export function resolveSectMapHotspotState(
  spot: SectMapHotspot,
  mode: SectMapMode,
  facilities: ReadonlyMap<string, SectFacilityState>,
  permissions?: Readonly<Record<string, SectPermissionState>>,
): SectMapHotspotState {
  if (mode === 'visitor') {
    const selectable = Boolean(spot.visitor);
    return {
      locked: !selectable,
      selectable,
      restrictionLabel: selectable ? undefined : '访客止步',
      reason:
        spot.visitor?.description ?? '外宗重地只可远观，访客不得越过禁制。',
    };
  }

  const facility = spot.facility ? facilities.get(spot.facility) : undefined;
  const access = spot.permission ? permissions?.[spot.permission] : undefined;
  const unavailable = spot.locked || !spot.route;
  const locked = unavailable || access?.granted === false;

  return {
    facility,
    locked,
    selectable: true,
    reason: unavailable
      ? (spot.note ?? '该设施当前尚未开放。')
      : access?.granted === false
        ? (access.reason ?? '当前弟子身份尚未获得此设施权限。')
        : undefined,
    restrictionLabel: unavailable
      ? '未开放'
      : access?.granted === false
        ? '身份受限'
        : undefined,
  };
}
