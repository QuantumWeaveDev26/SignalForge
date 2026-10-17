import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const profiles = sqliteTable('profiles', {
  id: text('id').primaryKey(), owner: text('owner').notNull(), name: text('name').notNull(),
  revision:integer('revision').notNull().default(1),
  website: text('website').notNull().default(''), market: text('market').notNull().default('Global'),
  competitors: text('competitors').notNull().default(''), audience: text('audience').notNull().default(''),
  context: text('context').notNull().default(''), created: text('created').notNull(),
});
export const reports = sqliteTable('reports', {
  id: text('id').primaryKey(), owner: text('owner').notNull(), title: text('title').notNull(),
  template: text('template').notNull(), subject: text('subject').notNull(), market: text('market').notNull(),
  question: text('question').notNull(), input: text('input').notNull(), status: text('status').notNull(),
  responseId: text('response_id'), body: text('body').notNull().default(''),
  sources: text('sources').notNull().default('[]'), usage: text('usage').notNull().default('{}'),
  error: text('error').notNull().default(''), created: text('created').notNull(), updated: text('updated').notNull(),
  monitorComparison:text('monitor_comparison').notNull().default('{}'),
  shareToken: text('share_token'), monitorId: text('monitor_id'), monitorDue: text('monitor_due'),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
  profileId: text('profile_id').references(() => profiles.id, { onDelete: 'set null' }),
  workflowRunId: text('workflow_run_id').references(() => workflowRuns.id, { onDelete: 'set null' }),
  workflowStep: integer('workflow_step'),
  favorite: integer('favorite').notNull().default(0), labels: text('labels').notNull().default('[]'),
}, t => [uniqueIndex('reports_monitor_occurrence_idx').on(t.owner,t.monitorId,t.monitorDue),index('reports_library_order_idx').on(t.owner,t.created,t.id)]);
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(), owner: text('owner').notNull(), name: text('name').notNull(),
  description: text('description').notNull().default(''),
  profileId: text('profile_id').references(() => profiles.id, { onDelete: 'set null' }),
  created: text('created').notNull(), updated: text('updated').notNull(),
}, t => [index('projects_owner_idx').on(t.owner)]);
export const workflows = sqliteTable('workflows', {
  id: text('id').primaryKey(), owner: text('owner').notNull(), name: text('name').notNull(),
  description: text('description').notNull().default(''), input: text('input').notNull(), steps: text('steps').notNull(),
  favorite: integer('favorite').notNull().default(0), created: text('created').notNull(), updated: text('updated').notNull(),
}, t => [index('workflows_owner_idx').on(t.owner)]);
export const workflowRuns = sqliteTable('workflow_runs', {
  id: text('id').primaryKey(), owner: text('owner').notNull(), name: text('name').notNull(),
  workflowId: text('workflow_id').references(() => workflows.id, { onDelete: 'set null' }),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
  profileId: text('profile_id').references(() => profiles.id, { onDelete: 'set null' }),
  input: text('input').notNull(), steps: text('steps').notNull(), reports: text('reports').notNull().default('[]'),
  status: text('status').notNull().default('ready'), error: text('error').notNull().default(''),
  backgroundEnabled: integer('background_enabled').notNull().default(0),
  leaseUntil: text('lease_until'), created: text('created').notNull(), updated: text('updated').notNull(),
}, t => [index('workflow_runs_owner_idx').on(t.owner)]);
export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(), owner: text('owner').notNull(), title: text('title').notNull(),
  profileId: text('profile_id').references(() => profiles.id, { onDelete: 'set null' }),
  mode: text('mode').notNull().default('strategy'), context: text('context').notNull().default('{}'),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
  persona: text('persona').notNull().default('{}'), favorite: integer('favorite').notNull().default(0),
  created: text('created').notNull(), updated: text('updated').notNull(),
}, t => [index('conversations_owner_idx').on(t.owner,t.updated)]);
export const conversationTurns = sqliteTable('conversation_turns', {
  id: text('id').primaryKey(), owner: text('owner').notNull(),
  conversationId: text('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  requestId: text('request_id').notNull(), question: text('question').notNull(), attachments: text('attachments').notNull().default('[]'),
  mode: text('mode').notNull().default(''),
  status: text('status').notNull().default('starting'), responseId: text('response_id'),
  body: text('body').notNull().default(''), sources: text('sources').notNull().default('[]'), usage: text('usage').notNull().default('{}'),
  error: text('error').notNull().default(''), created: text('created').notNull(), updated: text('updated').notNull(),
}, t => [index('conversation_turns_owner_idx').on(t.owner,t.conversationId),uniqueIndex('conversation_turns_request_idx').on(t.owner,t.requestId)]);
export const catalogFavorites = sqliteTable('catalog_favorites', {
  id: text('id').primaryKey(), owner: text('owner').notNull(), presetId: text('preset_id').notNull(), created: text('created').notNull(),
}, t => [index('catalog_favorites_owner_idx').on(t.owner)]);
export const conversationUsage = sqliteTable('conversation_usage', {
  id: text('id').primaryKey(), owner: text('owner').notNull(), day: text('day').notNull(), turns: integer('turns').notNull().default(0),
});
// Billing is additive. Test payments and live payments have separate namespaces.
export const billingSubscriptions = sqliteTable('billing_subscriptions', {
 id:text('id').primaryKey(), account:text('account').notNull(), mode:text('mode').notNull(),
 plan:text('plan').notNull(), currency:text('currency').notNull(), providerPlan:text('provider_plan').notNull(),
 status:text('status').notNull(), cancelRequested:integer('cancel_requested').notNull().default(0),
 created:text('created').notNull(), updated:text('updated').notNull(),
},t=>[index('billing_subscriptions_account_idx').on(t.account,t.mode)]);
export const billingCheckouts = sqliteTable('billing_checkouts', {
 id:text('id').primaryKey(), account:text('account').notNull(), mode:text('mode').notNull(),
 subscriptionId:text('subscription_id'), state:text('state').notNull(), created:text('created').notNull(),
});
export const billingPayments = sqliteTable('billing_payments', {
 id:text('id').primaryKey(), subscriptionId:text('subscription_id').notNull().references(()=>billingSubscriptions.id),
 account:text('account').notNull(), mode:text('mode').notNull(), plan:text('plan').notNull(), currency:text('currency').notNull(),
 amount:integer('amount').notNull(), periodStart:integer('period_start').notNull(),periodEnd:integer('period_end').notNull(),
 revoked:integer('revoked').notNull().default(0),updated:text('updated').notNull(),
},t=>[index('billing_payments_account_idx').on(t.account,t.mode,t.periodEnd)]);
export const billingUsage = sqliteTable('billing_usage', {
 id:text('id').primaryKey(),account:text('account').notNull(),period:text('period').notNull(),kind:text('kind').notNull(),created:text('created').notNull(),
},t=>[index('billing_usage_period_idx').on(t.account,t.period,t.kind)]);
export const billingEvents = sqliteTable('billing_events', {
 id:text('id').primaryKey(), type:text('type').notNull(), created:text('created').notNull(),
});
export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(), reportId: text('report_id').notNull(), owner: text('owner').notNull(),
  role: text('role').notNull(), body: text('body').notNull(), sources: text('sources').notNull().default('[]'),
  created: text('created').notNull(),
});
export const monitors = sqliteTable('monitors', {
  id: text('id').primaryKey(), owner: text('owner').notNull(), name: text('name').notNull(),
  input: text('input').notNull(), cadence: text('cadence').notNull(), enabled: integer('enabled').notNull().default(1),
  nextRun: text('next_run').notNull(), leaseUntil: text('lease_until'), lastReport: text('last_report'),
  error: text('error').notNull().default(''), created: text('created').notNull(),
  managedProfileId: text('managed_profile_id').references(() => profiles.id, { onDelete: 'cascade' }),
}, t => [uniqueIndex('monitors_managed_profile_idx').on(t.owner,t.managedProfileId)]);
export const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey(), owner: text('owner').notNull(), name: text('name').notNull(),
  prefix: text('prefix').notNull(), digest: text('digest').notNull().unique(), created: text('created').notNull(),
  revoked: integer('revoked').notNull().default(0),
});
export const attachments = sqliteTable('attachments', {
  id: text('id').primaryKey(), owner: text('owner').notNull(), name: text('name').notNull(),
  key: text('key').notNull(), bytes: integer('bytes').notNull(), created: text('created').notNull(),
  originalKey:text('original_key'), format:text('format').notNull().default('text'),
  textChars:integer('text_chars').notNull().default(0),sections:integer('sections').notNull().default(0),
  warning:text('warning').notNull().default(''),archived:integer('archived').notNull().default(0),
  projectId:text('project_id').references(()=>projects.id,{onDelete:'set null'}),
  profileId:text('profile_id').references(()=>profiles.id,{onDelete:'set null'}),
});
export const preferences = sqliteTable('preferences', {
  owner: text('owner').primaryKey(), name: text('name').notNull().default('My workspace'),
  market: text('market').notNull().default('Global'), timezone: text('timezone').notNull().default('Asia/Kolkata'),
  monitorAllBrands: integer('monitor_all_brands').notNull().default(0),
});

