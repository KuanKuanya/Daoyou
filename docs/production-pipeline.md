# 二次开发仓库的生产流水线

本方案只作用于 `KuanKuanya/Daoyou`，部署到 `root@<PRODUCTION_HOST>:22` 的 `/opt/daoyou`。上游 `ChurchTao/Daoyou` 的更新先进入开发流程，不直接进入生产。

本 fork 面向玩家的游戏名称为「九霄道纪」；登录页、网页标题、PWA 安装名称、分享与认证邮件使用此名称。上游来源和许可证保留在仓库说明中。

## 分支与触发

| 入口 | 行为 |
| --- | --- |
| 推送 `local-dev` | 类型检查、lint、纯共享逻辑测试、完整构建 |
| PR 到 `local-dev` 或 `production` | 同样的检查，不读取部署 Secrets |
| 推送 `production` | 检查 → 发布镜像及配套前端/迁移源码 → SSH 部署 |
| 手动运行 Production release | 仅选择 `production` 才会执行 |
| `master`、任意 tag、其他 fork | 不触发生产发布 |

建议将本 fork 的默认分支设为 `local-dev`，在 `production` 设置要求 PR 和 Quality checks 通过的分支规则。手动运行工作流需要工作流文件也存在于默认分支。不要使用 GitHub 的 Sync fork 按钮覆盖二次开发默认分支；上游更新由单独的分支/PR审查后引入。

`ci.yml` 同时是可复用工作流，生产发布调用它后再发布产物，避免仅依赖先前的 PR 检查。Node 固定 24.18.0，pnpm 固定 12.10.1，使用现有 pnpm 锁文件。构建不读取本地或预发布配置，也不连接生产数据库。

CI 共享逻辑测试使用单个 Vitest worker，避免多种子战斗模拟在 Runner 上因 CPU 竞争触发既有超时；不放宽测试超时、不跳过测试。

## 日常操作：提交、合并、部署与验收

统一路径是：本地验证 → 提交并推送开发分支 → PR 合入 `local-dev`（若从功能分支开发）→ `local-dev` 到 `production` 的发布 PR → 检查通过后合并 → 跟踪合并提交对应的 Production release → 验收。生产分支只通过 PR 更新，不在本地制造 production 合并提交，也不直接推送或强推生产分支。

### 1. 确认改动范围并验证

在仓库根目录检查当前分支和全部改动。下面的提交示例假设当前在 `local-dev`；若在 `codex/*` 功能分支，先通过 PR 将该分支合入 `local-dev`，再创建发布 PR。切换分支前保留未提交修改，不用 reset/clean 清空工作区。

```bash
git status --short --branch
git diff
git diff --cached
git remote -v
git fetch origin local-dev production
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run lint
pnpm run test --maxWorkers=1
pnpm run build
```

每条命令成功后再继续。使用仓库固定的 Node/pnpm 版本，不新建其他包管理器锁文件。按 [测试规范](testing.md) 验证本次改动的本地用户流程；数据库变更同时检查 SQL、journal、snapshot 和兼容性。仅文档或发布辅助脚本变更可按 AGENTS.md 缩减应用检查，但在 PR 写明运行与跳过的检查。

### 2. 提交和推送开发代码

逐项暂存本次需要发布的文件。下面路径和提交说明是占位示例，替换后执行；避免把其他任务的修改一并提交。

```bash
test "$(git branch --show-current)" = local-dev
git add -- path/to/changed-file path/to/another-file
git diff --cached --stat
git diff --cached --check
git diff --cached
git commit -m "fix: describe the actual change"
git push origin HEAD:local-dev
```

如果推送被拒绝，先 fetch 并审查远端新增提交，在保留本地改动的前提下处理冲突、重新验证，不强推。若本机 HTTPS 凭据失效而 SSH 已配置，可使用下面命令，无需改仓库远端配置。显式 refspec 更新 `origin/*`，避免只更新 FETCH_HEAD 却继续读取过期的跟踪分支。

```bash
git fetch git@github.com:KuanKuanya/Daoyou.git \
  refs/heads/local-dev:refs/remotes/origin/local-dev \
  refs/heads/production:refs/remotes/origin/production
git push git@github.com:KuanKuanya/Daoyou.git HEAD:local-dev
```

