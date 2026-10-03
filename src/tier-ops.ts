import type Settings from '@deepseek-ai/dsh-settings';
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings';
import { TIER_CHOICES } from './config.js';
import type { ModelTierOverride, ServiceTier, TierChoice } from './config.js';

/**
 * 档位的唯一持久化路径：UI、Agent 工具与 /service-tier 命令都经过宿主
 * settings.mutate，避免出现第二套配置或第二份写入逻辑。
 */

/** 配置表单里档位字段的三种状态：未设置（继承）、显式 omit、具体协议档位。 */
export interface TierState {
  /** `undefined` 表示字段未设置，继承下层配置；`'omit'` 表示显式不发送。 */
  global: TierChoice | undefined;
  overrides: readonly ModelTierOverride[];
  revision: number;
}

/** 尚未落地的字段取原始配置值；null 与缺失必须区分开。 */
function normalizeGlobal(raw: unknown): TierChoice | undefined {
  if (raw === null) return 'omit';
  if (typeof raw === 'string' && (TIER_CHOICES as readonly string[]).includes(raw)) return raw as TierChoice;
  return undefined;
}

function normalizeOverrides(raw: unknown): readonly ModelTierOverride[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const result: ModelTierOverride[] = [];
  for (const item of raw) {
    if (item === null || typeof item !== 'object') continue;
    const { model, tier } = item as { model?: unknown; tier?: unknown };
    if (typeof model !== 'string' || model.length === 0 || seen.has(model)) continue;
    if (typeof tier !== 'string' || !(TIER_CHOICES as readonly string[]).includes(tier)) continue;
    seen.add(model);
    result.push({ model, tier: tier as TierChoice });
  }
  return result;
}

/** 读取当前档位与 revision；配置不可用时抛出，让调用方明确失败而不是静默回退。 */
export function readTierState(settings: Settings, ns: string): TierState {
  const entry = settings.describe({ redactSecrets: true }).find((item) => item.ns === ns);
  if (!entry) throw new Error('当前插件配置不可用，请确认插件已启用');
  const value = entry.value as { serviceTier?: unknown; modelServiceTiers?: unknown };
  return {
    global: normalizeGlobal(value.serviceTier),
    overrides: normalizeOverrides(value.modelServiceTiers),
    revision: entry.revision,
  };
}

/** 一次修改只表达一个意图：改全局档位，或改一个模型的覆盖。 */
export type TierChange =
  | { readonly kind: 'global'; readonly tier: TierChoice | 'inherit' }
  | { readonly kind: 'model'; readonly model: string; readonly tier: TierChoice | 'inherit' };

/**
 * 复用读到的快照计算落盘值；`omit` 用 null 落盘，与 UNSET 区分。
 * `knownModels` 是本插件当前装配的模型，覆盖只允许落在它们之上。
 */
export async function mutateTier(settings: Settings, ns: string, change: TierChange, expectedRevision: number, knownModels: readonly string[]): Promise<void> {
  const state = readTierState(settings, ns);
  const ops: ({ op: 'set'; path: readonly string[]; value: unknown } | { op: 'unset'; path: readonly string[] })[] = [];
  if (change.kind === 'global') {
    ops.push(change.tier === 'inherit'
      ? { op: 'unset', path: ['serviceTier'] }
      : { op: 'set', path: ['serviceTier'], value: change.tier === 'omit' ? null : change.tier });
  } else {
    // 写入一个本插件不会装配的模型只会得到永不生效的覆盖，因此直接拒绝。
    if (!knownModels.includes(change.model)) {
      throw new Error(`模型 "${change.model}" 不在本插件的 models 列表中`);
    }
    const next = state.overrides.filter((entry) => entry.model !== change.model);
    if (change.tier !== 'inherit') next.push({ model: change.model, tier: change.tier });
    ops.push(next.length === 0
      ? { op: 'unset', path: ['modelServiceTiers'] }
      : { op: 'set', path: ['modelServiceTiers'], value: next });
  }
  await settings.mutate(ns as SettingsNamespace, ops, expectedRevision);
}

/** 人类与模型可读的一行摘要；协议档位与“不发送”必须能一眼区分。 */
export function describeTierState(state: TierState): string {
  const global = state.global === undefined ? '未设置（继承 / 不发送）' : state.global === 'omit' ? '不发送 service_tier' : `${state.global}${state.global === 'fast' ? '（priority 别名）' : ''}`;
  const lines = [`全局档位：${global}`, `revision：${state.revision}`];
  if (state.overrides.length === 0) lines.push('按模型覆盖：无');
  else {
    lines.push('按模型覆盖：');
    for (const entry of [...state.overrides].sort((left, right) => left.model < right.model ? -1 : 1)) {
      lines.push(`  ${entry.model} → ${entry.tier === 'omit' ? '不发送 service_tier' : entry.tier}`);
    }
  }
  return lines.join('\n');
}

/** 校验档位字符串来自用户输入时使用；拒绝未知值而不是猜测。 */
export function parseTierChoice(text: string): TierChoice | 'inherit' {
  if (text === 'inherit' || text === 'reset' || text === '默认') return 'inherit';
  if ((TIER_CHOICES as readonly string[]).includes(text)) return text as TierChoice;
  throw new Error(`不支持的档位 "${text}"；可用值：${TIER_CHOICES.join(', ')}, inherit`);
}

/** 协议档位列表（不含 omit），供说明文本使用。 */
export const PROTOCOL_TIERS: readonly ServiceTier[] = TIER_CHOICES.filter((tier): tier is ServiceTier => tier !== 'omit');
