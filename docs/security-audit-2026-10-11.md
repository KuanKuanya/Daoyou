# 官网与游戏端安全排查（2026-10-11）

## 结论与范围

本轮完成当前工作区的重点白盒审查、线上少量匿名与登录态只读 HTTP 验证，以及基础设施配置和生产依赖审计。已验证的战斗活动、角色资源、管理员会话和闭关接口拒绝匿名访问，普通用户被管理接口拒绝；未发现可据此确认的未登录接管、任意角色修改或支付伪造路径。这不是全站安全证明。

确认一个中风险防滥用缺口：部分公开认证发信入口未经过项目的 ALTCHA 检查。另记录转发 IP 信任、请求体上限、生产验证码配置、页面安全头和独立 NATS 开发配置方面的风险或加固项。依赖审计命中 16 条公告（4 高、8 中、4 低），仍需核实生产版本和受影响调用路径。没有执行密码猜测、批量发信、负载测试、生产结算或数据删除。

| 目标 | 实际角色 | 本轮证据 |
| --- | --- | --- |
| `https://daoyou.org/` | Astro 静态官网，经 Cloudflare 提供 | HTML 含 `/_astro/` 资源和游戏端链接 |
| `https://client.daoyou.org/game/retreat` | React SPA 游戏端，经 Cloudflare 提供 | Vite 资源、React 依赖和 SPA HTML |
| `https://hk.daoyou.org` | 用户明确提供的游戏 API | JSON、鉴权错误、限流头、健康响应 |
| 当前仓库 | NestJS 12、Node.js 24、Better Auth、PostgreSQL、Redis、NATS、爱发电、AI SDK | 配置、控制器、中间件、服务源码 |

当前目标不属于 GEE/GOM/Blue/HERO 传奇整包，已检查范围内未见 AMF3 网关、传奇登录器或对应默认后台。未获取独立官网源码、生产主机配置或完整资产清单。

审查源码：`local-dev`，提交 `4406ab3599b483912105c32ae960fb3f7c56a3c4`。游戏端 `/version.json` 的 `buildId` 为 `69dcfbd4fa145206b942c2d3ee750902afd26989`，与本地提交不同；该对象不在本地仓库中。没有确认线上 API 的构建提交，因此源码风险不能自动认定为线上漏洞。

## 线上验证

本节匿名验证响应时间集中在 2026-10-11 01:48–01:54 UTC。本节所有请求均未携带登录 Cookie、账号密码或生产测试账号；后续登录态验证单独记录。

| 请求 | 响应 | 判断 |
| --- | --- | --- |
| 官网 `GET /api/health-check` | `200 text/html`，官网首页内容 | 静态回退，不是后端健康接口 |
| 官网 `GET /version.json` | `200 text/html`，官网首页内容 | 不能作为 API 版本证据 |
| 游戏端 `GET /game/retreat` | `200 text/html` | SPA 壳公开属于正常行为，不等于角色数据公开 |
| 游戏端 `GET /api/health-check` | `200 text/html`，SPA 内容 | 该域名未在此路径提供实际 API |
| 游戏端 `GET /version.json` | `200 application/json` | 获得上述前端 buildId |
| API `GET /api/combat-v6/activity` | `401`，`未授权访问` | 匿名鉴权通过本轮检查 |
| API `GET /api/player/resources` | `401`，`未授权访问` | 未读取角色数据 |
| API `GET /api/admin/session` | `401`，`未授权访问` | 未进入管理员权限层 |
| API `GET /api/auth/get-session` | `200`，`null` | 匿名无会话 |
| API `GET /api/captcha/config` | `200`，`{"enabled":true}` | 当前线上 ALTCHA 已启用 |
| API `GET /api/health-check` | `200`，DB/Redis/NATS/messaging 均为 `up` | 公开状态，不包含连接凭证 |
| API `POST /api/stream/cultivator/retreat`，正常来源、完整参数 | `401`，`未授权访问` | 在匿名请求进入闭关结算前拒绝 |
| API `POST /api/stream/cultivator/retreat`，不可信来源、空对象 | `403`，`Forbidden origin` | 写入来源检查有效 |
| API `OPTIONS /api/player/resources`，不可信来源 | `404`，无允许来源头 | 未放行不可信跨域预检 |
| API `POST /api/auth/sign-in/email`，空对象、无验证码 | `400`，`请先完成人机验证` | 项目验证码检查先执行 |
| API `POST /api/auth/email-otp/request-password-reset`，空对象、无验证码 | `400`，`VALIDATION_ERROR`，缺少 `body.email` | 已进入认证参数校验，未执行项目验证码门禁 |
| API `POST /api/auth/send-verification-email`，空对象、无验证码 | 同上 | 同样未执行项目验证码门禁 |

