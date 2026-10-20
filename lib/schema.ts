// Shared (client + server) definitions of the wiki's frontmatter schemas.

export type Kind = 'account' | 'contact' | 'deal' | 'interaction' | 'purchase';
export type Role = 'admin' | 'crm_editor' | 'crm_viewer';

export const ROLES: Role[] = ['admin', 'crm_editor', 'crm_viewer'];

export const STAGES = ['new_lead', 'discovery', 'proposal', 'negotiation', 'won', 'lost'] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABEL: Record<Stage, string> = {
  new_lead: 'New Lead',
  discovery: 'Discovery',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  won: 'Won',
  lost: 'Lost',
};
export const OPEN_STAGES: Stage[] = ['new_lead', 'discovery', 'proposal', 'negotiation'];

export const ACCOUNT_TYPES = ['lead', 'prospect', 'customer', 'churned'];
export const CONTACT_ROLES = ['champion', 'decision_maker', 'influencer', 'blocker', 'user', 'other'];
export const INTERACTION_KINDS = ['email', 'call', 'meeting', 'document', 'note'];
export const SENTIMENTS = ['positive', 'neutral', 'negative', 'mixed'];

export const SUBDIR: Record<Exclude<Kind, 'account'>, string> = {
  contact: 'contacts',
  deal: 'deals',
  interaction: 'interactions',
  purchase: 'purchases',
};

export type FieldType = 'text' | 'number' | 'date' | 'select' | 'tags' | 'email' | 'textarea';
export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: readonly string[];
}

export const FIELDS: Record<Kind, FieldDef[]> = {
  account: [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'type', label: 'Type', type: 'select', options: ACCOUNT_TYPES },
    { key: 'pipeline_stage', label: 'Pipeline stage', type: 'select', options: STAGES },
    { key: 'tier', label: 'Tier', type: 'text' },
    { key: 'industry', label: 'Industry', type: 'text' },
    { key: 'domain', label: 'Domain', type: 'text' },
    { key: 'assigned_rep', label: 'Assigned rep', type: 'email' },
    { key: 'arr', label: 'ARR', type: 'number' },
    { key: 'currency', label: 'Currency', type: 'text' },
    { key: 'tags', label: 'Tags', type: 'tags' },
    { key: 'next_best_action', label: 'Next best action', type: 'textarea' },
  ],
  contact: [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'title', label: 'Title', type: 'text' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'phone', label: 'Phone', type: 'text' },
    { key: 'influence', label: 'Influence', type: 'select', options: CONTACT_ROLES },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ],
  deal: [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'stage', label: 'Stage', type: 'select', options: STAGES },
    { key: 'value', label: 'Value', type: 'number' },
    { key: 'currency', label: 'Currency', type: 'text' },
    { key: 'probability', label: 'Probability %', type: 'number' },
    { key: 'close_date', label: 'Close date', type: 'date' },
    { key: 'owner', label: 'Owner', type: 'email' },
  ],
  interaction: [
    { key: 'title', label: 'Title', type: 'text' },
    { key: 'kind', label: 'Kind', type: 'select', options: INTERACTION_KINDS },
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'sentiment', label: 'Sentiment', type: 'select', options: SENTIMENTS },
    { key: 'participants', label: 'Participants', type: 'tags' },
  ],
  purchase: [
    { key: 'po_number', label: 'PO / Invoice #', type: 'text' },
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'amount', label: 'Amount', type: 'number' },
    { key: 'currency', label: 'Currency', type: 'text' },
    { key: 'items', label: 'Items', type: 'tags' },
    { key: 'terms', label: 'Terms', type: 'textarea' },
  ],
};

/** Fields maintained by the system; they are never locked and never shown as editable. */
export const SYSTEM_FIELDS = new Set(['id', 'account', 'locked_fields', 'created', 'updated', 'last_activity', 'source_file', 'action_items', 'tasks', 'aliases']);

export interface ActionItem {
  id: string;
  text: string;
  due?: string;
  assignee?: string;
  done?: boolean;
}

export interface SessionUser {
  email: string;
  name: string;
  role: Role;
  assigned_accounts: string[];
}

export const canEdit = (u: { role: Role }) => u.role === 'admin' || u.role === 'crm_editor';
