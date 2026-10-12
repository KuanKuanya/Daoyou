import { combatV6Request } from '@app/components/feature/combat-v6/request';
import { ItemSlot } from '@app/components/feature/items/ItemSlot';
import { InkModal } from '@app/components/layout/InkModal';
import { useInkUI } from '@app/components/providers/InkUIProvider';
import { InkButton } from '@app/components/ui/InkButton';
import { apiFetch } from '@app/lib/api/fetch';
import { consumeResourceMutation } from '@app/lib/resources/mutations';
import {
  BeastCapacityExpandSchema,
  type BeastCapacityExpandRequest,
  type BeastCapacityExpandResponse,
  type BeastCapacityPreview,
  type BeastManagementView,
} from '@daoyou/contracts/beasts';
import { materialFactsOf } from '@daoyou/game-domain/inventory';
import { useEffect, useRef, useState } from 'react';
import { beastCapacityPendingKey } from './beastCapacityPending';

const base = '/api/combat-v6/beasts/capacity';

export function BeastCapacityModal({
  ownerId,
  close,
  onUpdate,
}: {
  ownerId: string;
  close: () => void;
  onUpdate: (view: BeastManagementView) => void;
}) {
  const storageKey = beastCapacityPendingKey(ownerId);
  const [request, setRequest] = useState<
    BeastCapacityExpandRequest | undefined
  >(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      const parsed = saved
        ? BeastCapacityExpandSchema.safeParse(JSON.parse(saved))
        : null;
      return parsed?.success ? parsed.data : undefined;
    } catch {
      return undefined;
    }
  });
  const [preview, setPreview] = useState<BeastCapacityPreview>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const busy = useRef(false);
  const { pushToast } = useInkUI();
  useEffect(() => {
    const controller = new AbortController();
    void combatV6Request<BeastCapacityPreview>(base, {
      signal: controller.signal,
    })
      .then(setPreview)
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error ? reason.message : '扩容方案读取失败',
          );
      });
    return () => controller.abort();
  }, [refresh]);
  const ready =
    preview?.recipe &&
    !preview.missing.monster &&
    !preview.missing.ore &&
    preview.spiritStones >= preview.recipe.spiritStones;
  async function submit() {
    if (busy.current || (!request && !ready)) return;
    const payload = request ?? {
      requestId: crypto.randomUUID(),
      expectedCapacityLevel: preview!.capacityLevel,
      expectedCapacityRevision: preview!.capacityRevision,
      recipeVersion: preview!.recipeVersion,
      maxSpiritStones: preview!.recipe!.spiritStones,
      materials: preview!.materials.map(({ item, quantity }) => ({
        id: item.id,
        expectedRevision: item.revision,
        quantity,
      })),
    };
    setRequest(payload);
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      /* Keep the request in memory. */
    }
    busy.current = true;
    setPending(true);
    setError('');
    let rejected = false;
    try {
      const response = await apiFetch(`${base}/expand`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      rejected = response.status >= 400 && response.status < 500;
      const result =
        await consumeResourceMutation<BeastCapacityExpandResponse>(response);
      try {
        sessionStorage.removeItem(storageKey);
      } catch {
        /* Memory remains authoritative for this session. */
      }
      setRequest(undefined);
      onUpdate(result.view);
      pushToast({
        message: `灵兽袋已扩至 ${result.capacity} 格`,
        tone: 'success',
      });
      close();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : '扩容结果暂未确认，请恢复本次结果',
      );
      if (rejected) {
        try {
          sessionStorage.removeItem(storageKey);
        } catch {
          /* Clear the in-memory request below. */
        }
        setRequest(undefined);
        setPreview(undefined);
        setRefresh((value) => value + 1);
      }
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <InkModal
      isOpen
      title="灵兽袋扩容"
      onClose={() => {
        if (!busy.current) close();
      }}
      footer={
        <div className="flex justify-end gap-3">
          <InkButton disabled={pending} onClick={close}>
            关闭
          </InkButton>
          <InkButton
            variant="primary"
            pending={pending}
            disabled={!request && !ready}
            onClick={() => void submit()}
          >
            {request ? '恢复本次扩容结果' : '确认扩容'}
          </InkButton>
        </div>
      }
    >
      {error ? (
        <p role="alert" className="text-crimson mb-3 text-sm">
          {error}
        </p>
      ) : null}
      {request ? (
        <p className="text-ink-secondary text-sm leading-7">
          本次扩容结果尚未确认。恢复后会核对同一次操作，最多消耗
          <span className="font-mono"> {request.maxSpiritStones} </span>灵石。
        </p>
      ) : !preview ? (
        <p className="text-ink-secondary text-sm">正在准备扩容方案……</p>
      ) : !preview.recipe ? (
        <p className="text-sm">
          灵兽袋已扩至 <span className="font-mono">{preview.capacity}</span>{' '}
          格。
        </p>
      ) : (
        <div className="space-y-4 text-sm">
          <p>
            容量{' '}
            <span className="font-mono">
              {preview.capacity} → {preview.nextCapacity}
            </span>{' '}
            格
          </p>
          <p>
            消耗 {preview.recipe.rank}妖兽材料{' '}
            <span className="font-mono">{preview.recipe.monster}</span> 份、
            {preview.recipe.rank}矿石{' '}
            <span className="font-mono">{preview.recipe.ore}</span> 份和
            <span className="font-mono"> {preview.recipe.spiritStones} </span>
            灵石。
          </p>
          <div className="space-y-2">
            {preview.materials.map(({ item, quantity }) => (
              <div key={item.id} className="flex items-center gap-3">
                <div className="w-16 shrink-0">
                  <ItemSlot
                    item={{
                      ...item,
                      name: materialFactsOf(item.instanceData).name,
                      quantity,
                    }}
                    quantityLabel="投入"
                  />
                </div>
                <p className="text-ink-secondary text-xs">
                  来自{item.location === 'bag' ? '背包' : '储藏室'}， 消耗{' '}
                  <span className="font-mono">{quantity}</span> 份
                </p>
              </div>
            ))}
          </div>
          {preview.missing.monster || preview.missing.ore ? (
            <p className="text-crimson">
              还缺
              {preview.missing.monster
                ? ` ${preview.missing.monster} 份${preview.recipe.rank}妖兽材料`
                : ''}
              {preview.missing.ore
                ? ` ${preview.missing.ore} 份${preview.recipe.rank}矿石`
                : ''}
              。
            </p>
          ) : null}
          {preview.spiritStones < preview.recipe.spiritStones ? (
            <p className="text-crimson">
              灵石不足，持有
              <span className="font-mono"> {preview.spiritStones}</span>。
            </p>
          ) : null}
          <p className="text-ink-secondary text-xs leading-6">
            仅消耗上方材料，收藏材料不会用于扩容。扩容不影响携带出战的 6
            个位置。
          </p>
        </div>
      )}
    </InkModal>
  );
}
