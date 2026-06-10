// Tools the in-app Claude assistant can call. They go through the same
// backend interface as the UI (@backend = server API or IndexedDB local
// backend), so every change lands in the same data with the same history
// tracking and validation.
import { api, formatTime } from '@backend';

export const toolDefinitions = [
  {
    name: 'list_skus',
    description: 'List all SKUs with their id, sku_number, name, family, step count, and total labor time in seconds. Call this first when the user refers to a SKU by name or number, to find its id.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_sku',
    description: 'Get full detail for one SKU: its ordered steps with effective times (seconds), which steps are shared (tagged), overrides, needs-review flags, and the total labor time.',
    input_schema: {
      type: 'object',
      properties: { sku_id: { type: 'integer', description: 'The SKU id from list_skus' } },
      required: ['sku_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_shared_steps',
    description: 'List shared steps (tags): id, name, description, canonical time in seconds, and which SKUs use each (including per-SKU overrides).',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Optional search text to filter by name/description' } },
      additionalProperties: false,
    },
  },
  {
    name: 'get_tag_impact',
    description: 'Aggregate labor time per shared step across all SKUs — identifies the best improvement targets.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'update_shared_step',
    description: 'Update a shared step (tag). Changing the canonical time updates EVERY SKU that inherits it (SKUs with an override are not affected) — state which SKUs will change and get user confirmation first. Time strings accept "4:30", "12" (minutes), or "3 minutes 20 seconds".',
    input_schema: {
      type: 'object',
      properties: {
        tag_id: { type: 'integer' },
        time: { type: 'string', description: 'New canonical time' },
        name: { type: 'string' },
        description: { type: 'string' },
        note: { type: 'string', description: 'Reason for the time change, kept in the audit history' },
      },
      required: ['tag_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_step',
    description: 'Update one step on one SKU. For unique steps set time/name/description. For tagged (shared) steps you can only set override_time on this SKU (empty string clears the override so it inherits the tag again). Time changes are recorded in history.',
    input_schema: {
      type: 'object',
      properties: {
        step_id: { type: 'integer' },
        time: { type: 'string', description: 'New observed time (unique steps only)' },
        override_time: { type: 'string', description: 'Per-SKU override for a tagged step; "" clears it' },
        name: { type: 'string' },
        description: { type: 'string' },
        station: { type: 'string' },
        parallel_notes: { type: 'string' },
        note: { type: 'string', description: 'Reason for the time change, kept in history' },
      },
      required: ['step_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_step',
    description: 'Add a step to a SKU (appended at the end; use reorder_steps to move it). Either pass tag_id to attach an existing shared step (optionally with override_time), or pass name/description/time for a unique step.',
    input_schema: {
      type: 'object',
      properties: {
        sku_id: { type: 'integer' },
        tag_id: { type: 'integer', description: 'Attach this existing shared step' },
        override_time: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
        time: { type: 'string' },
        station: { type: 'string' },
        parallel_notes: { type: 'string' },
      },
      required: ['sku_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_step',
    description: 'Delete a step from a SKU. Destructive — always get explicit user confirmation first.',
    input_schema: {
      type: 'object',
      properties: { step_id: { type: 'integer' } },
      required: ['step_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_shared_step',
    description: 'Create a new shared step (tag). If a tag with the same name exists, the call fails with the existing tag attached — suggest attaching that instead, or retry with force=true to create a separate one.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        time: { type: 'string' },
        force: { type: 'boolean' },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'reorder_steps',
    description: 'Reorder the steps of a SKU. Pass the complete list of step ids in the desired order.',
    input_schema: {
      type: 'object',
      properties: {
        sku_id: { type: 'integer' },
        ordered_step_ids: { type: 'array', items: { type: 'integer' } },
      },
      required: ['sku_id', 'ordered_step_ids'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_sku',
    description: 'Create a new SKU. Get user confirmation on sku_number and name first.',
    input_schema: {
      type: 'object',
      properties: {
        sku_number: { type: 'string' },
        name: { type: 'string' },
        family: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['sku_number', 'name'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_time_history',
    description: 'Get the audit trail of time changes for a shared step (entity_type "tag") or an individual step (entity_type "sku_step").',
    input_schema: {
      type: 'object',
      properties: {
        entity_type: { type: 'string', enum: ['tag', 'sku_step'] },
        id: { type: 'integer' },
      },
      required: ['entity_type', 'id'],
      additionalProperties: false,
    },
  },
];

const fmt = s => (s === null || s === undefined ? null : `${formatTime(s)} (${s}s)`);

export async function executeTool(name, input) {
  try {
    switch (name) {
      case 'list_skus': {
        const skus = await api.get('/api/skus');
        return skus.map(s => ({
          id: s.id, sku_number: s.sku_number, name: s.name, family: s.family,
          status: s.status, step_count: s.step_count,
          total: fmt(s.total_seconds),
        }));
      }
      case 'get_sku': {
        const sku = await api.get(`/api/skus/${input.sku_id}`);
        return {
          id: sku.id, sku_number: sku.sku_number, name: sku.name, family: sku.family,
          total: fmt(sku.total_seconds),
          steps: sku.steps.map(s => ({
            step_id: s.id, sequence: s.sequence,
            name: s.tag_id ? s.tag_name : s.name,
            description: s.tag_id ? s.tag_description : s.description,
            effective_time: fmt(s.effective_seconds),
            shared_tag_id: s.tag_id,
            override_time: s.override_time_seconds !== null ? fmt(s.override_time_seconds) : null,
            tag_canonical_time: s.tag_id ? fmt(s.tag_time_seconds) : undefined,
            needs_review: !!s.needs_review,
            original_time_text: s.time_raw_text || undefined,
            station: s.station || undefined,
            parallel_notes: s.parallel_notes || undefined,
            photo_count: s.photos?.length || 0,
          })),
        };
      }
      case 'list_shared_steps': {
        const tags = await api.get(`/api/tags?q=${encodeURIComponent(input.query || '')}`);
        return tags.map(t => ({
          tag_id: t.id, name: t.name, description: t.description,
          canonical_time: fmt(t.canonical_time_seconds),
          used_by: t.used_by.map(u => ({
            sku_id: u.id, sku_number: u.sku_number, sku_name: u.name,
            override_time: u.override_time_seconds !== null ? fmt(u.override_time_seconds) : null,
          })),
        }));
      }
      case 'get_tag_impact':
        return (await api.get('/api/stats/tag-impact')).map(t => ({
          tag_id: t.id, name: t.name, canonical_time: fmt(t.canonical_time_seconds),
          usage_count: t.usage_count, aggregate_time: fmt(t.aggregate_seconds),
        }));
      case 'update_shared_step': {
        const result = await api.put(`/api/tags/${input.tag_id}`, {
          ...(input.time !== undefined ? { time: input.time } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          note: input.note,
        });
        return {
          ok: true, name: result.name, canonical_time: fmt(result.canonical_time_seconds),
          skus_updated: (result.affected_skus || []).map(a => a.sku_number),
        };
      }
      case 'update_step': {
        const result = await api.put(`/api/steps/${input.step_id}`, input);
        return { ok: true, sku_total_now: fmt(result.total_seconds) };
      }
      case 'add_step': {
        const { sku_id, ...rest } = input;
        const result = await api.post(`/api/skus/${sku_id}/steps`, rest);
        return { ok: true, new_step_id: result.id, sku_total_now: fmt(result.total_seconds) };
      }
      case 'delete_step': {
        const result = await api.del(`/api/steps/${input.step_id}`);
        return { ok: true, sku_total_now: fmt(result.total_seconds) };
      }
      case 'create_shared_step': {
        const result = await api.post('/api/tags', input);
        return { ok: true, tag_id: result.id, name: result.name, canonical_time: fmt(result.canonical_time_seconds) };
      }
      case 'reorder_steps':
        await api.post(`/api/skus/${input.sku_id}/steps/reorder`, { orderedIds: input.ordered_step_ids });
        return { ok: true };
      case 'create_sku': {
        const result = await api.post('/api/skus', input);
        return { ok: true, sku_id: result.id, sku_number: result.sku_number };
      }
      case 'get_time_history':
        return (await api.get(`/api/history/${input.entity_type}/${input.id}`)).map(h => ({
          when: h.changed_at, from: fmt(h.old_seconds), to: fmt(h.new_seconds), note: h.note,
        }));
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { error: err.message, details: err.data };
  }
}
