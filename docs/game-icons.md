# 统一图标

灵兽头像的美术方向、固定参考、生成与视觉验收见 [写意墨像技能](../.agents/skills/daoyou-ink-portraits/SKILL.md)。本文负责渲染和资源管理约定。

技能图标的美术设计与风格验收遵循 [水墨技能图腾](../.agents/skills/daoyou-skill-totems/SKILL.md)，以已验收的三枚固定参考保持构形与笔墨一致。两批共 41 枚技能图腾已验收并接入，覆盖 65 条技能配置；生产素材使用 `-totem-v2.webp` 版本路径，业务图标名称保持不变。

React 图标入口为 `apps/web/src/components/ui/GameIcon.tsx`。美术图标显式填写 `icon:名称`，只查询集中注册的 SVG／WebP／PNG 图片，不拼接路径、不加载远程地址、不注入 SVG 字符串。其他普通字符串作为字面符号显示；未知名称和空值显示 `?`。项目尚未上线，不维护 emoji 别名或旧存档图标转换。

```tsx
<GameIcon value="icon:map-wild" />
<GameIcon value="icon:beast-silverwing-mantis" className="text-5xl" />
<GameIcon value="icon:beast-thunder-peng" label="雷鹏" />
```

图标默认一 em 见方，通过字号控制大小，图片保持原始比例。默认作为装饰对读屏隐藏；单独表达含义时传 `label`，旁边已有名称时省略。颜色来自素材本身，以保证物种辨识度。

## 新增与使用

1. 图标文件统一放进 `apps/web/public/assets/icons/`。头像优先使用 256×256 透明 WebP；灵兽头像裁掉透明外边距后等比贴合，宽或高一边尽量占满画布，另一边居中，保留完整轮廓和内部留白。简洁图形可用 SVG，也支持 PNG。检查小尺寸轮廓与透明边缘；SVG 采用正方形 viewBox，禁用脚本、外链和 foreignObject。
2. 在 `apps/web/src/components/ui/icons/registry.ts` 显式注册稳定名称及 `/assets/icons/文件名` 静态路径，业务配置填写 `icon:名称`。名称按类别加前缀，例如 `beast-`。
3. 调用方只使用 `GameIcon`；不自行解析协议、不直接引用资源、不创建第二份注册表。删除或更名时同时检索配置引用。
4. 业务适配组件只负责从领域 ID 取图标值，例如共享的 `feature/beasts/BeastIcon.tsx`，渲染始终交给 `GameIcon`。

初始灵兽选择、灵兽名册与详情头像统一通过 `BeastIcon` 渲染。新增或改动图标使用同一入口；灵兽头像的当前写意墨像素材见 [生成记录](beast-avatar-generation.md)。

灵兽技能两批采用 41 枚水墨图腾，导出为 256×256 RGBA 无损 WebP，保留验收稿的透明安全边距。注册名称统一为 `beast-skill-技能标识`，技能配置在 `packages/game-content/src/beasts/data/skills.json` 中填写 `icon:beast-skill-技能标识`；首批 25 枚覆盖 37 条配置，第二批 16 枚覆盖 28 条配置，全部 14 个特殊技能均已接入。普通与高级的同家族技能共用主体，仍由名称和分级样式区分。

第二批选稿记录见 `output/imagegen/beast-skill-totems-round2-2026-10-05/manifest.json`；摧山、必杀、水击采用 `revisions/` 中的修订 v2 稿，其余 13 枚采用该记录中的选稿。生产文件统一为 `beast-skill-技能标识-totem-v2.webp`。此次仅替换图标，技能内容修订保持 19；原剩余 11 个题材、16 条 emoji 技能配置的历史盘点见 [盘点清单](art/skill-icon-emoji-audit.md)。

共享 `BeastSkillTile` 使用 `GameIcon`，覆盖灵兽详情、图鉴、合成和交易详情；战斗技能选择也沿用同一入口。技能图标按界面图标正常显示，不受人物墨像的图片透明度设置影响。

静态文件随 Vite 构建复制到 `dist/assets/icons/`。新增或替换后检查注册路径与部署产物；同名图标更新素材时可给文件名添加版本号并更新注册路径，业务图标名称不变，避免旧缓存。

Phaser 等 Canvas 渲染器通过 `GameIcon.resolveSource(iconValue)` 获取同一注册资源，再交给纹理加载器；协议解析仍由 `GameIcon.tsx` 集中处理，业务侧不拼接图标路径。新版地图的五类单一用途节点、筛选项和详情共用这一套透明 WebP 资源。

