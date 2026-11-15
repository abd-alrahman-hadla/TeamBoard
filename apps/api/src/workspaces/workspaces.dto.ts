import {
  createWorkspaceInputSchema,
  transferOwnershipInputSchema,
  updateMemberRoleInputSchema,
  updateWorkspaceInputSchema,
} from '@teamboard/shared';
import { createZodDto } from '../common/zod-dto';

export class CreateWorkspaceDto extends createZodDto(createWorkspaceInputSchema) {}
export class UpdateWorkspaceDto extends createZodDto(updateWorkspaceInputSchema) {}
export class TransferOwnershipDto extends createZodDto(transferOwnershipInputSchema) {}
export class UpdateMemberRoleDto extends createZodDto(updateMemberRoleInputSchema) {}
