import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/cordis-plugin-loader';
import type { ToolDefinition } from '@deepseek-ai/dsh-tools';
import { TIER_CHOICES } from './config.js';
import { mutateTier, readTierState } from './tier-ops.js';

/** UI、命令与 Agent 工具共用宿主 settings.mutate，没有第二套持久化路径。 */
export function tierTool(ctx: Context): ToolDefinition {
  return {
    name: 'openrouter_service_tier',
    description: '读取或修改 原生 OpenRouter 请求档位。改全局档位会影响当前 profile 所有会话，只对新准备请求生效；带 model 时只覆盖该模型。不发送模型请求、不改凭据或 thinking。写入前先 get 取得 revision。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['get', 'set', 'reset'], description: 'get 读取当前全局档位与按模型覆盖；set 设置；reset 恢复全局继承或删除模型有效覆盖（可能写入空数组屏蔽底层）。' },
        tier: { type: 'string', enum: [...TIER_CHOICES], description: '仅 set 使用；omit 表示不发送 service_tier 参数。priority/fast/ultrafast 可能提高费用。' },
        model: { type: 'string', description: '可选。给出模型 id 时只修改该模型的覆盖，不影响全局档位。' },
        expectedRevision: { type: 'integer', minimum: 0, description: 'set/reset 必填，使用最近 get 返回的 revision，防止覆盖他人的修改。' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          namespace: { type: 'string' },
          global: { type: 'string', description: '未设置时为 inherit。' },
          overrides: {
            type: 'array',
            items: { type: 'object', properties: { model: { type: 'string' }, tier: { type: 'string' } }, required: ['model', 'tier'], additionalProperties: false },
          },
          revision: { type: 'integer' },
          applies: { type: 'string' },
        },
        required: ['namespace', 'global', 'overrides', 'revision', 'applies'],
        additionalProperties: false,
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    isConcurrencySafe: (args) => (args as { action?: unknown })?.action === 'get',
    async execute(args) {
      const input = args as { action?: unknown; tier?: unknown; model?: unknown; expectedRevision?: unknown };
      if (!input || !['get', 'set', 'reset'].includes(String(input.action))) throw new Error('action 必须是 get、set 或 reset');
      if (input.model !== undefined && (typeof input.model !== 'string' || input.model.length === 0)) throw new Error('model 必须是非空模型 id');
      if (input.action !== 'get') {
        if (!Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision) < 0) throw new Error('修改前请 get 并提供 expectedRevision');
        if (input.action === 'set' && !(TIER_CHOICES as readonly string[]).includes(String(input.tier))) throw new Error('不支持的请求档位');
        const tier = input.action === 'reset' ? 'inherit' as const : input.tier as typeof TIER_CHOICES[number];
        const change = typeof input.model === 'string' ? { kind: 'model' as const, model: input.model, tier } : { kind: 'global' as const, tier };
        await mutateTier(ctx, change, Number(input.expectedRevision));
      }
      const state = readTierState(ctx);
      return {
        namespace: state.namespace,
        global: state.global ?? 'inherit',
        overrides: state.overrides.map((entry) => ({ model: entry.model, tier: entry.tier })),
        revision: state.revision,
        applies: '后续请求；当前 profile 所有会话',
      };
    },
  };
}

export function registerTierSettings(ctx: Context): void {
  ctx.inject(['settings', 'tools'], (child) => {
    child.effect(() => child.tools.register(tierTool(child)));
  });
}