地图图标使用图片生成的国画彩墨素材区分灵兽、秘境石门、坊市摊亭、宗门山门与山川地标。母版按网格分割、透明边界裁切和统一留边后交付为 160×160 RGBA 无损 WebP；区域地图使用左侧大徽头、右侧细胶囊的一体标签：图标固定在左侧，常规显示 40px，秘境菱徽内为 32px；徽头最小高度 52px，文字胶囊比徽头低 16px。灵兽采用苔绿圆徽、秘境采用烟紫菱徽、坊市采用赭金圆角方徽、宗门采用青碧六角徽、山川采用石青拱徽。徽头和文字底均不透明，选中统一使用朱砂描边；密集处保留类别徽头，悬停或选中展开名称。

| 素材 | 用途 | 规格 | 接入 |
| --- | --- | --- | --- |
| `apps/web/public/assets/icons/map-wild.webp` | 灵兽出没地 | 160×160，RGBA | 地图、筛选、查找、详情 |
| `apps/web/public/assets/icons/map-dungeon.webp` | 秘境 | 160×160，RGBA | 地图、筛选、查找、详情 |
| `apps/web/public/assets/icons/map-market.webp` | 坊市 | 160×160，RGBA | 地图、筛选、查找、详情 |
| `apps/web/public/assets/icons/map-sect.webp` | 宗门 | 160×160，RGBA | 地图、筛选、查找、详情 |
| `apps/web/public/assets/icons/map-landmark.webp` | 山川地标 | 160×160，RGBA | 地图、筛选、查找、详情 |

## 网页图片显示强度

网页图片底层统一使用 `components/ui/GameImage.tsx`。它读取浏览器 `game-setting` 中的 `imageOpacity`（0～1，默认1），只影响 `purpose="artwork"` 的图片；旧设置缺少此字段时保持原图。游戏设置中的滑杆即时更新并保存，同源标签页同步，存储不可用时保留当前会话设置。

- `GameImage` 默认 `purpose="artwork"`，用于人物立绘、插画、宗门底图及独立网页背景。
- `GameIcon.value` 始终只接受字符串：emoji 或 `icon:名称`，不接受 React 元素。默认 `purpose="interface"`，导航图标保持清晰；作为设施插画或人物墨像时显式传 `purpose="artwork"`。
- `GameIcon` 在 `purpose="artwork"` 时统一淡化内部 emoji、注册图片及缺失图标占位；美术层与 `GameImage` 共用透明度计算，内部图片不重复应用设置。外层动画与禁用效果继续独立叠加。
- 灵兽通过 `BeastIcon` / `BeastPortrait` 自动按美术图标处理。
- 物品格与物品预览直接使用 `GameIcon purpose="artwork"`，物品图标契约也限定为字符串；普通与上品归元灵露统一使用 `icon:item-origin-dew`，名称保留原有分级颜色。名称、数量、状态角标、空格提示不受影响。
- 已有基础透明度使用 `style={{ opacity: 0.55 }}`，由 `GameImage` 与玩家设置相乘；不要在图片本身使用 `opacity-*` 类或透明度动画。脉冲、淡入及禁用效果放在外层，避免覆盖图片透明度。`GameIcon` 自带外层，原有图标动画可继续使用。
- 0%保留布局、替代文本和点击区域；图片仍会加载。需要文字地图时继续使用独立的地图显示设置。
- CSS 场景背景迁移为同级独立 `GameImage`，文字和按钮不要包入图片效果层。宣纸底纹、Phaser 画布、登录与启动画面暂不受影响。

```tsx
<GameImage src="/assets/manuals/cultivator-male-meditation.webp" alt="静坐修士" />
<GameIcon value="icon:earthfire-furnace" purpose="artwork" />
<GameIcon value="icon:map-market" />
```

新增网页美术图片沿用以上入口，页面不单独订阅图片设置或计算透明度。Canvas 仍通过 `GameIcon.resolveSource()` 获取素材，不接入网页透明度。

## 通用界面图标（2026-10-07）

本轮新增 35 枚生成的水墨图片（25 枚资源／物品／界面图案与 10 枚技能图腾），以及 4 枚简洁状态 SVG。生产栅格统一为 256×256 透明无损 WebP，主体等比缩放到 224×224 区域并居中，完整保留边缘。图标继续按 1em 占位，调用方原有字号和格子尺寸保持不变。母版尺寸不用于网页显示。

