import { InkModal } from '@app/components/layout';
import { useInkUI } from '@app/components/providers/InkUIProvider';
import { GameIcon } from '@app/components/ui/GameIcon';
import { InkButton } from '@app/components/ui/InkButton';
import { InkNotice } from '@app/components/ui/InkNotice';
import { apiFetch } from '@app/lib/api/fetch';
import { useInventoryManagementPreferences } from '@app/lib/inventory-management-preferences';
import { pendingCommandRequestWithPayload } from '@app/lib/pendingCommandRequest';
import { useResourceMutation } from '@app/lib/resources/mutations';
import { usePlayerSession } from '@app/lib/resources/player';
import { ClaimMailSchema, type ClaimMailRequest } from '@daoyou/contracts/mail';
import { mailLocationText } from '@daoyou/game-rules/mail';
import { useRef, useState } from 'react';
import { MailAttachmentSlot } from './MailAttachmentSlot';
import { MailDestinationSelect } from './MailDestinationSelect';
import { Mail } from './MailList';

interface MailDetailModalProps {
  mail: Mail | null;
  onClose: () => void;
  onUpdate: (mailId: string) => void; // Update list after claim
}

export function MailDetailModal({
  mail,
  onClose,
  onUpdate,
}: MailDetailModalProps) {
  const [isClaiming, setIsClaiming] = useState(false);
  const busy = useRef(false);
  const owner = usePlayerSession().data?.activeCultivator?.id;
  const { mailDestination } = useInventoryManagementPreferences(owner);
  const { pushToast } = useInkUI();
  const { mutate } = useResourceMutation();

  if (!mail) return null;

  const hasAttachments = mail.attachments && mail.attachments.length > 0;
  const canClaim = hasAttachments && !mail.isClaimed;

  const handleClaim = async () => {
    if (!owner || busy.current) return;
    busy.current = true;
    const pending = pendingCommandRequestWithPayload<ClaimMailRequest>(
      owner,
      `mail-claim:${mail.id}`,
      { mailId: mail.id, destination: mailDestination },
      (value) => {
        const parsed = ClaimMailSchema.safeParse(value);
        return parsed.success ? parsed.data : undefined;
      },
    );
    let definiteFailure = false;
    try {
      setIsClaiming(true);
      if (pending.payload.destination !== mailDestination)
        pushToast({
          message: `继续上次领取，物品仍领取到${pending.payload.destination === 'storage' ? '洞府储藏室' : '随身背包'}。`,
          tone: 'default',
        });
      const response = await apiFetch('/api/cultivator/mail/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pending.payload),
      });
      definiteFailure =
        response.status >= 400 &&
        response.status < 500 &&
        response.status !== 408 &&
        response.status !== 429;
      if (definiteFailure) pending.complete();
      const result = await mutate<{ locations?: string[] }>(
        Promise.resolve(response),
      );
      pending.complete();
      pushToast({
        message: `领取成功${result.locations?.length ? ' · ' + mailLocationText(result.locations) : ''}`,
        tone: 'success',
      });
      onUpdate(mail.id);
      onClose();
    } catch (error) {
      console.error('Claim failed', error);
      pushToast({
        message: `${error instanceof Error ? error.message : '领取失败'}${definiteFailure ? '' : '；再次领取将恢复本次请求。'}`,
        tone: 'danger',
      });
    } finally {
      setIsClaiming(false);
      busy.current = false;
    }
  };

  return (
    <InkModal isOpen={!!mail} onClose={onClose} title={mail.title}>
      <div className="mt-2 space-y-4">
        <div className="text-sm opacity-60">
          {new Date(mail.createdAt).toLocaleString()}
        </div>

        <div className="text-ink bg-paper border-ink/10 min-h-[100px] border border-dashed p-3 leading-relaxed whitespace-pre-wrap">
          {mail.content}
        </div>

        {hasAttachments && (
          <div className="space-y-2 pt-2">
            <h4 className="text-ink-secondary text-sm font-bold">
              <GameIcon value="icon:ui-treasure-chest" /> 附赠物品
            </h4>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
              {mail.attachments?.map((item, idx) => (
                <MailAttachmentSlot key={idx} attachment={item} />
              ))}
            </div>
          </div>
        )}

        {mail.isClaimed && (
          <InkNotice tone="info" className="py-2 text-center text-sm">
            已领取
          </InkNotice>
        )}

        {canClaim && (
          <MailDestinationSelect owner={owner} disabled={isClaiming} />
        )}

        <div className="flex justify-end gap-2 pt-4">
          {canClaim ? (
            <InkButton
              variant="primary"
              onClick={handleClaim}
              disabled={isClaiming || !owner}
            >
              {isClaiming ? (
                '收取中...'
              ) : (
                <>
                  <GameIcon value="icon:ui-treasure-chest" />
                  {mailDestination === 'storage'
                    ? '领取到储藏室'
                    : '领取到背包'}
                </>
              )}
            </InkButton>
          ) : (
            <InkButton onClick={onClose}>阅毕</InkButton>
          )}
        </div>
      </div>
    </InkModal>
  );
}
