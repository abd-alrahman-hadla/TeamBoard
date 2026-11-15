import { z } from 'zod';
import { assignableRoleSchema, roleSchema } from '../roles';
import { emailSchema } from './auth';
import { idSchema, timestampSchema, userSummarySchema } from './common';

export const workspaceNameSchema = z
  .string()
  .trim()
  .min(1, { error: 'Name is required' })
  .max(80, { error: 'Name must be at most 80 characters' });

export const createWorkspaceInputSchema = z.object({ name: workspaceNameSchema });
export const updateWorkspaceInputSchema = z.object({ name: workspaceNameSchema });
export const transferOwnershipInputSchema = z.object({ userId: idSchema });

export const workspaceSchema = z.object({
  id: idSchema,
  name: z.string(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

/** A workspace as seen by the caller, with their role in it. */
export const myWorkspaceSchema = workspaceSchema.extend({ role: roleSchema });

export const memberSchema = z.object({
  userId: idSchema,
  name: z.string(),
  email: z.email(),
  role: roleSchema,
  joinedAt: timestampSchema,
});

export const updateMemberRoleInputSchema = z.object({ role: assignableRoleSchema });

export const createInvitationInputSchema = z.object({
  email: emailSchema,
  role: assignableRoleSchema,
});

export const invitationSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  email: z.email(),
  role: assignableRoleSchema,
  expiresAt: timestampSchema,
  createdAt: timestampSchema,
  invitedBy: userSummarySchema.nullable(),
});

/** Returned once, to the inviter: the link carries the only copy of the raw token. */
export const createdInvitationSchema = z.object({
  invitation: invitationSchema,
  link: z.url(),
});

/** Public preview behind the token link (no auth): just enough to decide whether to accept. */
export const invitationPreviewSchema = z.object({
  workspace: z.object({ id: idSchema, name: z.string() }),
  role: assignableRoleSchema,
  email: z.string(),
  invitedBy: z.string().nullable(),
  expiresAt: timestampSchema,
});

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceInputSchema>;
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceInputSchema>;
export type TransferOwnershipInput = z.infer<typeof transferOwnershipInputSchema>;
export type Workspace = z.infer<typeof workspaceSchema>;
export type MyWorkspace = z.infer<typeof myWorkspaceSchema>;
export type Member = z.infer<typeof memberSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleInputSchema>;
export type CreateInvitationInput = z.infer<typeof createInvitationInputSchema>;
export type Invitation = z.infer<typeof invitationSchema>;
export type CreatedInvitation = z.infer<typeof createdInvitationSchema>;
export type InvitationPreview = z.infer<typeof invitationPreviewSchema>;
