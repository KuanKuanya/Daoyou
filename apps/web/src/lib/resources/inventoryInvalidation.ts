import { resourceStore } from '@app/lib/resources/store';
import { useEffect } from 'react';

/** Storage pages share the inventory signal but keep their paginated HTTP reads. */
export function useInventoryInvalidation(
  owner: string | undefined,
  onInvalidate: () => void,
) {
  useEffect(() => {
    if (!owner) return;
    const unsubscribeChanges = resourceStore.subscribeChanges((change) => {
      if (
        change.resourceTopic === 'inventory.bag' &&
        change.scope.kind === 'cultivator' &&
        change.scope.id === owner
      )
        onInvalidate();
    });
    const unsubscribeStale = resourceStore.subscribeScopeStale(
      { kind: 'cultivator', id: owner },
      onInvalidate,
    );
    return () => {
      unsubscribeChanges();
      unsubscribeStale();
    };
  }, [owner, onInvalidate]);
}