### 3. 创建并合并发布 PR

浏览器打开本 fork 的 Pull requests，先检查是否已经存在 `local-dev → production` 的 PR；存在时沿用，避免并行创建重复发布。新建时 base 为 `production`、compare 为 `local-dev`。核对 Files changed、迁移文件和验证记录，等待 `Quality checks` 成功。新增提交会使旧检查证据失效，应等待最新提交的检查。

使用 GitHub 的 **Create a merge commit** 合并，保留开发与生产的共同历史。合并前确认 PR 的 head 没有变化；合并后复制 GitHub 记录的完整 merge commit SHA。它是本次发布身份，可能与开发提交不同。

可选使用 GitHub CLI：先安装 `gh`，执行 `gh auth login --hostname github.com` 并确认 `gh auth status --hostname github.com` 成功。将 PR 描述写入仓库外的文本文件（例如 `/tmp/daoyou-release-pr.md`），说明问题、最终行为、验证结果和迁移影响；保留真实换行。

```bash
gh pr list --repo KuanKuanya/Daoyou --base production --head local-dev --state open
gh pr create --repo KuanKuanya/Daoyou --base production --head local-dev \
  --title "release: describe this release" --body-file /tmp/daoyou-release-pr.md
```

将下面 `123` 替换为实际 PR 号，逐步执行。`--match-head-commit` 防止检查期间有新提交却仍合并旧审核结果；有冲突或检查失败时先解决问题，不使用 `--admin` 绕过保护。

```bash
release_pr=123
release_head=$(gh pr view "$release_pr" --repo KuanKuanya/Daoyou --json headRefOid --jq '.headRefOid')
gh pr checks "$release_pr" --repo KuanKuanya/Daoyou --watch --fail-fast
gh pr merge "$release_pr" --repo KuanKuanya/Daoyou --merge --match-head-commit "$release_head"
release_sha=$(gh pr view "$release_pr" --repo KuanKuanya/Daoyou --json mergeCommit --jq '.mergeCommit.oid')
```

若 GitHub 返回等待审核或排队合并，先等 PR 实际变为 merged；未取得完整 merge SHA 前不要开始验收。不要删除长期使用的 `local-dev` 分支。

### 4. 跟踪本次生产提交

在 Actions → Production release 打开 **head SHA 与本次 merge SHA 一致** 的运行。必须确认以下三个 Job 全部成功：`checks / Quality checks`、`Publish production artifacts`、`Deploy production server`。只看到检查成功、镜像已发布或 PR 已合并，都不能算上线完成。

本地只读辅助脚本依赖已登录的 `gh`，无需生产 SSH 密钥或生产配置。它固定查询本 fork 的 `deploy.yml`、`production` 和指定完整 SHA，不会推送、合并或触发部署：

```bash
bash scripts/release-status.sh status "$release_sha"
bash scripts/release-status.sh watch "$release_sha"
```

`status` 用于一次查询（也可查看历史提交）；`watch` 等待对应运行，且在开始和成功结束时检查远端 production head 仍是该 SHA。有更新版本时会停止认可旧提交为当前生产。退出码 0 的 `status` 也可能表示仍在排队／运行，以打印状态为准；`watch` 只有确认工作流成功且提交未被更新时才返回成功。若 GitHub 暂时还没有创建对应运行，`watch` 等待最多约一分钟后提示重试。

Actions 发布串行执行。发现新的 production 提交已经排队或部署时，不再重跑旧提交；旧版本的迟到重跑可能在新版后把服务器切回旧版。生产当前版本以服务器 `/version.json` 和 `/opt/daoyou/current/release.json` 为准，不能只看本地 `production`、`origin/production` 或 Docker `latest`。

### 5. 验收并记录

`Deploy production server` 成功表示发布脚本已完成数据库备份、认证／业务迁移、API 启动和静态切换，并通过公网 `/api/health-check`、`/version.json` 的 SHA 校验。仍需在真实 HTTPS 玩家入口刷新页面，确认本次修改的功能可用；生产使用真实运营账号，不使用本地测试账号或本地发放入口。

额外人工查询可以使用实际 HTTPS origin（下面为示例）：

