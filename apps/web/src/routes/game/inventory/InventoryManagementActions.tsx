import { InkModal } from '@app/components/layout';
import { InkButton } from '@app/components/ui/InkButton';
import { apiFetch } from '@app/lib/api/fetch';
import {
  updateInventoryManagementPreferences,
  useInventoryManagementPreferences,
} from '@app/lib/inventory-management-preferences';
import { consumeResourceMutation } from '@app/lib/resources/mutations';
import {
  InventoryManagementSchema,
  type AutoStorePreview,
  type InventoryManagementAction,
  type StorageCompactResult,
} from '@daoyou/contracts/inventory';
import { useEffect, useRef, useState } from 'react';

const endpoint = '/api/combat-v6/inventory/management';
type WriteAction = Exclude<
  InventoryManagementAction,
  { action: 'auto_store_preview' }
>;
export function InventoryManagementActions(props: {
  owner?: string;
  location: 'bag' | 'storage';
  disabled: boolean;
  onComplete(): void;
}) {
  return <ManagementActions key={props.owner ?? ''} {...props} />;
}
function ManagementActions({
  owner,
  location,
  disabled,
  onComplete,
}: {
  owner?: string;
  location: 'bag' | 'storage';
  disabled: boolean;
  onComplete(): void;
}) {
  const preferences = useInventoryManagementPreferences(owner);
  const [settings, setSettings] = useState(false);
  const [preview, setPreview] = useState<AutoStorePreview>();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const key = `daoyou:inventory-management:pending:${owner ?? ''}`;
  const [unresolved, setUnresolved] = useState<WriteAction | undefined>(() => {
    try {
      const parsed = InventoryManagementSchema.safeParse(
        JSON.parse(sessionStorage.getItem(key) ?? 'null'),
      );
      return parsed.success && parsed.data.action !== 'auto_store_preview'
        ? parsed.data
        : undefined;
    } catch {
      return undefined;
    }
  });
  const stop = useRef(false);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stop.current = true;
    };
  }, []);
  function remember(input?: WriteAction) {
    setUnresolved(input);
    try {
      if (input) sessionStorage.setItem(key, JSON.stringify(input));
      else sessionStorage.removeItem(key);
    } catch {
      /* The in-memory frozen request still supports retry. */
    }
  }
  async function write(input: WriteAction) {
    remember(input);
    const response = await apiFetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (response.status >= 400 && response.status < 500) remember(undefined);
    const result = await consumeResourceMutation<
      StorageCompactResult | { transferred: number }
    >(response);
    remember(undefined);
    onComplete();
    return result;
  }
  async function beginPreview() {
    if (!owner || busy.current || unresolved) return;
    busy.current = true;
    setPending(true);
    setMessage('');
    try {
      const response = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'auto_store_preview',
          rules: {
            materialsToStorage: preferences.materialsToStorage,
            lowRealmEquipmentToStorage: preferences.lowRealmEquipmentToStorage,
          },
        }),
      });
      const body = await response.json();
      if (!response.ok || !body.success)
        throw new Error(body.error ?? '归仓预览失败');
      if (body.data.selected.length) setPreview(body.data as AutoStorePreview);
      else setMessage('没有需要归仓的物品。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '归仓预览失败');
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  async function run(input?: WriteAction) {
    if (!owner || busy.current) return;
    busy.current = true;
    stop.current = false;
    setPending(true);
    let processed = 0,
      removed = 0;
    try {
      let request = input ?? {
        action: 'compact_storage' as const,
        requestId: crypto.randomUUID(),
      };
      while (true) {
        const result = await write(request);
        if ('transferred' in result) {
          setPreview(undefined);
          setMessage(`已归仓 ${result.transferred} 项物品。`);
          break;
        }
        processed += result.processed;
        removed += result.removed;
        setMessage(
          `已处理 ${processed} 堆，合并减少 ${removed} 堆${result.hasMore ? '；正在继续……' : '；储藏室整理完成。'}`,
        );
        if (!result.hasMore || stop.current || !mounted.current) {
          if (result.hasMore)
            setMessage(
              `已合并减少 ${removed} 堆；已停止，可再次整理剩余物品。`,
            );
          break;
        }
        request = { action: 'compact_storage', requestId: crypto.randomUUID() };
      }
    } catch (error) {
      setMessage(
        `${processed ? `已处理 ${processed} 堆；` : ''}${error instanceof Error ? error.message : '操作结果尚未确认'}。`,
      );
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  }
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {location === 'bag' ? (
          <>
            <InkButton
              disabled={disabled || pending || !!unresolved}
              onClick={() => void beginPreview()}
            >
              归仓
            </InkButton>
            <InkButton
              disabled={pending || !!unresolved}
              onClick={() => setSettings(true)}
            >
              归仓设置
            </InkButton>
          </>
        ) : (
          <InkButton
            disabled={disabled || pending || !!unresolved}
            onClick={() => void run()}
          >
            整理储藏室
          </InkButton>
        )}
        {pending && location === 'storage' ? (
          <InkButton
            onClick={() => {
              stop.current = true;
            }}
          >
            停止后续整理
          </InkButton>
        ) : null}
        {unresolved && !pending ? (
          <InkButton onClick={() => void run(unresolved)}>
            恢复未确认操作
          </InkButton>
        ) : null}
        {message ? (
          <span role="status" className="text-ink-secondary text-xs">
            {message}
          </span>
        ) : null}
      </div>
      <InkModal
        isOpen={settings}
        onClose={() => setSettings(false)}
        title="归仓设置"
      >
        <div className="space-y-3 text-sm">
          <p className="text-ink-secondary">
            记住当前浏览器的选择。收藏物品和已穿戴道装保留，药品等物品继续手动转存。
          </p>
          {(['materialsToStorage', 'lowRealmEquipmentToStorage'] as const).map(
            (field) => (
              <label key={field} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={preferences[field]}
                  onChange={(event) =>
                    owner &&
                    updateInventoryManagementPreferences(owner, {
                      [field]: event.target.checked,
                    })
                  }
                />
                {field === 'materialsToStorage' ? '材料入库' : '低境界道装入库'}
              </label>
            ),
          )}
          <InkButton onClick={() => setSettings(false)}>完成</InkButton>
        </div>
      </InkModal>
      <InkModal
        isOpen={!!preview}
        onClose={() => !pending && setPreview(undefined)}
        title="归仓预览"
      >
        {preview ? (
          <div className="space-y-3 text-sm">
            <p>
              将 {preview.selected.length} 项物品存入储藏室，腾出{' '}
              {preview.selected.length} 格。收藏物品已跳过。
            </p>
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {preview.selected.map((item) => (
                <li key={item.id}>
                  {item.name}{' '}
                  <span className="font-mono">×{item.quantity}</span>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <InkButton
                disabled={pending || !!unresolved}
                onClick={() =>
                  void run({
                    action: 'auto_store',
                    requestId: crypto.randomUUID(),
                    realm: preview.realm,
                    rules: preview.rules,
                    items: preview.items,
                    selected: preview.selected.map(({ id, revision }) => ({
                      id,
                      revision,
                    })),
                  })
                }
              >
                确认归仓
              </InkButton>
              <InkButton
                disabled={pending}
                onClick={() => setPreview(undefined)}
              >
                取消
              </InkButton>
            </div>
            {message ? <p role="status">{message}</p> : null}
          </div>
        ) : null}
      </InkModal>
    </>
  );
}
