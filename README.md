# weappdev-skill

**WeAppDev** 的 Agent Skill。WeAppDev 是一个脱离微信运行小程序、并内置完整调试器的 Android 应用，
本仓库教会 AI 助手怎么用它：抓包、云开发、Native 捕获、逆向签名、断点、WebSocket、UI 自动化、写插件。

- 应用仓库（本体，不开源，只发 APK）：<https://github.com/RYF5584/weappdev>
- MCP 服务（本 Skill 依赖）：<https://github.com/RYF5584/weappdev-mcp>
- 官网文档：<https://weappdev.top>

## 安装

这个仓库本身就是 Skill（`SKILL.md` 在根目录），一条命令装好：

```bash
npx -y skills add RYF5584/weappdev-skill
```

常用变体：

```bash
npx -y skills add RYF5584/weappdev-skill -g          # 装到全局（~/.claude/skills 等），所有项目可用
npx -y skills add RYF5584/weappdev-skill -a claude-code   # 只装到指定客户端
npx -y skills add RYF5584/weappdev-skill -l          # 先看仓库里有哪些 skill，不安装
```

装完在支持 Agent Skills 的客户端里新开一个会话就生效。

### 手动安装（没有 Node）

```bash
git clone https://github.com/RYF5584/weappdev-skill.git
mkdir -p ~/.claude/skills
cp -r weappdev-skill ~/.claude/skills/weappdev     # 克隆下来的目录直接就是 skill 目录
```

或者下载仓库 ZIP 解压，把文件夹改名为 `weappdev` 放进客户端的 skills 目录。放软链接也可以。

## 先装 MCP

Skill 只是说明书，真正干活的是 MCP 工具。客户端里加一次配置：

```json
{
  "mcpServers": {
    "weappdev": {
      "command": "npx",
      "args": ["-y", "@ryf5584/weappdev-mcp"]
    }
  }
}
```

`@ryf5584/weappdev-mcp` 负责自动发现设备并聚合多台手机。也可以跳过它直连手机
（`http://<手机IP>:9400/mcp`），单设备时更省事，细节见 `reference/connection.md`。

前置条件：手机上装好并打开 WeAppDev；用 USB 时本机需要 `adb`。

## 里面有什么

```
SKILL.md                 入口，按任务路由到下面的文件
reference/
  connection.md          直连 vs 聚合、选设备、"没设备"排查
  reverse-engineering.md 定位接口 → 断点 → 求值 → 还原算法
  network-capture.md     HTTP 抓包、重放、改写、hooks
  cloud-capture.md       云开发调用、密钥、V3 解密
  pure-protocol.md       纯协议打云开发：js-login、HostSign、tcbapi、风控码含义
  native-capture.md      JSAPI 信封层、凭证、实时改写
  websocket.md           帧收发、阻断、改写
  automation.md          快照/点击/填写/截图/等待、批量调用
  plugins.md             插件格式、API、开发调试全流程
  tools.md               全部 64 个工具的入参
  troubleshooting.md     错误码与症状排查
examples/                按场景给的可直接抄的调用序列
scripts/                 环境检查与 MCP 调用脚本（.py / .sh / .mjs 各一份，不用装运行时）
```

`SKILL.md` 故意写得很短，只做路由，这样 AI 一次只加载需要的那一页。

## 校验

```bash
node scripts/validate-skill.mjs
```

检查 frontmatter 是否符合 Agent Skills 规范、相对链接是否都能打开、`SKILL.md` 是否超长。CI 每次 push 都会跑。

## 关于语言

`SKILL.md`、`reference/`、`examples/` 是英文：内容由 AI 读取，单一语言检索更准。
这份 README 是给人看的，所以用中文。

## License

MIT
