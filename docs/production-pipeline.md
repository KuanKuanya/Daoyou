# 二次开发仓库的生产流水线

本方案只作用于 `KuanKuanya/Daoyou`，部署到 `root@120.48.9.69:22` 的 `/opt/daoyou`。上游 `ChurchTao/Daoyou` 的更新先进入开发流程，不直接进入生产。

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

## GitHub 配置

在本 fork 的 Settings → Secrets and variables → Actions 添加：

| Repository Secret | 内容 |
| --- | --- |
| `DOCKERHUB_USERNAME` | `kuankuan` |
| `DOCKERHUB_TOKEN` | Docker Hub 的 Repo Read & Write 令牌 |
| `PRODUCTION_SSH_KEY` | 部署专用 SSH 私钥，直接填 GitHub |
| `PRODUCTION_SSH_KNOWN_HOSTS` | 从已登录服务器取得的主机公钥行 |

Docker Hub 仓库使用 `kuankuan/daoyou-app`。服务器需能拉取该镜像；私有仓库应在服务器单独使用 Read-only 令牌登录。GitHub 的推送令牌不会下发到服务器。

创建名为 `production` 的 Environment，Deployment branches 只允许 `production`。上述 Repository Secrets 可以被引用该 Environment 的作业读取；若设置了同名 Environment Secret，会覆盖仓库值。需要人工发布审核时可以在该 Environment 配置审核人，具体可用功能取决于 GitHub 套餐。

当前 IP 入口使用同源 `/api`，不设置 Repository Variable `VITE_API_BASE_URL`。切换分离域名后，再设置它为实际 API 地址并重新构建。只允许公开配置使用 `VITE_*`。

## 服务器一次性准备

保留现有服务器源码和配置，先将本次提交合入/拉取到 `/opt/daoyou`，不要运行用于首次装机的 `deploy-ip.sh`：

```bash
cd /opt/daoyou
bash scripts/setup-actions-server.sh
```

该脚本为现有 IP nginx 配置增加维护状态检查，校验并 reload；保留旧配置备份。它创建专用的 `/root/.ssh/daoyou_actions` 密钥并以 `restrict` 选项加入 `authorized_keys`，禁止该密钥的端口转发、代理转发与交互终端。root 的已有密码登录与其他密钥保持原样。SSH 服务仍需允许 root 公钥登录。

在你自己的终端查看私钥并直接粘贴到 GitHub 的 `PRODUCTION_SSH_KEY`，完整保留 BEGIN/END 行及换行：

```bash
cat /root/.ssh/daoyou_actions
```

在同一服务器终端生成 `PRODUCTION_SSH_KNOWN_HOSTS` 的值：

```bash
{ printf '120.48.9.69 '; cat /etc/ssh/ssh_host_ed25519_key.pub; }
```

工作流强制校验此主机公钥，不使用关闭主机校验或无验证的 ssh-keyscan。创建 Secrets 后，从开发分支向 `production` 合入准备发布的提交。

当前部署脚本要求：

- 宿主机 nginx，站点配置 `/etc/nginx/conf.d/daoyou-ip.conf`，API upstream `/etc/nginx/conf.d/upstream/backend.conf`。
- 游戏静态根目录 `/srv/jiuxiaodaoji/game`；API 蓝/绿实例为 `daoyou-app-blue` / `daoyou-app-green`，回环端口 3000 / 3001。
- Docker Compose，以及已启动的 PostgreSQL 17、Redis、NATS和外部网络 `daoyou-runtime`。
- `/opt/daoyou/.env.production`，其 DATABASE_URL 在 Docker 网络内可用；现有依赖的环境文件继续保留。
- `python3`、`curl`、`flock`、`tar` 和服务器到 Docker Hub/pnpm 包仓库的网络连接。

## 每次发布

工作流按同一提交打包三份事实：API 镜像 digest、游戏 SPA、用于迁移的完整源码，并写入 `release.json`。前端原有 `version.json` 的 buildId 使用该提交 SHA。