```bash
release_origin=https://game.example.com
curl --fail --silent --show-error --max-time 30 "$release_origin/api/health-check"
curl --fail --silent --show-error --max-time 30 "$release_origin/version.json"
```

核对 `buildId` 与本次完整 merge SHA 相等。每次交付至少记录 PR 链接、完整 SHA、Actions 运行链接／attempt、三个 Job 结果、本次功能验收和未验证项；发生失败还要记录具体步骤及恢复动作。PR 合并成功而部署失败时，明确标记为“代码已合并，生产未完成更新”。

本地需要同步分支时，在工作区干净后 fetch，再在对应分支执行 `git merge --ff-only origin/local-dev` 或 `git merge --ff-only origin/production`。如 fast-forward 被拒绝，先保留并检查本地分叉提交；不通过强推把临时生产合并写回远端。

## GitHub 配置

在本 fork 的 Settings → Secrets and variables → Actions 添加：

| Repository Secret | 内容 |
| --- | --- |
| `DOCKERHUB_USERNAME` | `kuankuan` |
| `DOCKERHUB_TOKEN` | Docker Hub 的 Repo Read & Write 令牌 |
| `PRODUCTION_HOST` | 生产服务器主机名或 IPv4 地址，仅保存到 Secret，不写入源码 |
| `PRODUCTION_SSH_KEY` | 已验证可登录 root 的云平台 SSH 私钥或部署专用私钥，直接填 GitHub |
| `PRODUCTION_SSH_KNOWN_HOSTS` | 从已登录服务器取得的主机公钥行 |

Docker Hub 仓库使用 `kuankuan/daoyou-app`。服务器需能拉取该镜像；私有仓库应在服务器单独使用 Read-only 令牌登录。GitHub 的推送令牌不会下发到服务器。

创建名为 `production` 的 Environment，Deployment branches 只允许 `production`。上述 Repository Secrets 可以被引用该 Environment 的作业读取；若设置了同名 Environment Secret，会覆盖仓库值。需要人工发布审核时可以在该 Environment 配置审核人，具体可用功能取决于 GitHub 套餐。

当前 IP 入口使用同源 `/api`，不设置 Repository Variable `VITE_API_BASE_URL`。切换分离域名后，再设置它为实际 API 地址并重新构建。只允许公开配置使用 `VITE_*`。

玩家入口必须使用可信 HTTPS：ALTCHA 在普通公网 HTTP 上无法工作。服务器已配置 Let's Encrypt IP 短期证书和 `daoyou-certbot-renew.timer`，每天两次检查续期；云安全组必须允许入站 TCP 443。`BETTER_AUTH_URL`、`PUBLIC_WEB_ORIGINS` 使用同一 HTTPS origin。端口 80 保留 ACME 验证和只读 `/api/health-check`、`/version.json` 发布验收入口，其他请求在 443 放行后跳转 HTTPS。

## 服务器一次性准备

保留现有服务器源码和配置，先将本次版本的 `scripts/setup-actions-server.sh` 传到 `/opt/daoyou/scripts/`。服务器若由 ZIP 解压安装，无需改成 Git checkout；不要运行用于首次装机的 `deploy-ip.sh`：

```bash
cd /opt/daoyou
bash scripts/setup-actions-server.sh
```

该脚本为现有 IP nginx 配置增加维护状态检查，校验并 reload；保留旧配置备份。默认复用已有云平台密钥，不生成新密钥，也不修改 `authorized_keys`。云平台创建密钥对不代表实例已接受该密钥；先验证它可登录本实例的 root，必要时将对应公钥追加到 `/root/.ssh/authorized_keys`，不要覆盖已有内容。SSH 服务需允许 root 公钥登录。

将下载的云平台私钥直接填入 GitHub 的 `PRODUCTION_SSH_KEY`，完整保留 BEGIN/END 行及换行。私钥不上传到仓库，也不放在服务器源码目录。

没有已有密钥时，可显式运行 `bash scripts/setup-actions-server.sh --generate-key`，创建专用的 `/root/.ssh/daoyou_actions` 并以 `restrict` 选项追加公钥，禁止端口转发、代理转发与交互终端。然后在自己的服务器终端查看该私钥并直接粘贴到 GitHub：

```bash
cat /root/.ssh/daoyou_actions
```