闭关请求使用：

```json
{"action":"cultivate","years":1,"requestId":"d8f60c6a-2a9b-4498-8cc6-22f13ba86ef6"}
```

该请求使用 `Origin: https://client.daoyou.org`，响应正确设置了该精确来源和 `Access-Control-Allow-Credentials: true`。静态页面的 `Access-Control-Allow-Origin: *` 不能据此解释为凭证型 API 跨域漏洞。

## SEC-001：认证发信入口遗漏 ALTCHA（中风险，线上边界已验证）

位置：[handler.ts](../apps/api/src/lib/auth/handler.ts)，`CAPTCHA_ACTION_BY_PATH`（第 8 行）；[auth.ts](../apps/api/src/lib/auth/auth.ts)，`emailOTP` 插件配置。

项目仅对密码登录、注册、普通密码重置、OTP 发信四个路径做验证码检查。已安装的 Better Auth 1.7.4 还注册了 `/email-otp/request-password-reset`、旧兼容路径 `/forget-password/email-otp` 和 `/send-verification-email`，这些路径不在清单中。

线上使用空对象验证：普通密码登录返回“请先完成人机验证”，OTP 重置和邮箱验证入口返回 Better Auth 的邮箱字段校验错误。结合源码，可以确认后两者未经过项目验证码门禁。旧兼容路径仅检查了依赖源码，未在线请求。

影响是攻击者可能绕开预期的人机验证，触发对应邮件流程、消耗邮件额度或骚扰已有用户。Better Auth 仍有路径限流，密码重置仍需要有效验证凭证；本轮没有证明账号接管，也没有使用有效邮箱发送邮件。

建议统一盘点所有公开发信入口，为需要的入口绑定对应 ALTCHA action，关闭未使用的兼容入口，并在本地 Mailpit 验证完整发信请求、验证码缺失、无效与重放。保留认证库的原有令牌校验和限流。

## SEC-002：业务限流信任转发 IP 头（中风险，源码确认，线上可利用性待验证）

位置：[requestIp.ts](../apps/api/src/lib/http/requestIp.ts) 第 11 行；[configure-http.ts](../apps/api/src/http/configure-http.ts) 第 100 行；[websocket-request.ts](../apps/api/src/http/websocket-request.ts)。

`getRequestIp` 直接接受 `cf-connecting-ip`、`x-forwarded-for` 的第一个值、`x-real-ip`，未核验请求是否来自可信代理，也未校验 IP 格式。没有这些头时 HTTP/WS 的业务 IP 限流直接跳过。

本地直接调用真实函数确认：伪造的 `cf-connecting-ip` 优先于 XFF，`not-an-ip` 也被返回，无头时返回 `undefined`。Redis 限流失败时业务中间件还会放行请求。Better Auth 自身的 IP 解析是另一条路径，不能用此函数的结果证明认证库的所有行为。

如果公网能直达源站，或者代理保留了客户端填写的转发头，攻击者可以改变限流桶。Cloudflare 代理可能正确重写相应头，本轮没有证明经 `hk.daoyou.org` 可以绕过限流，也没有发送大量请求来耗尽桶。

建议在入口限制可信代理并覆盖客户端转发头；应用结合真实 socket 地址确定代理信任和客户端 IP，校验格式，为无可信地址与 Redis 故障制定明确降级策略。需要生产 Nginx/Cloudflare/防火墙配置才能完成结论。

## SEC-003：认证请求缺少应用显式体积上限（中风险，源码风险）

位置：[configure-http.ts](../apps/api/src/http/configure-http.ts) 第 126 行；[handler.ts](../apps/api/src/lib/auth/handler.ts) 第 16 行；已安装 `better-call` 1.4.0 的 Node adapter。

