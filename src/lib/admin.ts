/**
 * Client wrappers for the admin console's SECURITY DEFINER rpcs (supabase/schema.sql,
 * the ADMIN CONSOLE section). Every call goes through the signed-in admin's OWN JWT +
 * the public anon key — there is no service-role key in the browser. The server is the
 * trust boundary: each rpc re-checks is_admin() and raises 'forbidden' for anyone else,
 * so this module is convenience, never authorization. Imported only by the lazy /?admin
 * chunk, so supabase-js + this code never weigh down the feed.
 */
import { supabase } from './supabase';
import type { PipelineRunSummary } from './types';

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.rpc(fn, args ?? {});
  if (error) throw new Error(error.message);
  return data as T;
}

export type SortDir = 'asc' | 'desc';

/** Each list rpc returns rows carrying a window `total_count`; split it out for the UI. */
export interface AdminPage<Row> {
  rows: Row[];
  total: number;
}

function paginate<Row extends { total_count?: number }>(rows: Row[] | null): AdminPage<Row> {
  const list = rows ?? [];
  return { rows: list, total: list[0]?.total_count ?? 0 };
}

// ───────────────── gate ─────────────────

/** Is the signed-in user an admin? Drives UI gating ONLY (the rpcs self-enforce). */
export function amIAdmin(): Promise<boolean> {
  return rpc<boolean>('is_admin');
}

// ───────────────── users ─────────────────

export type UserSort = 'created_at' | 'last_sign_in_at' | 'email' | 'display_name' | 'tier';

export interface AdminUserRow {
  user_id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  banned_until: string | null;
  providers: string[];
  is_admin: boolean;
  tier: string;
  comments_count: number;
  calls_count: number;
  resolved_calls: number;
  saved_count: number;
  likes_count: number;
  reports_filed: number;
  is_subscriber: boolean;
  subscriber_confirmed: boolean;
  total_count: number;
}

export interface ListUsersParams {
  search?: string;
  sort?: UserSort;
  dir?: SortDir;
  limit?: number;
  offset?: number;
}

export async function listUsers(p: ListUsersParams = {}): Promise<AdminPage<AdminUserRow>> {
  return paginate(
    await rpc<AdminUserRow[]>('admin_list_users', {
      p_search: p.search ?? null,
      p_sort: p.sort ?? 'created_at',
      p_dir: p.dir ?? 'desc',
      p_limit: p.limit ?? 50,
      p_offset: p.offset ?? 0,
    }),
  );
}

export interface AdminUserDetail {
  user_id: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  banned_until: string | null;
  providers: string[];
  user_metadata: Record<string, unknown> | null;
  is_admin: boolean;
  profile: Record<string, unknown> | null;
  trust: Record<string, unknown> | null;
  badges: { badge_id: string; earned_at: string }[];
  subscription: {
    email: string;
    source: string;
    frequency: string;
    topics: string[];
    breaking: boolean;
    confirmed: boolean;
    subscribed: boolean;
    created_at: string;
    confirmed_at: string | null;
    unsubscribed_at: string | null;
  } | null;
  counts: Record<string, number>;
  recent_comments: {
    id: string;
    market_id: string;
    body: string;
    created_at: string;
    edited_at: string | null;
    deleted: boolean;
    parent_id: string | null;
  }[];
  recent_calls: {
    market_id: string;
    target_outcome: string;
    pick: string;
    confidence: number;
    hidden: boolean;
    created_at: string;
  }[];
  reports_filed_recent: {
    comment_id: string;
    category: string;
    reason: string | null;
    created_at: string;
  }[];
}

export function userDetail(userId: string): Promise<AdminUserDetail> {
  return rpc<AdminUserDetail>('admin_user_detail', { p_user_id: userId });
}

// ───────────────── subscribers ─────────────────

export type SubscriberStatus = 'all' | 'confirmed' | 'unconfirmed' | 'unsubscribed';

export interface AdminSubscriberRow {
  id: string;
  email: string;
  source: string;
  frequency: string;
  topics: string[];
  breaking: boolean;
  created_at: string;
  confirmed_at: string | null;
  confirm_sent_at: string | null;
  unsubscribed_at: string | null;
  linked_user_id: string | null;
  total_count: number;
}

export interface ListSubscribersParams {
  search?: string;
  status?: SubscriberStatus;
  sort?: 'created_at' | 'email';
  dir?: SortDir;
  limit?: number;
  offset?: number;
}

export async function listSubscribers(
  p: ListSubscribersParams = {},
): Promise<AdminPage<AdminSubscriberRow>> {
  return paginate(
    await rpc<AdminSubscriberRow[]>('admin_list_subscribers', {
      p_search: p.search ?? null,
      p_status: p.status ?? 'all',
      p_sort: p.sort ?? 'created_at',
      p_dir: p.dir ?? 'desc',
      p_limit: p.limit ?? 50,
      p_offset: p.offset ?? 0,
    }),
  );
}

