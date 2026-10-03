window.__ModuleLoader__.load({
  id: 'dsh-openrouter-service-tier',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const tiers = ['omit', 'default', 'flex', 'priority', 'fast', 'ultrafast'];
    const ns = 'openrouterServiceTier';
    const zh = {
      title: '请求服务档位', summary: '选择 OpenRouter 请求的服务档位',
      intro: '只修改此插件独立路由的请求档位，不改 API key、模型或 thinking。保存后对当前 profile 所有会话的后续请求生效；正在进行的请求保留原档位。',
      omit: '不发送 tier 参数', default: '标准（default）', flex: '弹性（flex）',
      priority: '优先（priority）', fast: '快速（fast，优先档位别名）', ultrafast: '极速（ultrafast）',
      'hint.omit': '请求不携带 service_tier，由 OpenRouter 的模型、路由与账户规则决定。',
      'hint.default': '使用标准容量与价格，不要求 flex 或优先档位。',
      'hint.flex': '通常价格更低，但延迟更高、可用性更低。有 flex 节点时容量错误不回退到标准档；完全没有 flex 节点时仍可能使用标准档。',
      'hint.priority': '优先尝试更快、更可靠的容量，价格可能更高；不可用时可能回退到标准档。',
      'hint.fast': '与 priority 请求同一优先档位，使用 fast 别名；价格可能更高。',
      'hint.ultrafast': '仅部分模型支持的极速容量，费用可能是标准档的数倍；不可用时可能回退到优先或标准档。',
      billing: '这是请求档位，不是实际计费保证。实际服务档位与费用请以 OpenRouter 日志为准。',
      save: '保存', saving: '正在保存…', reset: '恢复默认',
      resetHint: '恢复 bundle 或上层配置的默认档位，不等于“不发送 tier 参数”。',
      saved: '已保存，新请求将使用新档位。', resetDone: '已恢复默认档位。',
      failed: '保存未被接受，可能存在并发修改或配置校验失败。请刷新页面后重试。',
      transportFailed: '保存失败，请检查连接后重试：{reason}',
      loading: '正在读取插件配置…', unavailable: '当前配置不可用，请确认插件已启用。',
      readonly: '当前页面不能写入 Host 配置；请在可写的本机连接中修改。',
      changed: '配置已被其他操作更新；保存会进行版本检查，不会静默覆盖。',
      overridesTitle: '按模型覆盖（可选）',
      overridesIntro: '只对该模型生效，优先于上面的全局档位。模型 id 必须在本插件已配置的 models 列表中，否则 Host 会拒绝写入。',
      overridesEmpty: '暂无覆盖，所有模型都使用全局档位。',
      overrideModel: '模型 id', overridePlaceholder: '例如 vendor/model',
      overrideAdd: '添加覆盖', overrideRemove: '删除', overrideTarget: '档位',
      overrideInvalid: '模型 id 不能为空。',
    };
    const en = {
      title: 'Request service tier', summary: 'Select the OpenRouter request service tier',
      intro: 'Changes only this plugin’s independent route, not the API key, models or thinking. Saved changes affect subsequent requests in all sessions of this profile; in-flight requests keep their tier.',
      omit: 'Do not send a tier', default: 'Standard (default)', flex: 'Flex', priority: 'Priority', fast: 'Fast (priority alias)', ultrafast: 'Ultrafast',
      'hint.omit': 'Omit service_tier. OpenRouter model, routing and account rules decide the tier.',
      'hint.default': 'Use standard capacity and pricing without requesting flex or priority.',
      'hint.flex': 'Usually cheaper, with higher latency and lower availability. Capacity errors do not fall back to standard when flex endpoints exist; models without any flex endpoints may still use standard.',
      'hint.priority': 'Prefer faster, more reliable capacity at potentially higher cost; may fall back to standard.',
      'hint.fast': 'An alias for priority, with the same potentially higher cost.',
      'hint.ultrafast': 'Available on select models at potentially several times standard pricing; may fall back to priority or standard.',
      billing: 'This is a requested tier, not a billing guarantee. Check OpenRouter logs for the actual tier and cost.',
      save: 'Save', saving: 'Saving…', reset: 'Restore default', resetHint: 'Restore the bundle or inherited tier, which is not the same as omitting the parameter.',
      saved: 'Saved. New requests will use the new tier.', resetDone: 'Default tier restored.',
      failed: 'Save was not accepted, possibly because of a concurrent change or validation failure. Refresh and retry.',
      transportFailed: 'Save failed. Check your connection and retry: {reason}',
      loading: 'Loading plugin configuration…', unavailable: 'Configuration is unavailable. Confirm the plugin is enabled.',
      readonly: 'This page cannot write Host configuration. Use a writable local connection.',
      changed: 'Another operation updated the configuration. Save will check the revision rather than overwrite silently.',
      overridesTitle: 'Per-model overrides (optional)',
      overridesIntro: 'Applies to that model only and takes precedence over the global tier above. The model id must be in this plugin’s configured models list, otherwise the Host refuses the write.',
      overridesEmpty: 'No overrides; every model uses the global tier.',
      overrideModel: 'Model id', overridePlaceholder: 'e.g. vendor/model',
      overrideAdd: 'Add override', overrideRemove: 'Remove', overrideTarget: 'Tier',
      overrideInvalid: 'Model id must not be empty.',
    };
    const css = `
      .ort-tier-form{display:flex;flex-direction:column;gap:16px;max-width:640px;color:var(--dsw-alias-label-primary)}
      .ort-tier-form p{margin:0;font-size:13px;line-height:1.6}
      .ort-tier-help{color:var(--dsw-alias-label-secondary)}
      .ort-tier-field{display:flex;flex-direction:column;gap:6px;padding:12px 0}
      .ort-tier-field label{font-size:13px;font-weight:500;line-height:1.5}
      .ort-tier-field-label{font-size:13px;font-weight:600;line-height:1.5}
      .ort-tier-select{box-sizing:border-box;width:100%;min-height:36px;padding:6px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}
      .ort-tier-select option{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}
      .ort-tier-actions{display:flex;flex-wrap:wrap;gap:8px}
      .ort-tier-button{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;min-height:36px;padding:0 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;cursor:pointer}
      .ort-tier-button:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}
      .ort-tier-button:focus-visible,.ort-tier-select:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
      .ort-tier-button:disabled,.ort-tier-select:disabled{opacity:.5;cursor:not-allowed}
      .ort-tier-warning{color:var(--dsw-alias-state-warn-primary)}
      .ort-tier-error{color:var(--dsw-alias-state-error-primary)}
      .ort-tier-success{color:var(--dsw-alias-state-success-primary)}
      .ort-tier-overrides{display:flex;flex-direction:column;gap:8px;padding-top:4px;border-top:1px solid var(--dsw-alias-border-l2)}
      .ort-tier-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
      .ort-tier-row code{font-size:12px;overflow-wrap:anywhere}
      .ort-tier-row .ort-tier-select{width:auto;min-width:180px;flex:0 1 220px}
      .ort-tier-input{box-sizing:border-box;min-height:36px;padding:6px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;flex:1 1 200px}
      .ort-tier-input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
      .ort-tier-input:disabled{opacity:.5;cursor:not-allowed}
      .ort-tier-list{display:flex;flex-direction:column;gap:8px;margin:0;padding:0;list-style:none}
    `;

    /** Host 返回值一律按 `模型 → 档位` 数组回读，非法项忽略而不是渲染出坏行。 */
    function normalizeOverrides(raw) {
      if (!Array.isArray(raw)) return [];
      const seen = new Set();
      const list = [];
      for (const item of raw) {
        if (!item || typeof item !== 'object') continue;
        const model = typeof item.model === 'string' ? item.model : '';
        if (model.length === 0 || seen.has(model)) continue;
        seen.add(model);
        list.push({ model, tier: tiers.includes(item.tier) ? item.tier : 'omit' });
      }
      return list;
    }

    function TierForm({ form, t }) {
      const state = form?.state;
      const acceptedTier = state?.value?.serviceTier ?? 'omit';
      const acceptedOverrides = normalizeOverrides(state?.value?.modelServiceTiers);
      const [draft, setDraft] = React.useState(null);
      const [newModel, setNewModel] = React.useState('');
      const [busy, setBusy] = React.useState(false);
      const [notice, setNotice] = React.useState(null);
      const inFlight = React.useRef(false);
      const mounted = React.useRef(true);
      const id = React.useId();
      React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
      const selected = draft?.tier ?? acceptedTier;
      const overrides = draft?.overrides ?? acceptedOverrides;
      const writable = state?.status === 'ready' && state.writable && state.mode === 'host' && Number.isSafeInteger(state.revision);
      const overridden = !!state?.user && Object.prototype.hasOwnProperty.call(state.user, 'serviceTier');
      const conflict = draft !== null && draft.revision !== state?.revision;

      /** 任一字段改动都保留读取时的 revision，保存时据此做版本 fence。 */
      function update(patch) {
        setNotice(null);
        setDraft({ tier: selected, overrides, revision: draft?.revision ?? state.revision, ...patch });
      }

      async function persist(reset) {
        if (!writable || inFlight.current || (!reset && draft === null)) return;
        inFlight.current = true;
        setBusy(true);
        setNotice(null);
        const revision = reset ? state.revision : draft.revision;
        // 覆盖表为空的语义是“没有覆盖”，因此清除而不是写入空数组。
        const ops = reset ? [{ op: 'unset', path: ['serviceTier'] }] : [
          { op: 'set', path: ['serviceTier'], value: selected === 'omit' ? null : selected },
          overrides.length === 0
            ? { op: 'unset', path: ['modelServiceTiers'] }
            : { op: 'set', path: ['modelServiceTiers'], value: overrides },
        ];
        try {
          const ok = await form.mutate(ops, revision);
          if (mounted.current) {
            if (ok === true) { setDraft(null); setNotice({ kind: 'success', text: t(reset ? 'resetDone' : 'saved') }); }
            else setNotice({ kind: 'error', text: t('failed') });
          }
        } catch (error) {
          if (mounted.current) setNotice({ kind: 'error', text: t('transportFailed', { reason: error instanceof Error ? error.message : String(error) }) });
        } finally {
          inFlight.current = false;
          if (mounted.current) setBusy(false);
        }
      }

      function addOverride() {
        const model = newModel.trim();
        if (model.length === 0) { setNotice({ kind: 'error', text: t('overrideInvalid') }); return; }
        update({ overrides: [...overrides.filter((entry) => entry.model !== model), { model, tier: 'flex' }] });
        setNewModel('');
      }

      if (!form || state?.status === 'unavailable') return h('p', { role: 'status' }, t('unavailable'));
      if (state?.status !== 'ready') return h('p', { role: 'status' }, t('loading'));
      return h('section', { className: 'ort-tier-form', 'aria-busy': busy },
        h('style', null, css),
        h('p', { className: 'ort-tier-help' }, t('intro')),
        h('div', { className: 'ort-tier-field' },
          h('label', { htmlFor: id }, t('title')),
          h('select', {
            id, className: 'ort-tier-select', value: selected, disabled: busy || !writable,
            'aria-describedby': `${id}-hint`,
            onChange: (event) => update({ tier: event.target.value }),
          }, ...tiers.map((tier) => h('option', { key: tier, value: tier }, t(tier)))),
          h('p', { id: `${id}-hint`, className: 'ort-tier-help' }, t(`hint.${selected}`))),
        h('div', { className: 'ort-tier-overrides' },
          h('p', { className: 'ort-tier-field-label', id: `${id}-overrides` },
            h('strong', null, t('overridesTitle'))),
          h('p', { className: 'ort-tier-help' }, t('overridesIntro')),
          overrides.length === 0
            ? h('p', { className: 'ort-tier-help' }, t('overridesEmpty'))
            : h('ul', { className: 'ort-tier-list', 'aria-labelledby': `${id}-overrides` },
              ...overrides.map((entry) => h('li', { key: entry.model, className: 'ort-tier-row' },
                h('code', null, entry.model),
                h('label', { className: 'ort-tier-help', htmlFor: `${id}-${entry.model}` }, t('overrideTarget')),
                h('select', {
                  id: `${id}-${entry.model}`, className: 'ort-tier-select', value: entry.tier, disabled: busy || !writable,
                  onChange: (event) => update({ overrides: overrides.map((item) => item.model === entry.model ? { model: item.model, tier: event.target.value } : item) }),
                }, ...tiers.map((tier) => h('option', { key: tier, value: tier }, t(tier)))),
                h('button', {
                  type: 'button', className: 'ort-tier-button', disabled: busy || !writable,
                  onClick: () => update({ overrides: overrides.filter((item) => item.model !== entry.model) }),
                }, t('overrideRemove'))))),
          h('div', { className: 'ort-tier-row' },
            h('label', { className: 'ort-tier-help', htmlFor: `${id}-new` }, t('overrideModel')),
            h('input', {
              id: `${id}-new`, className: 'ort-tier-input', type: 'text', value: newModel, disabled: busy || !writable,
              placeholder: t('overridePlaceholder'), spellCheck: false, autoComplete: 'off',
              onChange: (event) => setNewModel(event.target.value),
              onKeyDown: (event) => { if (event.key === 'Enter') { event.preventDefault(); addOverride(); } },
            }),
            h('button', { type: 'button', className: 'ort-tier-button', disabled: busy || !writable, onClick: addOverride }, t('overrideAdd')))),
        h('p', { className: 'ort-tier-warning' }, t('billing')),
        !writable ? h('p', { role: 'status', className: 'ort-tier-help' }, t('readonly')) : null,
        conflict ? h('p', { role: 'status', className: 'ort-tier-warning' }, t('changed')) : null,
        h('div', { className: 'ort-tier-actions' },
          h('button', { type: 'button', className: 'ort-tier-button', disabled: !writable || busy || draft === null, onClick: () => persist(false) }, t(busy ? 'saving' : 'save')),
          h('button', { type: 'button', className: 'ort-tier-button', disabled: !writable || busy || !overridden, onClick: () => persist(true), 'aria-describedby': `${id}-reset` }, t('reset'))),
        h('p', { id: `${id}-reset`, className: 'ort-tier-help' }, t('resetHint')),
        notice ? h('p', { role: notice.kind === 'error' ? 'alert' : 'status', className: `ort-tier-${notice.kind}` }, notice.text) : null);
    }

    function TierConfig(props) {
      return props.view === 'summary' ? props.t('summary') : h(TierForm, props);
    }
    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(ns, { zh, en }));
        ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
          name: 'plugins.row.config', key: 'dsh-openrouter-service-tier#openrouter-service-tier', locale: ns,
        }, TierConfig));
      },
    };
  },
});