API 镜像同时发布 `sha-<完整提交 SHA>` 和兼容查询用的 `latest`；服务器始终使用 `kuankuan/daoyou-app@sha256:...`。GitHub 发布包保留30天，包含迁移源码；前端中间产物保留14天。

服务器发布顺序：

1. 上传至 `/opt/daoyou/incoming/<run-id>-<attempt>.tgz`，获取发布锁，核对提交、运行 ID、镜像 namespace/digest 和前端 buildId。
2. 解压至 `releases/<SHA>/<run-id>-<attempt>/`，拉取镜像并安装该版本的迁移工具。此时仍提供旧版服务。
3. 创建 `/opt/daoyou/maintenance`，nginx 对新 HTTP/WS 请求返回503；停止两色API实例并等待最多75秒排空，关闭 cron/消息写入。
4. 备份完整 PostgreSQL 至 `backups/<SHA>-<run-id>-<attempt>.dump`，检查备份非空及 pg_restore 可读取其目录。
5. 在现有Docker网络、显式生产配置下执行认证迁移，再执行业务迁移。根 `pnpm run db:migrate` 绑定本地环境，不能用于此处。
6. 复用蓝绿脚本启动目标 digest、检查新 API、校验并 reload nginx，再将游戏静态根目录切到本次 `web/`。
7. 解除维护，核对公网 `/api/health-check` 和 `/version.json`；成功后更新 `/opt/daoyou/current`。

发布期间有维护窗口，不宣称整站无停机。依赖服务和数据卷不会重建。第一次遇到游戏静态目录是普通目录时，保留为 `game.pre-actions-<run-id>-<attempt>`，随后使用软链接。

重跑失败的 deploy job 会读取原 publish job 的产物，并使用新部署 attempt 目录；不会重新构建或覆盖正在使用的版本。

## 失败与恢复

准备阶段失败不停止旧 API。维护开始后的失败会保留维护标记、发布目录、数据库备份和旧镜像/静态入口信息，GitHub 作业报告失败。此时禁止不经检查直接重试或自动恢复旧应用：数据库可能已经迁移。

发布目录记录：

| 文件 | 用途 |
| --- | --- |
| `release.json` | 本次镜像、提交与构建运行 |
| `previous-image` | 旧容器的本地镜像 ID，避免 latest 漂移 |
| `previous-web` | 旧游戏静态目录 |
| `previous-upstream.conf` | 旧 nginx upstream |
| `database-backup` | 迁移前的 PostgreSQL 备份路径 |
| `previous-release` | 上一次 Actions 发布目录，首次可能不存在 |

恢复前审查已执行迁移是否兼容旧版本。兼容时可在维护状态下用蓝绿脚本启动 previous-image（本地镜像使用 `PULL_IMAGE=0`），将游戏软链接恢复到 previous-web；核对 API/前端后删除维护标记。数据库无自动 down migration。不兼容时保持维护并决定修复或恢复方案；恢复 PostgreSQL 时还需考虑 Redis/NATS 中尚未消费的状态，不能孤立回滚一份数据库。

备份目录结构可读不等于实际恢复成功，首次正式上线仍需完成隔离恢复与目标环境发布/回滚验收。

## /opt/daoyou 是否可以清空

不能整目录删除。新流水线成功接管后，根目录旧源码和 node_modules 可逐项评估清理，但必须先核对实际容器挂载、运行配置及人工恢复路径。

必须保留：生产及依赖环境文件、`releases/`、`current`、`backups/`、维护标记（失败恢复期间），以及当前依赖使用的 Compose/配置文件。尤其旧 NATS 容器可能绑定挂载 `/opt/daoyou/scripts/nats-server.conf`，删除根 scripts 会破坏后续重启。

本流水线不自动删除历史目录、旧压缩包、环境文件或 Docker 数据卷；尚未验证新发布成功前，不清理现有安装。
