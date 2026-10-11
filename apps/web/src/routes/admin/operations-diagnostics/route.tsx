import { apiFetch } from '@app/lib/api/fetch';
import { useInkUI } from '@app/components/providers/InkUIProvider';
import { InkButton, InkSelect } from '@app/components/ui';
import { useCallback, useEffect, useRef, useState } from 'react';

type CountMap = Record<string, number>;

type Diagnostics = {
  generatedAt: string;
  windowHours: number;
  database: { ok: boolean; latencyMs: number };
  feedbacks: { totalsByStatus: CountMap; recentByStatus: CountMap };
  systemMailCampaigns: {
    totalsByStatus: CountMap;
    deliveryReceipts: {
      total: number;
      unread: number;
      unclaimed: number;
      recent: number;
    };
  };
  sponsorshipOrders: {
    totalsByVerificationStatus: CountMap;
    totalsByFulfillmentStatus: CountMap;
  };
};

type DiagnosticsResponse = {
  success?: boolean;
  error?: string;
  data?: Diagnostics;
};

type AuditStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'partial'
  | 'conflict';

type AuditItem = {
  id: string;
  requestKey: string;
  actorId: string;
  action: string;
  target: Record<string, unknown>;
  expectedRevision: number | null;
  status: AuditStatus;
  reason: string | null;
  result: Record<string, unknown>;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
};

