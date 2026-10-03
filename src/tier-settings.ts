import type { Context } from '@deepseek-ai/cordis';
import type Settings from '@deepseek-ai/dsh-settings';
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings';
import type {} from '@deepseek-ai/cordis-plugin-loader';
import type { ToolDefinition } from '@deepseek-ai/dsh-tools';
import { SERVICE_TIERS } from './config.js';

/** UI 与 Agent 均使用宿主 settings.mutate，避免第二套配置或持久化逻辑。 */
export function tierTool(settings: Settings, ns: string): ToolDefinition {
  const read = () => {
    const entry = settings.describe({ redactSecrets: true }).find((item) => item.ns === ns);
    if (!entry) throw new Error('当前插件配置不可用，请确认插件已启用');
    return entry;
  };
  return {
    name: 'openrouter_service_tier',
    description: '读取或修改 OpenRouter Service Tier 插件的请求档位。修改会持久化并影响当前 profile 的所有会话，仅对后续请求生效，不发送模型请求、不改凭据或 thinking。先 get 取得 revision，再 set 或 reset。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['get', 'set', 'reset'], description: 'get 读取当前值；set 设置档位；reset 恢复 bundle 默认值。' },
        tier: { type: 'string', enum: [...SERVICE_TIERS, 'omit'], description: '仅 set 使用；omit 表示不发送 service_tier 参数。priority/fast/ultrafast 可能提高费用。' },
        expectedRevision: { type: 'integer', minimum: 0, description: 'set/reset 必填，使用最近 get 返回的 revision，防止覆盖他人的修改。' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: { namespace: { type: 'string' }, tier: { type: 'string' }, revision: { type: 'integer' }, applies: { type: 'string' } },
        required: ['namespace', 'tier', 'revision', 'applies'],
        additionalProperties: false,
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    isConcurrencySafe: (args) => (args as { action?: unknown })?.action === 'get',
    async execute(args) {
      const input = args as { action?: unknown; tier?: unknown; expectedRevision?: unknown };
      if (!input || !['get', 'set', 'reset'].includes(String(input.action))) throw new Error('action 必须是 get、set 或 reset');
      if (input.action !== 'get') {
        if (!Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision) < 0) throw new Error('修改前请 get 并提供 expectedRevision');
        if (input.action === 'set' && input.tier !== 'omit' && !SERVICE_TIERS.includes(input.tier as typeof SERVICE_TIERS[number])) throw new Error('不支持的请求档位');
        await settings.mutate(ns as SettingsNamespace, input.action === 'reset'
          ? [{ op: 'unset', path: ['serviceTier'] }]
          : [{ op: 'set', path: ['serviceTier'], value: input.tier === 'omit' ? null : input.tier }], Number(input.expectedRevision));
      }
      const state = read();
      return { namespace: ns, tier: (state.value as { serviceTier?: string }).serviceTier ?? 'omit', revision: state.revision, applies: '后续请求；当前 profile 所有会话' };
    },
  };
}

export function registerTierSettings(ctx: Context): void {
  const ns = ctx.fiber.entry?.options.id;
  if (!ns) return;
  ctx.inject(['settings'], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));
  });
  ctx.inject(['settings', 'tools'], (child) => {
    child.effect(() => child.tools.register(tierTool(child.settings, ns)));
  });
}
