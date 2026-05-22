const { PURPOSE_REGISTRY, REGISTRY_MAP, withPurposeCheck } = require('../mcp-server/purpose_registry.js');

describe('PURPOSE_REGISTRY', () => {
  test('every entry has required fields', () => {
    for (const entry of PURPOSE_REGISTRY) {
      expect(entry).toHaveProperty('tool_name');
      expect(entry).toHaveProperty('declared_purposes');
      expect(entry).toHaveProperty('gpc_restricted_purposes');
      expect(Array.isArray(entry.declared_purposes)).toBe(true);
      expect(Array.isArray(entry.gpc_restricted_purposes)).toBe(true);
    }
  });

  test('gpc_restricted_purposes is a subset of declared_purposes', () => {
    for (const entry of PURPOSE_REGISTRY) {
      for (const p of entry.gpc_restricted_purposes) {
        expect(entry.declared_purposes).toContain(p);
      }
    }
  });

  test('get_medical_records restricts personalization but not primary_task', () => {
    const entry = REGISTRY_MAP['get_medical_records'];
    expect(entry.gpc_restricted_purposes).toContain('personalization');
    expect(entry.gpc_restricted_purposes).not.toContain('primary_task');
  });

  test('answer_question has no restricted purposes', () => {
    const entry = REGISTRY_MAP['answer_question'];
    expect(entry.gpc_restricted_purposes).toHaveLength(0);
  });

  test('log_interaction restricts both analytics and model_training', () => {
    const entry = REGISTRY_MAP['log_interaction'];
    expect(entry.gpc_restricted_purposes).toContain('analytics');
    expect(entry.gpc_restricted_purposes).toContain('model_training');
  });

  test('sell_to_data_broker restricts cross_context_sale (Category C)', () => {
    const entry = REGISTRY_MAP['sell_to_data_broker'];
    expect(entry.gpc_restricted_purposes).toContain('cross_context_sale');
    expect(entry.declared_purposes).toContain('cross_context_sale');
  });

  test('share_with_research_partner restricts cross_context_sharing (Category C)', () => {
    const entry = REGISTRY_MAP['share_with_research_partner'];
    expect(entry.gpc_restricted_purposes).toContain('cross_context_sharing');
  });

  test('infer_sensitive_attributes restricts sensitive_data_inference (Category D)', () => {
    const entry = REGISTRY_MAP['infer_sensitive_attributes'];
    expect(entry.gpc_restricted_purposes).toContain('sensitive_data_inference');
  });

  test('all C/D entries satisfy the subset invariant', () => {
    const cdTools = ['sell_to_data_broker', 'share_with_research_partner', 'infer_sensitive_attributes'];
    for (const toolName of cdTools) {
      const entry = REGISTRY_MAP[toolName];
      for (const p of entry.gpc_restricted_purposes) {
        expect(entry.declared_purposes).toContain(p);
      }
    }
  });
});

describe('withPurposeCheck', () => {
  const mockHandler = jest.fn().mockResolvedValue({ data: 'result' });

  beforeEach(() => mockHandler.mockClear());

  test('allows call when gpc=0 regardless of purpose', async () => {
    const wrapped = withPurposeCheck('log_interaction', mockHandler);
    const result = await wrapped({ x: 1 }, { gpc: 0, purpose: 'analytics' });
    expect(result.status).toBe('ok');
    expect(mockHandler).toHaveBeenCalledTimes(1);
  });

  test('allows call when gpc=1 but purpose is not restricted', async () => {
    const wrapped = withPurposeCheck('get_medical_records', mockHandler);
    const result = await wrapped({ patient_id: 'p1' }, { gpc: 1, purpose: 'primary_task' });
    expect(result.status).toBe('ok');
  });

  test('blocks call when gpc=1 and purpose is restricted', async () => {
    const wrapped = withPurposeCheck('log_interaction', mockHandler);
    const result = await wrapped({ x: 1 }, { gpc: 1, purpose: 'analytics' });
    expect(result.status).toBe('blocked');
    expect(result.reason).toBe('purpose_restricted');
    expect(result.purpose).toBe('analytics');
    expect(mockHandler).not.toHaveBeenCalled();
  });

  test('blocks call when gpc=1 and purpose field is missing', async () => {
    const wrapped = withPurposeCheck('log_interaction', mockHandler);
    const result = await wrapped({ x: 1 }, { gpc: 1 });
    expect(result.status).toBe('blocked');
    expect(result.reason).toBe('missing_purpose_field');
    expect(mockHandler).not.toHaveBeenCalled();
  });

  test('partial opt-out: blocks only purposes in gpc_scope', async () => {
    const wrapped = withPurposeCheck('log_interaction', mockHandler);

    // analytics is NOT in gpc_scope → should be allowed
    const allowed = await wrapped(
      { x: 1 },
      { gpc: 1, purpose: 'analytics', gpc_scope: ['model_training', 'ad_targeting'] }
    );
    expect(allowed.status).toBe('ok');

    // model_training IS in gpc_scope → should be blocked
    const blocked = await wrapped(
      { x: 1 },
      { gpc: 1, purpose: 'model_training', gpc_scope: ['model_training', 'ad_targeting'] }
    );
    expect(blocked.status).toBe('blocked');
  });

  test('accepts truthy gpc variants: true, 1, "1"', async () => {
    const wrapped = withPurposeCheck('log_interaction', mockHandler);
    for (const gpc of [true, 1, '1']) {
      const result = await wrapped({}, { gpc, purpose: 'analytics' });
      expect(result.status).toBe('blocked');
    }
  });
});
