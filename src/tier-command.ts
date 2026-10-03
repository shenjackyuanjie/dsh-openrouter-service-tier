import type { Context } from '@deepseek-ai/cordis';
import type Settings from '@deepseek-ai/dsh-settings';
import type { CommandDefinition } from '@deepseek-ai/dsh-commands';
import type {} from '@deepseek-ai/cordis-plugin-loader';
import { TIER_CHOICES } from './config.js';
import { describeTierState, mutateTier, parseTierChoice, readTierState } from './tier-ops.js';

const USAGE = [
  '/openrouter-tier                  查看当前全局档位与按模型覆盖',
  `/openrouter-tier flex             把全局档位设为 flex（也可用 ${TIER_CHOICES.join('/')}）`,
  '/openrouter-tier reset            清除全局档位，改为继承 bundle 配置',
  '/openrouter-tier <模型> flex       只为该模型设置档位',
  '/openrouter-tier <模型> reset      删除该模型的覆盖',
].join('\n');

function failure(error: unknown): { kind: 'error'; text: string } {
  return { kind: 'error', text: error instanceof Error ? error.message : String(error) };
}

/**
 * 人类命令与 Agent 工具、插件管理页走同一条 Host 写入路径，
 * 因此这里同样带 revision fence，不另建配置文件。
 * 命令名带路由前缀：厂商中立的 service-tier 命令名已由其他插件使用。
 */
export function tierCommand(settings: Settings, ns: string, knownModels: readonly string[]): CommandDefinition {
  return {
    name: 'openrouter-tier',
    description: '查看或修改 OpenRouter 请求档位（全局与按模型覆盖）',
    input: { hint: '[模型] [档位] | reset [模型]' },
    async handler(invocation) {
      const tokens = invocation.rawInput.trim().split(/\s+/).filter((token) => token.length > 0);
      try {
        if (tokens.length === 0 || tokens[0] === 'list' || tokens[0] === 'help') {
          return { kind: 'success', text: `${describeTierState(readTierState(settings, ns))}\n\n${USAGE}` };
        }
        const state = readTierState(settings, ns);
        if (tokens.length > 2) return failure(new Error(`参数过多。\n${USAGE}`));
        const [first, second] = tokens;
        // reset 可作用于全局，也可只清除一个模型的覆盖。
        if (first === 'reset') {
          const change = second === undefined
            ? { kind: 'global' as const, tier: 'inherit' as const }
            : { kind: 'model' as const, model: second, tier: 'inherit' as const };
          await mutateTier(settings, ns, change, state.revision, knownModels);
          return { kind: 'success', text: `已清除档位${second === undefined ? '' : '覆盖'}。\n${describeTierState(readTierState(settings, ns))}` };
        }
        // 单个 token：全局档位；两个 token：模型 + 档位。
        if (second === undefined) {
          const tier = parseTierChoice(first!);
          await mutateTier(settings, ns, { kind: 'global', tier }, state.revision, knownModels);
          return { kind: 'success', text: `已更新全局档位。\n${describeTierState(readTierState(settings, ns))}` };
        }
        const tier = parseTierChoice(second);
        await mutateTier(settings, ns, { kind: 'model', model: first!, tier }, state.revision, knownModels);
        return { kind: 'success', text: `已更新模型覆盖。\n${describeTierState(readTierState(settings, ns))}` };
      } catch (error) {
        return failure(error);
      }
    },
  };
}

export function registerTierCommand(ctx: Context, knownModels: readonly string[]): void {
  const ns = ctx.fiber.entry?.options.id;
  if (!ns) return;
  ctx.inject(['settings', 'commands'], (child) => {
    child.effect(() => child.commands.register(tierCommand(child.settings, ns, knownModels)));
  });
}