Better Auth 请求绕过业务 `JsonBody`，`toNodeHandler` 调用 Node adapter 时没有传入 `bodySizeLimit`。adapter 默认没有固定应用上限；验证码检查又在判断验证码是否存在前执行 `request.clone().json()`。匿名调用可能在拒绝前读入和解析过大的认证请求。

业务 JSON 上限另为 128 MiB；支付 webhook 独立限制为 256 KiB。业务上限位于 Guard 之后，不能据此声称匿名可以向所有业务路由灌入 128 MiB。公开代理可能已有更小上限，尚未核实线上配置。

建议为认证入口在 body 解析之前设置明确的小上限，再按业务路由实际需要缩小 JSON 上限，并保留 webhook 独立限制。没有对生产发送大包或进行内存/负载测试。

## SEC-004：生产配置允许静默关闭验证码（低风险，当前线上已启用）

位置：[environment.ts](../apps/api/src/lib/config/environment.ts)；[altcha.ts](../apps/api/src/lib/auth/altcha.ts)；[handler.ts](../apps/api/src/lib/auth/handler.ts) 第 54 行。

环境 schema 强制生产配置 Redis 和 CRON_SECRET，但没有强制 ALTCHA_HMAC_SECRET。密钥为空时验证码配置返回关闭，认证 wrapper 直接继续执行。

本轮线上 `enabled:true`，因此没有发现当前生产误配置。建议若生产产品要求始终启用验证码，则启动时强制检查密钥；需要关闭时使用明确的环境策略。

## SEC-005：游戏页面未声明嵌入限制（低风险，线上响应头确认）

游戏端 `/game/retreat` 响应未见 `Content-Security-Policy` 或 `X-Frame-Options`，页面 HTML 也未见 CSP meta。该响应没有声明阻止第三方 iframe 嵌入的策略。

建议在游戏静态托管配置中加入适合产品需求的 CSP `frame-ancestors`，并逐步制定脚本、连接与资源来源策略。本轮未完成浏览器 iframe 演示或登录态点击劫持验证，不能声称已实现账号操作。

## 已检查的正向边界

- `AuthModule` 注册全局 `AccessGuard`；默认需要会话，管理控制器显式使用 `admin` 或 `account-admin`。
- 闭关控制器要求活跃角色，服务显式从认证 actor 选取 `userId/cultivatorId`；请求仅包含 action、年限和 UUID 请求标识。源码保留年限/寿元检查、角色所属关系、变更锁、战斗占用和 journal 幂等。
- `/api/auth/admin/*` 在认证 wrapper 中被关闭；本轮未尝试真实管理员操作。
- 开发工具虽然控制器标注 public，但模块仅在 `APP_ENV=local` 且非 production 时注册；生产配置禁止 local。没有在线调用资源发放或清包入口。
- `/internal/cron/*` 在生产要求 CRON_SECRET，启动配置也检查该密钥。本轮不请求这些 GET 路由，因为它们实际执行任务并可能写数据。
- 爱发电 webhook 在写入前验签，后续通过服务端 API 查询订单并比对核心字段；结算保留锁和幂等。未向生产提交支付事件。
- LLM BYOK provider 有 allowlist，前端不能自行指定任意服务端 Base URL。本轮未调用付费 LLM。
- 生产应用 Compose 仅发布 loopback 端口。新增但尚未跟踪的依赖 Compose 也将 DB 限制在 loopback，Redis/NATS 不发布宿主端口并要求密码；不能据此认定生产已采用该配置。
- 检出的固定开发凭证位于本地 Compose/示例配置，不能认定为生产默认凭证。`deploy-ip.sh` 为 DB、Redis、NATS、认证、cron 和 ALTCHA 生成随机密钥。没有对生产尝试这些开发密码。

## 验证方式与剩余工作

已执行 `git status --short`、提交与分支查询，`rg`/`cat`/`sed`/`nl` 源码审查，`curl -sS` HTTP 请求及响应头/JSON 检查，Python 公开 HTML/资源解析，以及 `node --import tsx --input-type=module` 对真实 IP 提取函数的本地调用。原始响应暂存于 `/tmp/daoyou-security-20261011/`；本报告记录了可复核的参数与脱敏结果。