`GameIcon` 只为明确的 `icon:名称` 解析图片。图标与文字在配置中使用独立字段，或在界面中显式组合 `GameIcon` 与文字；不扫描或自动替换标签、聊天、剧情正文。缺失技能的 16 条配置现已使用明确图片名称，内容修订和全部效果字段保持不变。普通／高级同家族共用图片。

原图和提示词记录由本次交付的素材包保存；项目内选稿与提示词记录见 `docs/art/ui-ink-icons-2026-10-07.json`。校验生产文件尺寸、alpha、注册路径、24／32／40px 纸色预览及实际桌面／手机布局。

## 空装备位占位图（2026-10-07）

六个道装空槽使用独立的暖灰水墨图片：法冠、法兵、腰封、灵佩、法衣、云履。注册名称为 `equipment-empty-head`、`equipment-empty-weapon`、`equipment-empty-belt`、`equipment-empty-necklace`、`equipment-empty-armor`、`equipment-empty-footwear`，仅由 `EquipmentRack` 的空槽分支调用；穿戴后继续显示物品自身图标。

生产文件为 `equipment-empty-部位-ink-v1.webp`，统一 256×256 透明无损 WebP，主体限制在 224×224 区域，四周至少 16px 安全边距。仍按 1em 渲染：当前手机装备格中约 27px、桌面约 32px，不扩大装备格或覆盖标签。占位图使用界面图标默认显示强度，不再通过淡化彩色装备图标实现空状态。

提示词及选稿记录见 [生成记录](art/empty-equipment-icons-2026-10-07.json)。

## 归元灵露专属图片（2026-10-07）

归元灵露和上品归元灵露的物品摘要统一使用 `icon:item-origin-dew`，为青玉小瓶水墨图片，生产文件为 `item-origin-dew-ink-v2.webp`（256×256 透明无损 WebP，至少16px安全边距）。名称、颜色分级、数量、洗炼规则和预览操作保持原有契约。法力、水属性和灵眼之泉使用 `icon:ui-spirit-water`。

仅调整集中 `refinementAdapter` 的摘要图标，背包、货架、附件与预览沿用同一摘要入口，无需迁移存档。提示词见 [生成记录](art/origin-dew-icon-2026-10-07.json)。

## 物品专属图标九宫格（2026-10-07）

以归元灵露青玉瓶为样式参考，统一生成一张3×3透明水墨精灵图，切分为灵果、符箓、灵种、功法玉简、传承灵印、灵矿、妖兽材料、特殊辅料、天材地宝九张图片。统一轻矿物色、暖灰墨线、左上明暗、完整轮廓和透明边距。原图1254×1254，切分边界沿测量到的透明间隔微调，避免切断物体；每张等比缩放至224×224范围，再居中加16px边距，导出256×256无损WebP。

物品摘要适配器显式使用 `icon:item-*` 稳定名称，背包、货架、奖励目录与预览继续通过同一入口显示，不修改物品名称、品质、数量、价格或使用规则。普通和上品传承灵印共用印形，保留名称的分级颜色。灵果和符箓显式引用对应图片，通用书籍、灵石、落石技能等仍保留原有用途。

生成提示词、图集裁切坐标及文件清单见 [精灵图记录](art/item-sprite-atlas-2026-10-07.json)。最终小图必须复核24／32／40px纸色预览、实际桌面与360px手机布局，保持现有1em图标尺寸与共享物品格、浮层样式。

## 道具与法兵器形补齐（2026-10-10）

新增 15 张 256×256 透明水墨 WebP：丹药、灵草、道装图纸、阵纹、功法典籍、神通秘术，以及斧／刀／枪／棍／剑／扇／铃／笔／幡九种法兵器形。物品摘要适配器显式使用 `icon:item-*`；法兵根据已校验的 `daoWeaponTypeOf` 选择 `icon:item-weapon-器形`，缺省旧法兵显示剑，不从名称推断。

四周至少16px透明边距，保持现有物品格与预览尺寸。已有灵果、符箓、灵种、玉简、灵印等专属素材继续使用。提示词、交付与验收见 [生成记录](art/item-icons-2026-10-10.md)，小尺寸预览见 `docs/art-previews/2026-10-10-items.png`。
