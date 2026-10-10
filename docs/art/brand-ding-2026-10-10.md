# 水墨品牌鼎更新

用户追加要求参考古代神器鼎描述。以《左传·宣公三年》“铸鼎象物”的百物意象为灵感，采用立耳深腹三足、简化古兽面与山河纹，属于艺术诠释而非古器复原。原文：https://ctext.org/chun-qiu-zuo-zhuan/xuan-gong-san-nian/zhs 。使用内置 imagegen 生成最终 v3，v2 素面候选不再用于品牌入口。原图 alpha 0–255；Pillow 仅裁外部空白、等比缩放与格式转换，maskable 版本增加宣纸底色和安全边距。

## 提示词

Use case: logo-brand. Primary request: 为《万界道友》水墨修仙游戏重新设计一尊上古神器鼎的品牌图标，灵感来自《左传·宣公三年》的“铸鼎象物”：鼎上象征山川百物、镇守九州。是艺术诠释而非考古复原。Subject: 一尊庄严的上古三足圆鼎，正面轻微俯视，宽平厚口沿、高而挺拔的双立耳，双耳是对称的简洁矩形拱耳，短颈接深圆腹，三只粗而修长的柱足，前中央一足和左右两足结构合理、连接稳当；全鼎偏挺拔而非矮胖饭锅，不加炉盖或兽形把手。腹部正中用清楚但极简的浅青灰墨线表现一枚对称古兽面纹，两个眼点和两条弧角即可；腹部下方三笔山岳和一条曲水形成简练的山河纹带，纹样留白，不堆密集花纹。主体青黑灰墨，少量古铜暖褐与青绿彩墨自然渗入，旧而有灵气，体现古朴的镇世重器。Style: 中国传统写意水墨，粗毛笔宽墨面、枯笔飞白、虚实浓淡、内部大留白；轮廓有手绘笔势而不是厚重统一描边，不画写实金属材质和3D高光，不照片，不卡通，不现代扁平矢量。Composition: 单个鼎完整居中，占方形画布80%，安全边距，清楚双耳深腹三足，16px仍可辨认，纹样是大块符号不是细刻痕。Background: 真正透明，外围alpha0，无背板纸张、烟雾、发光光环、地面阴影、溅墨粒子。无文字印章水印，无九个鼎，无附加兵器。

## 接入

- 注册图标：apps/web/public/assets/icons/brand-ding-ink-v3.webp，登录页通过 GameIcon 使用。
- 启动屏：apps/web/public/assets/app-boot/boot-logo-v3.webp，HTML 预加载、静态启动屏和 React 启动屏同步。
- 站点图标：apps/web/public/favicon-ink-v3.png，更新 favicon 引用与 PWA 预缓存。
- 安装图标：apps/web/public/icons/{icon-192-v3,icon-512-v3,icon-maskable-512-v3,apple-touch-icon-v3}.png，manifest 和 Apple 图标引用同步。
- 使用版本化路径，避免沿用旧品牌资源缓存；旧素材保留，但上述入口不再使用。

## 验证

定向 ESLint 与 pnpm --filter @daoyou/web build（含类型检查）通过，git diff --check 通过。浏览器实际 favicon 与 Apple 图标指向 v3；品牌图加载成功，512×512。预览截图为 docs/art-previews/2026-10-10-brand-ding-browser.png。登录账号访问登录页会返回洞府，因此未退出当前账号检查登录页；该页 GameIcon 的注册与引用已做代码检查。未跑全量领域测试，本轮没有玩法逻辑变更。