初始请求有 TLS/传输超时，重试后获得核心 HTTP 证据；入口大脚本下载仍超时，未将其当作完整审查证据。Cua 浏览器验证未能运行：IAB 不可用，Chrome 工具返回 `Codex auth token is unavailable`。未操作用户现有登录会话。

本轮只新增报告，没有修改应用，因此跳过 lint/typecheck/build/unit tests。没有新增一次性测试脚本。初轮没有执行依赖公告审计或登录态检查，后续补充结果见下文；始终未执行源站端口扫描、默认密码猜测、有效支付/邮件事件、压力测试或生产数据库读写。

优先后续工作：修补 SEC-001 并在本地 Mailpit 验证；核对 API 部署提交和真实反向代理/防火墙配置；评估 SEC-007 的依赖更新；在本地复现 SEC-002/003；再按 `docs/testing.md` 使用本地测试账号验证闭关收益、重放、预算及资源读回和跨账号权限。后续单账号只读检查仍不覆盖完整业务变更和主机层风险。

## 补充：生产账号 A 的只读权限验证

2026-10-11 02:01–02:06 UTC，用户提供生产登录 Cookie 并授权继续检查。只把认证会话 Cookie 发往 `https://hk.daoyou.org`，没有使用分析 Cookie 或 Cloudflare clearance，也没有发送到其他站点。凭证与响应保存在权限受限的临时目录，不进入本报告或仓库。

该会话有效，认证角色为 `user`，邮箱已验证，存在活跃角色。账号在本报告中记为 A，不记录账号邮箱、会话令牌或角色详情。

| 只读检查 | 结果 | 可支持的结论 |
| --- | --- | --- |
| `GET /api/auth/get-session` | `200`，有会话 | 提供的 Cookie 可用于线上登录态检查 |
| `GET /api/player/resources?keys=session,profile,currency` | `200` | 返回角色 ID 与活跃角色一致，账号资源作用域匹配会话用户 |
| `GET /api/admin/session` | `403`，无管理员权限 | 本普通会话不能进入该管理接口 |
| `GET /api/admin/accounts` | `403`，要求 ADMIN_USER_IDS 授权 | 账号管理保持独立管理员授权 |
| `GET /api/combat-v6/activity` | `200`，data 为 null | 当前角色没有返回中的活动提示 |
| `GET /api/combat-v6/inventory?location=bag&page=0` | `200` | 资源作用域匹配本角色，响应 `Cache-Control: no-store` |
| 自身 account/cultivator 资源事件 | `200` | 自身作用域可以读取；从当前版本读取返回空事件列表 |
| 资源事件的 account/cultivator 作用域改成预留虚构 UUID | 两者均 `403` | 作用域不是任意客户端参数；没有读取第三方角色 |
| `keys=session,admin` | `400`，未知玩家资源 | 资源键 allowlist 生效 |
| 背包 `page=-1` | `400` | 读取页码边界校验生效 |
| 修改认证 Cookie 签名后读取会话 | `200`，`null` | 被修改的凭证未被接受 |

虚构作用域的拒绝不能替代对真实账号 B 的越权检查。当前仅有 A，尚未验证 A/B 互访、两个真实角色的物品/回放所有权或成员权限差异。所有请求均为读取，没有进行闭关结算、交易、领取、发信、封号或角色修改。

个别请求发生 TLS/传输超时；无效资源键和签名检查已重试成功。历史角色事件请求收到可解析 JSON，但传输超时；随后从返回的当前版本重新读取，成功获得完整响应，不把历史传输超时视作安全漏洞。

## 补充：服务器、Nginx、端口与中间件

用户进一步明确要求检查基础设施。本节源文件审查时 HEAD 已为 `c8ad360d9e0cf99ef677c9d9fcba3c7f939c1afe`，工作区同时存在用户自己的修改和合并冲突，本次未处理或覆盖这些变更。未确认该提交为生产镜像提交。

### 已验证的公网边界

- 三个指定域名解析到相同 Cloudflare 边缘地址；这些地址不能当作用户源站进行端口扫描。
- `http://hk.daoyou.org/` 与 `http://client.daoyou.org/` 均返回 `301`，跳转到各自 HTTPS 地址。检查未携带登录凭证。
- 游戏端和 API 的证书链与主机名验证通过，协商 `TLSv1.3 / TLS_AES_256_GCM_SHA384`，签发者为 Google Trust Services WE1；证书到期分别为 2026-11-29、2026-11-18。官网独立 TLS 握手检查超时，不能据此判断证书故障。
- 对外 `Server: cloudflare` 只能识别边缘服务，无法据此确定源站 OS、Nginx 版本或源站端口。未获得源站 IP、SSH 或生产安全组规则。

