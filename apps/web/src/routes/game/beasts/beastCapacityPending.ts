export function beastCapacityPendingKey(ownerId: string) {
  return `beast-capacity-pending:v1:${ownerId}`;
}

export function hasPendingBeastCapacityExpansion(ownerId: string) {
  try {
    return sessionStorage.getItem(beastCapacityPendingKey(ownerId)) !== null;
  } catch {
    return false;
  }
}