// Additive account migration. Existing workspace owners and records are kept.
export const authUser = sqliteTable('auth_user', {
  id: text('id').primaryKey(), name: text('name').notNull(), email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false), image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(), updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export const authSession = sqliteTable('auth_session', {
  id: text('id').primaryKey(), token: text('token').notNull().unique(),
  userId: text('user_id').notNull().references(() => authUser.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(), updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  ipAddress: text('ip_address'), userAgent: text('user_agent'),
}, t => [index('auth_session_user_idx').on(t.userId)]);
export const authAccount = sqliteTable('auth_account', {
  id: text('id').primaryKey(), accountId: text('account_id').notNull(), providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => authUser.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'), refreshToken: text('refresh_token'), idToken: text('id_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }), refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
  scope: text('scope'), password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(), updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, t => [index('auth_account_user_idx').on(t.userId)]);
export const authVerification = sqliteTable('auth_verification', {
  id: text('id').primaryKey(), identifier: text('identifier').notNull(), value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(), updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, t => [index('auth_verification_identifier_idx').on(t.identifier)]);
export const authRateLimit = sqliteTable('auth_rate_limit', {
  id: text('id').primaryKey(), key: text('key').notNull().unique(), count: integer('count').notNull(), lastRequest: integer('last_request').notNull(),
});
export const workspaceAccounts = sqliteTable('workspace_accounts', {
  userId: text('user_id').primaryKey().references(() => authUser.id), owner: text('owner').notNull().unique(), created: text('created').notNull(),
});

// Durable delivery receipts; retries never authorize a second workflow step.
export const monitorEmailSettings=sqliteTable('monitor_email_settings',{
 owner:text('owner').primaryKey(),userId:text('user_id').notNull().references(()=>authUser.id),
 enabled:integer('enabled').notNull().default(0),enabledAt:text('enabled_at').notNull(),
 testAt:text('test_at'),updated:text('updated').notNull(),
});
export const monitorEmailOutbox=sqliteTable('monitor_email_outbox',{
 id:text('id').primaryKey(),owner:text('owner').notNull(),userId:text('user_id').notNull(),recipient:text('recipient').notNull(),
 reportId:text('report_id'),monitorId:text('monitor_id'),kind:text('kind').notNull(),title:text('title').notNull(),
 state:text('state').notNull().default('pending'),attempts:integer('attempts').notNull().default(0),nextAttempt:text('next_attempt').notNull(),leaseUntil:text('lease_until'),
 providerId:text('provider_id'),error:text('error').notNull().default(''),created:text('created').notNull(),updated:text('updated').notNull(),
},t=>[uniqueIndex('monitor_email_report_idx').on(t.reportId),index('monitor_email_due_idx').on(t.state,t.nextAttempt),index('monitor_email_owner_idx').on(t.owner,t.created)]);
export const mailDeliveryHealth=sqliteTable('mail_delivery_health',{
 id:text('id').primaryKey(),state:text('state').notNull(),error:text('error').notNull().default(''),checked:text('checked').notNull(),
});

export const backgroundEvents = sqliteTable('background_events', {
 id:text('id').primaryKey(), responseId:text('response_id').notNull(), type:text('type').notNull(),
 state:text('state').notNull().default('pending'), leaseUntil:text('lease_until'),
 error:text('error').notNull().default(''), created:text('created').notNull(), updated:text('updated').notNull(),
});

// Private pitching records retain agency snapshots and append-only playbook revisions.
export const agencies = sqliteTable('agencies', {
 id:text('id').primaryKey(),owner:text('owner').notNull(),data:text('data').notNull(),
 archived:integer('archived').notNull().default(0),revision:integer('revision').notNull().default(1),created:text('created').notNull(),updated:text('updated').notNull(),
},t=>[index('agencies_owner_idx').on(t.owner)]);
export const pitches = sqliteTable('pitches', {
 id:text('id').primaryKey(),owner:text('owner').notNull(),input:text('input').notNull(),agency:text('agency').notNull().default('null'),
 body:text('body').notNull(),sources:text('sources').notNull().default('[]'),revision:integer('revision').notNull().default(1),
 archived:integer('archived').notNull().default(0),projectId:text('project_id').references(()=>projects.id,{onDelete:'set null'}),
 profileId:text('profile_id').references(()=>profiles.id,{onDelete:'set null'}),created:text('created').notNull(),updated:text('updated').notNull(),
},t=>[index('pitches_owner_idx').on(t.owner,t.updated)]);
export const pitchVersions = sqliteTable('pitch_versions', {
 id:text('id').primaryKey(),owner:text('owner').notNull(),pitchId:text('pitch_id').notNull().references(()=>pitches.id),
 revision:integer('revision').notNull(),body:text('body').notNull(),sources:text('sources').notNull(),label:text('label').notNull(),created:text('created').notNull(),
},t=>[uniqueIndex('pitch_versions_revision_idx').on(t.pitchId,t.revision)]);
export const pitchRuns = sqliteTable('pitch_runs', {
 id:text('id').primaryKey(),owner:text('owner').notNull(),pitchId:text('pitch_id').notNull().references(()=>pitches.id),
 snapshot:text('snapshot').notNull(),created:text('created').notNull(),
},t=>[index('pitch_runs_pitch_idx').on(t.owner,t.pitchId)]);