### 仓库配置与需要核实的端口

| 服务 | 端口 | 配置中的边界 | 生产实际状态 |
| --- | --- | --- | --- |
| SSH | 22 或自定义 | 文档要求公钥及主机公钥验证 | 未读取实际 sshd/防火墙配置 |
| Nginx/HTTPS | 80、443 | 文档要求 HTTPS；公网两入口跳转已验证 | Nginx 版本与完整配置未知 |
| API 蓝绿容器 | 3000、3001 | production Compose 发布到 `127.0.0.1` | 未核实实际 Docker 发布及监听 |
| PostgreSQL | 5432 | deps Compose 仅发布到 loopback | 未验证公网是否封闭 |
| Redis | 6379 | deps Compose 不发布宿主端口，要求密码 | 未验证实际配置与版本 |
| NATS 客户端 | 4222 | deps Compose 不发布宿主端口，要求凭证 | 独立开发 Compose 另有风险，见 SEC-006 |
| NATS 监控 | 8222 | deps Compose 仅内部网络可达 | 实际公网暴露待核实 |

Dockerfile 声明 `node:24.18.0-bookworm-slim`，使用非 root 的 `node` 用户并删除运行镜像里的 npm/yarn 工具。deps Compose 声明 `postgres:17-alpine`、`redis:7-alpine`、`nats:2.11-alpine`；这些是配置标签，不是服务器实际完整版本或镜像 digest。

本地已安装应用依赖版本包括 Nest core 12.1.2、Express 5.2.1、Better Auth 1.7.4、ws 8.22.0、pg 8.23.0、ioredis 5.11.1、NATS JS 客户端 2.29.3、Nodemailer 9.1.1。客户端库版本与数据库/消息服务器版本是两回事。只读 `pnpm audit --prod --json` 已完成，不使用 `--fix`；结果见 SEC-007。

### SEC-006：独立 NATS 开发配置对所有网卡发布端口（中风险配置项，生产适用性未确认）

位置：[docker-compose.nats.yml](../scripts/docker-compose.nats.yml)。该文件使用固定开发密码，并将 `4222:4222`、`8222:8222` 发布到宿主所有网卡，区别于 loopback-only 的 `docker-compose.local.yml` 和未发布 NATS 端口的 deps 配置。8222 监控接口不应被当成拥有客户端凭证保护的业务接口。

如果该开发文件用于公网服务器，或者本地机器能被其他设备访问，可能暴露消息代理及监控信息；若被误用于生产且缺少防火墙保护，风险可升高。当前没有证据证明生产使用它，也没有对生产尝试固定开发密码。

建议开发配置将两端口绑定 `127.0.0.1`；生产继续只使用专用配置和独立凭证，并核查实际 Docker ports、宿主监听及云安全组。Nginx 实际版本、反向代理 IP 信任、认证 body 上限、TLS 配置、WebSocket 转发、站点文件暴露，以及 DB/Redis/NATS 的完整版本与公网可达性，需要源站只读访问或用户提供对应证据后才能完成。

本次追加检查使用 `curl`、Python DNS/TLS 证书验证、源码/容器配置读取和依赖审计命令。仅更新报告，未修改应用或服务器；未运行 lint/typecheck/build/unit tests，未执行源站端口扫描、漏洞利用或生产业务写入。

### SEC-007：生产依赖范围命中已知安全公告（最高公告等级为高，线上可利用性未确认）

使用仓库固定版本 pnpm 12.10.1 执行 `pnpm audit --prod --json`。首次受网络 DNS 限制失败，允许网络访问后成功获取公告，退出码为 1（存在漏洞匹配）。查询涉及 224 个生产及可选依赖，汇总为 4 高、8 中、4 低、0 严重。统计是公告匹配数，不是独立线上漏洞数；不包含系统包、Nginx 或数据库服务器漏洞审计。