在同一服务器终端将 `PRODUCTION_HOST` 设为实际地址（与 GitHub Secret 一致），再生成 `PRODUCTION_SSH_KNOWN_HOSTS` 的值。下面使用保留的文档示例地址：

```bash
export PRODUCTION_HOST=203.0.113.10
{ printf '%s ' "$PRODUCTION_HOST"; cat /etc/ssh/ssh_host_ed25519_key.pub; }
```

工作流强制校验此主机公钥，不使用关闭主机校验或无验证的 ssh-keyscan。创建 Secrets 后，从开发分支向 `production` 合入准备发布的提交。

当前部署脚本要求：

- 宿主机 nginx，站点配置 `/etc/nginx/conf.d/daoyou-ip.conf`，API upstream `/etc/nginx/conf.d/upstream/backend.conf`。
- 游戏静态根目录 `/srv/jiuxiaodaoji/game`；API 蓝/绿实例为 `daoyou-app-blue` / `daoyou-app-green`，回环端口 3000 / 3001。
- Docker Compose，以及已启动的 PostgreSQL 17、Redis、NATS和外部网络 `daoyou-runtime`。
- `/opt/daoyou/.env.production`，其 DATABASE_URL 在 Docker 网络内可用；现有依赖的环境文件继续保留。
- 当前同源 HTTP 入口的验收地址由工作流通过第四个参数传入发布脚本，主机地址来自 `PRODUCTION_HOST` Secret，不在源码内保存。
- `python3`、`curl`、`flock`、`tar` 和服务器到 Docker Hub/pnpm 包仓库的网络连接。

## 首次上线后的内容初始化

数据库迁移只创建表和约束，不会替生产环境生成材料库内容。材料库是历练、坊市和部分宗门奖励的持久内容来源，必须在第一次开放玩家前检查并初始化：

1. 使用已加入 `ADMIN_EMAILS` 或 `ADMIN_USER_IDS` 的账号登录 `/admin`。
2. 打开 `/admin/item-library`，展开「已发布覆盖」检查表。它统计全库，不受分页、搜索或状态筛选影响。按下面基线补齐显示为 0 的组合，生成后确认条目状态为 `published`。
3. 检查每日材料生成设置为启用。它由 `material-library.generate` 在北京时间每天 01:00 运行，只补充每日市场批次，不能替代首次初始化。
4. 确认覆盖达到 64/64；该检查只证明每个组合都有已发布条目，名称、描述和灵种生长事实仍需通过条目预览复核，不代表全游戏已经初始化。

材料覆盖基线：草药、矿石、妖兽材料、天材地宝、辅助材料、功法典籍、神通秘术和灵种，共 8 类；每类覆盖凡品、灵品、玄品、真品、地品、天品、仙品、神品，共 8 种品质。建议普通材料每组合至少 20 条，灵种至少 10 条；运行最低要求是每组合存在可用的已发布条目。功法典籍、神通秘术也是当前材料类型，不应因名称相似而与固定功法注册表混淆。

其他初始化检查须区分持久运营数据和随代码发布的固定内容：

| 项目 | 检查方式与初始化责任 |
| --- | --- |
| 材料与灵种库 | 管理员生成并发布；覆盖检查接口为 `GET /api/admin/item-library/materials/coverage`，需管理员身份 |
| 每日市场材料批次 | 管理员启用每日生成；仅补充市场批次，不自动补齐所有分类和品质 |
| 声望商店、宗门商店 | 管理员配置商品、售价、境界门槛和限购；空表表示尚未配置，不是迁移失败，不自动生成经济参数 |
| 万劫塔周内容 | `getOrPublishTowerWeek` 在访问当周内容时按当前赛季生成；核对当周赛季及内容版本，不要求预先生成未来赛季 |
| 灵兽技能书、道装图纸、功法玉简等固定道具 | 随 `packages/game-content/src/items/registry.ts` 发布；无需往材料库重复生成固定定义 |
| 玩家背包、角色、邮件、活动记录 | 随玩家操作产生；空表不能作为缺少初始化的判断依据 |

