import { InkSelect } from '@app/components/ui/InkSelect';
import {
  updateInventoryManagementPreferences,
  useInventoryManagementPreferences,
} from '@app/lib/inventory-management-preferences';
import type { MailDestination } from '@daoyou/contracts/mail';

export function MailDestinationSelect({
  owner,
  disabled,
}: {
  owner?: string;
  disabled?: boolean;
}) {
  const { mailDestination } = useInventoryManagementPreferences(owner);
  return (
    <InkSelect
      label="物品领取到"
      value={mailDestination}
      disabled={disabled || !owner}
      onChange={(value) => {
        if (owner)
          updateInventoryManagementPreferences(owner, {
            mailDestination: value as MailDestination,
          });
      }}
      hint="记住当前浏览器的选择；灵兽与旧宝库附件按原去向领取。"
      className="min-w-32"
      labelClassName="text-sm"
    >
      <option value="bag">随身背包</option>
      <option value="storage">洞府储藏室</option>
    </InkSelect>
  );
}
