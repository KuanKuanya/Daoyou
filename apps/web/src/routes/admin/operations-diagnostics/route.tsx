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

function sum(values: CountMap): number {
  return Object.values(values).reduce((total, value) => total + value, 0);
}

function formatDateTime(value: string | undefined): string {
  return value ? new Date(value).toLocaleString() : '暂无';
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
          这里聚合现有持久数据，帮助定位反馈积压、邮件投递回执和爱发电履约异常。指标用于排查，不会直接修改业务数据。
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
            onClick={() => void load()}
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
            hint={data ? `${data.database.ok ? '连接正常' : '连接异常'}，单位毫秒` : '等待加载'}
          />
          <CountCard
            title="反馈总量"
            value={feedbackTotal}
            hint={`窗口内新增 ${recentFeedbackTotal} 条`}
          />
          <CountCard
            title="邮件未读"
            value={data?.systemMailCampaigns.deliveryReceipts.unread ?? 0}
            hint={`未领取 ${data?.systemMailCampaigns.deliveryReceipts.unclaimed ?? 0} 条`}
          />
          <CountCard
            title="赞助履约记录"
            value={fulfillmentTotal}
            hint={`验证记录 ${verificationTotal} 条`}
          />
        </div>
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
              总邮件 {data.systemMailCampaigns.deliveryReceipts.total} 条 · 最近窗口新增{' '}
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