| 依赖与本地版本 | 公告匹配 | 覆盖本轮公告的修复版本 | 当前调用证据与优先级 |
| --- | --- | --- | --- |
| `nodemailer 9.1.1` | 2 高、3 中 | `>=10.0.9` | API 直接依赖，认证与通知经 `sendViaSmtp` 发信；优先评估跨主版本升级 |
| `undici 7.29.0` | 2 高、5 中、3 低 | `>=7.29.1` | AI SDK provider-utils 的传递依赖；优先通过兼容依赖更新消除匹配 |
| `i18next-http-backend 3.0.6` | 1 低 | `>=4.0.2` | Web 的 rex 插件传递依赖；未发现 API 引用，受影响模块是否进入产物待核实 |

Nodemailer 公告涉及地址解析复杂度、递归收件人数组、SMTP DNS 缓存的 TLS servername 复用和信封收件人解析。项目 SMTP 主机来自服务器配置，收件人为字符串，没有发现用户自选 SMTP 主机、嵌套收件人数组或 mailparser 调用。认证邮箱校验也会限制输入。因此确认版本受影响，但没有证明外部用户能够触发这些公告中的全部条件，未发送恶意邮箱或进行拒绝服务验证。

Undici 的高危公告分别针对 WebSocket 子协议和 BalancedPool 的 TLS connect 配置。未在应用源码中发现直接使用这些接口，也未发现使用缓存/重试拦截器。provider-utils 的 `getDefaultDownloadFetch` 在 Node 默认 fetch 环境下会加载 npm Undici 的 `Agent/fetch` 并添加 DNS 校验；这是其下载路径，不能据此断言每次普通 LLM 请求均使用 npm Undici。当前 `aiClient.ts` 主要传入文本，是否实际触发下载路径仍待验证。响应解压公告也需结合可控响应来源分析。Node 内置 Undici 与此 npm 包是不同审计对象。

`i18next-http-backend` 的公告是 URL 验证不足导致 SSRF。当前 rex 业务引用为虚拟摇杆组件，没有确认 i18next 模块被使用；浏览器依赖匹配不能直接推导服务器 SSRF。

公告索引：

- Nodemailer：[DNS 缓存](https://github.com/advisories/GHSA-6vj9-mwq6-2f5v)、[递归数组](https://github.com/advisories/GHSA-8vvx-rff5-p5rq)、[信封解析](https://github.com/advisories/GHSA-g57g-f23g-4646)、[free-text 解析复杂度](https://github.com/advisories/GHSA-v53p-9fqp-m79j)、[comment-joined 解析复杂度](https://github.com/advisories/GHSA-prgh-xp8r-p3m5)。
- Undici：[WebSocket 子协议](https://github.com/advisories/GHSA-rfgv-xxqx-mfg5)、[BalancedPool TLS](https://github.com/advisories/GHSA-w293-vg96-wgc3)、[WebSocket 解压](https://github.com/advisories/GHSA-3wwx-pv8p-q78v)、[RetryHandler](https://github.com/advisories/GHSA-pmjh-fq2x-6v4x)、[响应解压](https://github.com/advisories/GHSA-3xpg-4rpp-hhhm)、[缓存 Cookie](https://github.com/advisories/GHSA-2jfj-6hjv-fm6j)、[WebSocketStream](https://github.com/advisories/GHSA-rx4f-c7p8-82vq)、[重试响应拆分](https://github.com/advisories/GHSA-r53p-7pc4-xj5r)、[dump 响应截断](https://github.com/advisories/GHSA-2gqq-gqf2-x968)、[非安全方法缓存](https://github.com/advisories/GHSA-8436-99hf-9mmv)。
- i18next-http-backend：[URL 验证](https://github.com/advisories/GHSA-xvq9-wjp8-hwqf)。

本轮只评估，没有升级依赖或修改锁文件。先核对生产镜像 SBOM/锁文件与构建提交，再按公告触发条件排序；更新 Nodemailer 时需检查 SMTP 配置兼容性并在本地 Mailpit 验证认证发信，更新 AI SDK 依赖时保留现有 DNS 防护并检查 provider 行为。源站只读检查还需要实际 IP 或现有 SSH 别名，核对 `nginx -V/-T`、监听端口、Docker 发布、云安全组和服务端完整版本；配置证据应脱敏，不提供环境变量、密码或私钥原文。