type AuditResponse = {
  success?: boolean;
  error?: string;
  data?: {
    items: AuditItem[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
};

const AUDIT_STATUS_LABELS: Record<AuditStatus | 'all', string> = {
  all: '全部状态',
  pending: '待执行',
  running: '执行中',
  succeeded: '成功',
  failed: '失败',
  partial: '部分完成',
  conflict: '版本冲突',
};

const AUDIT_STATUS_COLORS: Record<AuditStatus, string> = {
  pending: 'text-wood',
  running: 'text-wood',
  succeeded: 'text-teal',
  failed: 'text-crimson',
  partial: 'text-wood',
  conflict: 'text-crimson',
};

function sum(values: CountMap): number {
  return Object.values(values).reduce((total, value) => total + value, 0);
}

function formatDateTime(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : '暂无';
}

function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined) return '暂无';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function CountCard(props: { title: string; value: number; hint: string }) {
  return (
    <div className="border-ink/15 bg-bgpaper/85 border border-dashed p-4">
      <p className="text-ink-secondary text-xs tracking-[0.18em]">
        {props.title}
      </p>
      <p className="text-ink mt-2 font-mono text-3xl font-semibold">
        {props.value}
      </p>
      <p className="text-ink-secondary mt-2 text-xs leading-5">{props.hint}</p>
    </div>
  );
}

function StatusList({ values }: { values: CountMap }) {
  const entries = Object.entries(values);
  if (entries.length === 0) {
    return <p className="text-ink-secondary text-sm">暂无记录</p>;
  }
  return (
    <ul className="text-ink-secondary grid gap-2 text-sm sm:grid-cols-2">
      {entries.map(([key, value]) => (
        <li key={key} className="flex justify-between gap-3">
          <span>{key}</span>
          <span className="font-mono text-ink">{value}</span>
        </li>
      ))}
    </ul>
  );
}

export default function AdminOperationsDiagnosticsPage() {
  const { pushToast } = useInkUI();
  const [windowHours, setWindowHours] = useState('24');
  const [data, setData] = useState<Diagnostics | null>(null);
  const [loading, setLoading] = useState(false);
  const [audit, setAudit] = useState<AuditResponse['data'] | null>(null);
  const [auditStatus, setAuditStatus] = useState<AuditStatus | 'all'>('all');
  const [auditLoading, setAuditLoading] = useState(false);

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const query = new URLSearchParams({ page: '1', limit: '8' });
      if (auditStatus !== 'all') query.set('status', auditStatus);
      const response = await apiFetch(
        `/api/admin/operations/audit?${query.toString()}`,
        { cache: 'no-store' },
      );
      const payload = (await response.json()) as AuditResponse;
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error ?? '加载操作审计失败');
      }
      setAudit(payload.data);
    } catch (error) {
      pushToast({
        message: error instanceof Error ? error.message : '加载操作审计失败',
        tone: 'danger',
      });
    } finally {
      setAuditLoading(false);
    }
  }, [auditStatus, pushToast]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiFetch(
        `/api/admin/operations/diagnostics?windowHours=${windowHours}`,
        { cache: 'no-store' },
      );
      const payload = (await response.json()) as DiagnosticsResponse;
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error ?? '加载运营诊断失败');
      }
      setData(payload.data);
    } catch (error) {
      pushToast({
        message: error instanceof Error ? error.message : '加载运营诊断失败',
        tone: 'danger',
      });
    } finally {
      setLoading(false);
    }
  }, [pushToast, windowHours]);

  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    void loadRef.current();
  }, [windowHours]);

  useEffect(() => {
    void loadAudit();
  }, [loadAudit]);

  const feedbackTotal = data ? sum(data.feedbacks.totalsByStatus) : 0;
  const recentFeedbackTotal = data ? sum(data.feedbacks.recentByStatus) : 0;
  const verificationTotal = data
    ? sum(data.sponsorshipOrders.totalsByVerificationStatus)
    : 0;
  const fulfillmentTotal = data
    ? sum(data.sponsorshipOrders.totalsByFulfillmentStatus)
    : 0;

  return (
    <div className="space-y-5">
      <header className="border-ink/15 bg-bgpaper/90 border border-dashed p-6">
        <p className="text-ink-secondary text-xs tracking-[0.22em]">
          OPERATIONS DIAGNOSTICS
        </p>
        <h2 className="font-heading text-ink mt-2 text-3xl">运营诊断</h2>
        <p className="text-ink-secondary mt-3 max-w-3xl text-sm leading-7">
          这里聚合现有持久数据，帮助定位反馈积压、站内信记录和爱发电履约异常。指标用于排查，不会直接修改业务数据。
        </p>
      </header>

      <section className="border-ink/15 bg-bgpaper/90 space-y-5 border border-dashed p-6">
        <div className="flex flex-wrap items-center gap-3">
          <InkSelect
            size="sm"
            value={windowHours}
            onChange={setWindowHours}
          >
            <option value="6">最近 6 小时</option>
            <option value="24">最近 24 小时</option>
            <option value="72">最近 3 天</option>
            <option value="168">最近 7 天</option>
          </InkSelect>
          <InkButton
            type="button"
            variant="secondary"
            disabled={loading}
            onClick={() => {
              void load();
              void loadAudit();
            }}
          >
            {loading ? '刷新中...' : '刷新诊断'}
          </InkButton>
          <p className="text-ink-secondary text-xs">
            窗口：{data?.windowHours ?? windowHours} 小时 · 最近刷新：
            {formatDateTime(data?.generatedAt)}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <CountCard
            title="数据库延迟"
            value={data?.database.latencyMs ?? 0}
            hint={
              data
                ? `${data.database.ok ? 'PostgreSQL 可连接' : 'PostgreSQL 不可连接'}，单位毫秒`
                : '等待加载'
            }
          />
          <CountCard
            title="反馈总量"
            value={feedbackTotal}
            hint={`窗口内新增 ${recentFeedbackTotal} 条`}
          />
          <CountCard
            title="邮件未读"
            value={data?.systemMailCampaigns.deliveryReceipts.unread ?? 0}
            hint={`持久记录未领取 ${data?.systemMailCampaigns.deliveryReceipts.unclaimed ?? 0} 条`}
          />
          <CountCard
            title="赞助履约记录"
            value={fulfillmentTotal}
            hint={`验证记录 ${verificationTotal} 条`}
          />
        </div>
        <p className="text-ink-secondary text-xs leading-5">
          数据库指标只验证 PostgreSQL 可连接性和查询延迟；邮件指标统计站内信持久记录的未读、未领取状态，不代表实时通知已送达。当前诊断页不覆盖 Redis/NATS。
        </p>
      </section>

      <section className="border-ink/15 bg-bgpaper/90 space-y-4 border border-dashed p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-ink text-lg font-semibold">最近操作审计</h3>
            <p className="text-ink-secondary mt-1 text-xs">
              记录管理端有副作用操作的请求、结果和幂等键，便于回溯失败与版本冲突。
            </p>
          </div>
          <div className="flex items-center gap-3">
            <InkSelect
              size="sm"
              value={auditStatus}
              onChange={(value) =>
                setAuditStatus(value as AuditStatus | 'all')
              }
            >
              {Object.entries(AUDIT_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </InkSelect>
            <InkButton
              type="button"
              variant="secondary"
              disabled={auditLoading}
              onClick={() => void loadAudit()}
            >
              {auditLoading ? '读取中...' : '刷新审计'}
            </InkButton>
          </div>
        </div>

        {audit?.items.length ? (
          <div className="border-ink/10 max-h-[32rem] overflow-auto border border-dashed">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-ink/10 text-ink-secondary sticky top-0 border-b bg-bgpaper text-left">
                <tr>
                  <th className="px-3 py-2">时间</th>
                  <th className="px-3 py-2">状态</th>
                  <th className="px-3 py-2">动作</th>
                  <th className="px-3 py-2">请求键 / 操作人</th>
                  <th className="px-3 py-2">目标 / 结果</th>
                  <th className="px-3 py-2">原因</th>
                </tr>
              </thead>
              <tbody>
                {audit.items.map((item) => (
                  <tr key={item.id} className="border-ink/8 border-b align-top">
                    <td className="text-ink-secondary whitespace-nowrap px-3 py-3">
                      <div>{formatDateTime(item.createdAt)}</div>
                      <div className="mt-1 text-xs">
                        完成：{formatDateTime(item.completedAt)}
                      </div>
                    </td>
                    <td
                      className={`whitespace-nowrap px-3 py-3 font-medium ${AUDIT_STATUS_COLORS[item.status]}`}
                    >
                      {AUDIT_STATUS_LABELS[item.status]}
                    </td>
                    <td className="text-ink whitespace-nowrap px-3 py-3 font-mono text-xs">
                      {item.action}
                    </td>
                    <td className="text-ink-secondary max-w-[220px] px-3 py-3 text-xs">
                      <div className="truncate" title={item.requestKey}>
                        {item.requestKey}
                      </div>
                      <div className="mt-1 truncate" title={item.actorId}>
                        操作人：{item.actorId}
                      </div>
                    </td>
                    <td className="text-ink-secondary max-w-[280px] px-3 py-3 text-xs">
                      <div className="truncate" title={formatAuditValue(item.target)}>
                        目标：{formatAuditValue(item.target)}
                      </div>
                      <div className="mt-1 truncate" title={formatAuditValue(item.result)}>
                        结果：{formatAuditValue(item.result)}
                      </div>
                    </td>
                    <td className="text-ink-secondary max-w-[220px] px-3 py-3 text-xs">
                      <span className="line-clamp-3" title={item.reason ?? undefined}>
                        {item.reason ?? '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-ink-secondary text-sm">
            {auditLoading ? '正在读取操作审计...' : '暂无匹配的操作记录。'}
          </p>
        )}
        {audit && audit.pagination.total > audit.items.length ? (
          <p className="text-ink-secondary text-xs">
            当前显示最近 {audit.items.length} 条，共 {audit.pagination.total} 条；表格区域可独立滚动。
          </p>
        ) : null}
      </section>

      {data ? (
        <section className="grid gap-5 xl:grid-cols-3">
          <div className="border-ink/15 bg-bgpaper/90 space-y-3 border border-dashed p-6">
            <h3 className="text-ink text-lg font-semibold">反馈状态</h3>
            <p className="text-ink-secondary text-xs">全部记录</p>
            <StatusList values={data.feedbacks.totalsByStatus} />
            <p className="text-ink-secondary pt-2 text-xs">窗口内新增</p>
            <StatusList values={data.feedbacks.recentByStatus} />
          </div>
          <div className="border-ink/15 bg-bgpaper/90 space-y-3 border border-dashed p-6">
            <h3 className="text-ink text-lg font-semibold">系统邮件</h3>
            <StatusList values={data.systemMailCampaigns.totalsByStatus} />
            <p className="text-ink-secondary pt-2 text-xs leading-5">
              总站内信持久记录 {data.systemMailCampaigns.deliveryReceipts.total} 条 · 最近窗口新增{' '}
              {data.systemMailCampaigns.deliveryReceipts.recent} 条
            </p>
          </div>
          <div className="border-ink/15 bg-bgpaper/90 space-y-3 border border-dashed p-6">
            <h3 className="text-ink text-lg font-semibold">爱发电履约</h3>
            <p className="text-ink-secondary text-xs">验证状态</p>
            <StatusList
              values={data.sponsorshipOrders.totalsByVerificationStatus}
            />
            <p className="text-ink-secondary pt-2 text-xs">履约状态</p>
            <StatusList
              values={data.sponsorshipOrders.totalsByFulfillmentStatus}
            />
          </div>
        </section>
      ) : (
        <section className="border-ink/15 bg-bgpaper/90 border border-dashed p-6">
          <p className="text-ink-secondary text-sm">
            {loading ? '正在读取诊断数据...' : '暂无诊断数据，请点击刷新。'}
          </p>
        </section>
      )}
    </div>
  );
}