系统邮件每项声望最多 9999、灵石最多 1000 万，与资源写入边界使用同一组常量。草稿保存、编辑及发布均校验；发布还会重新检查已有草稿。领取后的总余额仍受角色资源上限约束。历史邮件不会因新建校验而自动改写，出现超限存量邮件时先备份，再核对收件角色、未领取状态和附件，只修复明确授权的奖励；已发布活动内容不可修改，可停止后续投递。

2026-10-11 生产核对：缺少的 8 种品质妖兽材料已各补 20 条，全库共 1200 条已发布材料／灵种，覆盖 64/64。每日生成已启用；当周万劫塔已存在。两类商店商品为空，按运营选择暂不配置。这是该次检查的快照，后续以管理端检查表和实际赛季为准。

历练奖励会优先从已发布材料库抽取并把完整事实冻结到 `yield.claimed` 事件。当前 API 在某个类型／品质暂时没有材料时使用内置合法材料事实继续结算，避免玩家因漏初始化得到 500；这只是运行兜底，仍应补齐材料库，以保证生产内容和市场内容一致。初始化或补齐后不需要改角色数据，下一次历练领取会自动使用新材料。

若需要通过服务器维护任务补生成，可调用受 `CRON_SECRET` 保护的 `GET /internal/cron/material-library-daily-generation`；生产环境不得省略该密钥。不要直接清空 `wanjiedaoyou_item_library`，清理材料会同时影响历练、坊市和其他奖励来源。

## 每次发布

工作流按同一提交打包三份事实：API 镜像 digest、游戏 SPA、迁移所需的 API/共享库源码、工作区清单及 SQL，并写入 `release.json`。迁移包省去文档图片和已包含在 SPA 中的前端素材。前端原有 `version.json` 的 buildId 使用该提交 SHA。

API 镜像同时发布 `sha-<完整提交 SHA>` 和兼容查询用的 `latest`；服务器始终使用 `kuankuan/daoyou-app@sha256:...`。GitHub 发布包保留30天，包含迁移源码；前端中间产物保留14天。

服务器发布顺序：

1. Runner 用 `actions: read` 获取本次不可变 artifact ID 的短期签名下载链接，通过 SSH stdin 交给服务器。服务器用八个 HTTPS Range 连接下载，核对每段长度和响应区间，再通过 ZIP CRC 校验解出 `/opt/daoyou/incoming/<run-id>-<attempt>.tgz`。签名链接不写入服务器文件、不输出日志，GitHub 令牌留在 Runner。随后获取发布锁，核对提交、运行 ID、镜像 namespace/digest 和前端 buildId。
2. 解压至 `releases/<SHA>/<run-id>-<attempt>/`，拉取镜像并安装该版本的迁移工具。此时仍提供旧版服务。CI 已验证同一锁文件的供应链策略，服务器以 `--frozen-lockfile --trust-lockfile` 保留版本和完整性校验，避免重复元数据查询，并限定网络请求超时；迁移直接调用已安装的 Drizzle CLI，不重复下载 pnpm。
3. 创建 `/opt/daoyou/maintenance`，nginx 对新 HTTP/WS 请求返回503；停止两色API实例并等待最多75秒排空，关闭 cron/消息写入。
4. 备份完整 PostgreSQL 至 `backups/<SHA>-<run-id>-<attempt>.dump`，检查备份非空及 pg_restore 可读取其目录。
5. 在现有Docker网络、显式生产配置下执行认证迁移，再执行业务迁移。根 `pnpm run db:migrate` 绑定本地环境，不能用于此处。
6. 复用蓝绿脚本启动目标 digest、检查新 API、校验并 reload nginx，再将游戏静态根目录切到本次 `web/`。
7. 解除维护，核对公网 `/api/health-check` 和 `/version.json`；成功后更新 `/opt/daoyou/current`。

发布期间有维护窗口，不宣称整站无停机。依赖服务和数据卷不会重建。第一次遇到游戏静态目录是普通目录时，保留为 `game.pre-actions-<run-id>-<attempt>`，随后使用软链接。

重跑失败的 deploy job 会读取原 publish job 的产物，并使用新部署 attempt 目录；不会重新构建或覆盖正在使用的版本。

## 失败与恢复

准备阶段失败不停止旧 API。维护开始后的失败会保留维护标记、发布目录、数据库备份和旧镜像/静态入口信息，GitHub 作业报告失败。此时禁止不经检查直接重试或自动恢复旧应用：数据库可能已经迁移。

