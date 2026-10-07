import type { Context } from '@deepseek-ai/cordis';
import type Settings from '@deepseek-ai/dsh-settings';
import type { SettingsDescriptor } from '@deepseek-ai/dsh-settings';
import z from '@deepseek-ai/schemastery';
import { SERVICE_TIERS, TIER_CHOICES } from './config.js';
import type { ModelTierOverride, ServiceTier, TierChoice } from './config.js';

/** 工具只投影档位与原生 revision，不投影连接或 headers。 */
export interface TierState {
  namespace: string;
  global: TierChoice | undefined;
  overrides: readonly ModelTierOverride[];
  revision: number;
}
interface NativeTarget {
  settings: Settings;
  descriptor: SettingsDescriptor;
  path: readonly string[];
  profile: Record<string, unknown>;
}
function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('原生 OpenRouter 配置不可用');
  return value as Record<string, unknown>;
}
/** 每次操作重新发现 owner 和 namespace；不激活 dormant route。 */
function nativeTarget(ctx: Context): NativeTarget {
  const settings = ctx.get('settings');
  if (!settings) throw new Error('宿主 settings 服务不可用');
  const route = ctx.llm.listConfigurableProviders().find(entry => entry.provider === 'openrouter');
  if (!route || !ctx.llm.listProviders().some(entry => entry.id === 'openrouter')) {
    throw new Error('原生 openrouter 路由未启用；请先在原生模型设置中配置，控制插件不会补建 profile');
  }
  const descriptor = settings.describe({ redactSecrets: true }).find(entry => entry.ns === route.settingsNs);
  if (!descriptor) throw new Error('原生 OpenRouter settings namespace 不可用');
  let schema: z | undefined = new z(record(descriptor.schema));
  let profile = record(descriptor.value);
  for (const key of route.settingsPath) {
    schema = schema?.type === 'dict' ? schema.inner : schema?.dict?.[key];
    profile = record(profile[key]);
  }
  if (!schema?.dict?.serviceTier || !schema.dict.modelServiceTiers) {
    throw new Error('宿主缺少原生 OpenRouter service tier 能力；0.2.0-rc.2 / 0.2.1-alpha.1 均需对应 llm-pi-ai 补丁');
  }
  return { settings, descriptor, path: route.settingsPath, profile };
}
function stateOf(target: NativeTarget): TierState {
  const { serviceTier, modelServiceTiers } = target.profile;
  if (serviceTier !== undefined && serviceTier !== null && !(SERVICE_TIERS as readonly unknown[]).includes(serviceTier)) {
    throw new Error('原生 OpenRouter 全局档位无效');
  }
  const overrides: ModelTierOverride[] = [];
  if (modelServiceTiers !== undefined) {
    if (!Array.isArray(modelServiceTiers)) throw new Error('原生模型档位覆盖必须为数组');
    for (const item of modelServiceTiers) {
      const entry = record(item);
      if (typeof entry.model !== 'string' || !entry.model.trim() || overrides.some(value => value.model === entry.model)
        || !(TIER_CHOICES as readonly unknown[]).includes(entry.tier)) throw new Error('原生模型档位覆盖无效');
      overrides.push({ model: entry.model, tier: entry.tier as TierChoice });
    }
  }
  return {
    namespace: target.descriptor.ns,
    global: serviceTier === null ? 'omit' : serviceTier as TierChoice | undefined,
    overrides,
    revision: target.descriptor.revision,
  };
}
/** 读取原生已解析档位，不返回其他配置。 */
export function readTierState(ctx: Context): TierState { return stateOf(nativeTarget(ctx)); }
export type TierChange =
  | { readonly kind: 'global'; readonly tier: TierChoice | 'inherit' }
  | { readonly kind: 'model'; readonly model: string; readonly tier: TierChoice | 'inherit' };
/** 只写档位字段；按模型更新使用当下原生目录与同一次读取的 revision。 */
export async function mutateTier(ctx: Context, change: TierChange, expectedRevision: number): Promise<void> {
  const target = nativeTarget(ctx);
  const state = stateOf(target);
  if (!(TIER_CHOICES as readonly string[]).includes(change.tier) && change.tier !== 'inherit') throw new Error('不支持的请求档位');
  if (change.kind === 'global') {
    await target.settings.mutate(state.namespace, [change.tier === 'inherit'
      ? { op: 'unset', path: [...target.path, 'serviceTier'] }
      : { op: 'set', path: [...target.path, 'serviceTier'], value: change.tier === 'omit' ? null : change.tier }], expectedRevision);
  } else {
    const models = await ctx.llm.listModels('openrouter');
    // 失效覆盖仍允许删除，新增或改档位必须是当前原生目录中的模型。
    if (change.tier !== 'inherit' && !models.some(model => model.id === change.model)) {
      throw new Error(`模型 "${change.model}" 不在当前原生 OpenRouter 目录中`);
    }
    const next = state.overrides.filter(entry => entry.model !== change.model);
    if (change.tier !== 'inherit') next.push({ model: change.model, tier: change.tier });
    // 空数组显式屏蔽底层数组；unset 会恢复底层覆盖，不能冒充删除成功。
    await target.settings.mutate(state.namespace, [{ op: 'set', path: [...target.path, 'modelServiceTiers'], value: next }], expectedRevision);
  }
}
/** 摘要区分继承和显式不发送；全局 null 不屏蔽模型显式档位。 */
export function describeTierState(state: TierState): string {
  const global = state.global === undefined ? '未设置（继承 / 不发送）' : state.global === 'omit' ? '不发送 service_tier' : state.global;
  const lines = [`原生 namespace：${state.namespace}`, `全局档位：${global}`, `revision：${state.revision}`];
  lines.push(state.overrides.length === 0 ? '按模型覆盖：无' : '按模型覆盖：');
  for (const entry of [...state.overrides].sort((a, b) => a.model.localeCompare(b.model))) {
    lines.push(`  ${entry.model} → ${entry.tier === 'omit' ? '不发送 service_tier' : entry.tier}`);
  }
  return lines.join('\n');
}
/** 用户输入的 reset/inherit 清除全局用户覆盖，不等于 omit。 */
export function parseTierChoice(text: string): TierChoice | 'inherit' {
  if (text === 'inherit' || text === 'reset' || text === '默认') return 'inherit';
  if ((TIER_CHOICES as readonly string[]).includes(text)) return text as TierChoice;
  throw new Error(`不支持的档位 "${text}"；可用值：${TIER_CHOICES.join(', ')}, inherit`);
}
export const PROTOCOL_TIERS: readonly ServiceTier[] = TIER_CHOICES.filter((tier): tier is ServiceTier => tier !== 'omit');