// ───────────────── comments ─────────────────

export interface AdminCommentRow {
  id: string;
  market_id: string;
  user_id: string;
  author_name: string | null;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted: boolean;
  parent_id: string | null;
  report_count: number;
  total_count: number;
}

export interface ListCommentsParams {
  search?: string;
  includeDeleted?: boolean;
  dir?: SortDir;
  limit?: number;
  offset?: number;
}

export async function listComments(
  p: ListCommentsParams = {},
): Promise<AdminPage<AdminCommentRow>> {
  return paginate(
    await rpc<AdminCommentRow[]>('admin_list_comments', {
      p_search: p.search ?? null,
      p_include_deleted: p.includeDeleted ?? true,
      p_sort: 'created_at',
      p_dir: p.dir ?? 'desc',
      p_limit: p.limit ?? 50,
      p_offset: p.offset ?? 0,
    }),
  );
}

// ───────────────── moderation queue ─────────────────

export interface AdminModerationRow {
  comment_id: string;
  market_id: string;
  user_id: string;
  author_name: string | null;
  body: string;
  deleted: boolean;
  created_at: string;
  n_reports: number;
  categories: Record<string, number>;
  last_reported_at: string;
  total_count: number;
}

export async function moderationQueue(
  p: { limit?: number; offset?: number } = {},
): Promise<AdminPage<AdminModerationRow>> {
  return paginate(
    await rpc<AdminModerationRow[]>('admin_moderation_queue', {
      p_limit: p.limit ?? 50,
      p_offset: p.offset ?? 0,
    }),
  );
}

// ───────────────── admins + audit ─────────────────

export interface AdminListRow {
  user_id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  added_at: string;
  added_by: string | null;
  added_by_name: string | null;
}

export function listAdmins(): Promise<AdminListRow[]> {
  return rpc<AdminListRow[]>('admin_list_admins');
}

export interface AdminAuditRow {
  id: string;
  actor_id: string;
  actor_name: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
  total_count: number;
}

export async function listAudit(
  p: { limit?: number; offset?: number } = {},
): Promise<AdminPage<AdminAuditRow>> {
  return paginate(
    await rpc<AdminAuditRow[]>('admin_list_audit', {
      p_limit: p.limit ?? 100,
      p_offset: p.offset ?? 0,
    }),
  );
}

// ───────────────── operations (pipeline runs) ─────────────────

export interface PipelineRunRow {
  id: string;
  run_at: string;
  duration_ms: number | null;
  generated: number | null;
  skipped: number | null;
  results: number | null;
  briefed: number | null;
  gemini_down: boolean;
  commit_sha: string | null;
  run_id: string | null;
  /** The full end-of-run summary (LLM usage, source errors, funnel) the pipeline wrote. */
  detail: PipelineRunSummary | null;
  total_count: number;
}

/** Recent Pulse Pipeline runs (newest first) for the admin Operations console. */
export async function listPipelineRuns(
  p: { limit?: number } = {},
): Promise<AdminPage<PipelineRunRow>> {
  return paginate(
    await rpc<PipelineRunRow[]>('admin_list_pipeline_runs', { p_limit: p.limit ?? 100 }),
  );
}

// ───────────────── actions ─────────────────

export function setCommentDeleted(
  commentId: string,
  deleted: boolean,
  reason?: string,
): Promise<void> {
  return rpc<void>('admin_set_comment_deleted', {
    p_comment_id: commentId,
    p_deleted: deleted,
    p_reason: reason ?? null,
  });
}

export function recomputeTrust(userId: string): Promise<void> {
  return rpc<void>('admin_recompute_trust', { p_user_id: userId });
}

export function grantAdmin(userId: string): Promise<void> {
  return rpc<void>('admin_grant_admin', { p_user_id: userId });
}

export function revokeAdmin(userId: string): Promise<void> {
  return rpc<void>('admin_revoke_admin', { p_user_id: userId });
}

export function setUserBanned(
  userId: string,
  banned: boolean,
  until?: string | null,
): Promise<void> {
  return rpc<void>('admin_set_user_banned', {
    p_user_id: userId,
    p_banned: banned,
    p_until: until ?? null,
  });
}

export function deleteUser(userId: string): Promise<void> {
  return rpc<void>('admin_delete_user', { p_user_id: userId });
}

export function unsubscribeSubscriber(email: string): Promise<void> {
  return rpc<void>('admin_unsubscribe_subscriber', { p_email: email });
}

export function deleteSubscriber(email: string): Promise<void> {
  return rpc<void>('admin_delete_subscriber', { p_email: email });
}