### 定位失败与重跑条件

先打开失败运行的 Job 日志，找到实际错误及此前最后成功的阶段，不能仅凭红色图标判断为迁移失败。可用 `gh run view <run-id> --repo KuanKuanya/Daoyou --log-failed` 读取失败日志；签名下载链接、GitHub 令牌、生产配置和私钥不得复制进 PR 或仓库。

| 失败阶段 | 后续处理 |
| --- | --- |
| Quality checks | 修复开发代码，重新验证并通过 PR 发布；不跳过检查 |
| Publish production artifacts | 查看镜像／构建／上传日志；瞬时错误可重跑失败 Job，代码问题修复后重新发布 |
| SSH、artifact 下载、拉取镜像或安装工具，尚未创建维护标记 | 确认旧服务正常且没有更晚 production 提交，瞬时网络错误可重跑失败 Job |
| 备份、迁移、API 启动、静态切换或公网验收，维护已开始 | 先在服务器检查维护标记、发布目录、备份、迁移和当前容器；按下面恢复流程处理，再决定后续发布 |

例如 `Release download failed: URLError, HTTP status=None` 是产物下载链路错误。只有确认部署脚本尚未开始，才能按准备阶段处理；这条错误本身不能证明生产机当前服务状态。

满足重跑条件后，在 **同一个 Actions 运行** 中选择 **Re-run failed jobs**。CLI 等价操作如下，将 `123456789` 换成已核对 SHA 的实际 run ID；该命令会重新尝试生产部署：

```bash
release_run=123456789
gh run view "$release_run" --repo KuanKuanya/Daoyou
gh run rerun "$release_run" --repo KuanKuanya/Daoyou --failed
bash scripts/release-status.sh watch "$release_sha"
```

原运行和新运行的 ID 不同，原运行内重跑的 attempt 则递增；记录时保留两者。不要用重新 dispatch 全部工作流替代失败 Job 重跑，除非明确需要重新构建。直接使用 REST 时，失败重跑接口是 `POST /repos/KuanKuanya/Daoyou/actions/runs/<run-id>/rerun-failed-jobs`，不是 `actions/jobs/<job-id>/rerun-failed-jobs`。如果复用产物已过期，则重新构建当前 production 的发布，不能伪造或手动混配其他提交产物。

发布目录记录：

| 文件                     | 用途                                    |
| ------------------------ | --------------------------------------- |
| `release.json`           | 本次镜像、提交与构建运行                |
| `previous-image`         | 旧容器的本地镜像 ID，避免 latest 漂移   |
| `previous-web`           | 旧游戏静态目录                          |
| `previous-upstream.conf` | 旧 nginx upstream                       |
| `database-backup`        | 迁移前的 PostgreSQL 备份路径            |
| `previous-release`       | 上一次 Actions 发布目录，首次可能不存在 |

恢复前审查已执行迁移是否兼容旧版本。兼容时可在维护状态下用蓝绿脚本启动 previous-image（本地镜像使用 `PULL_IMAGE=0`），将游戏软链接恢复到 previous-web；核对 API/前端后删除维护标记。数据库无自动 down migration。不兼容时保持维护并决定修复或恢复方案；恢复 PostgreSQL 时还需考虑 Redis/NATS 中尚未消费的状态，不能孤立回滚一份数据库。

备份目录结构可读不等于实际恢复成功，首次正式上线仍需完成隔离恢复与目标环境发布/回滚验收。

## /opt/daoyou 是否可以清空

不能整目录删除。新流水线成功接管后，根目录旧源码和 node_modules 可逐项评估清理，但必须先核对实际容器挂载、运行配置及人工恢复路径。

必须保留：生产及依赖环境文件、`releases/`、`current`、`backups/`、维护标记（失败恢复期间），以及当前依赖使用的 Compose/配置文件。尤其旧 NATS 容器可能绑定挂载 `/opt/daoyou/scripts/nats-server.conf`，删除根 scripts 会破坏后续重启。

本流水线不自动删除历史目录、旧压缩包、环境文件或 Docker 数据卷；尚未验证新发布成功前，不清理现有安装。
