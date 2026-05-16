/**
 * HRPod Zod schemas — workflow-design-closure §4 HR Pod Model primitive.
 *
 * Default operating target (tunable per tenant via Policy): ~200 workers +
 * ~4 supervisors per pod. Primary owner + backup owner per pod.
 *
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §4)
 */

import { z } from 'zod';

/**
 * HRPod row shape.
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §4)
 */
export const HRPodSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  name: z.string().min(1).max(120),
  primaryOwnerUserId: z.string().uuid(),
  backupOwnerUserId: z.string().uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/**
 * Inferred HRPod type.
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §4)
 */
export type HRPod = z.infer<typeof HRPodSchema>;

/**
 * Input for creating a new HRPod.
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §4)
 */
export const CreateHRPodInput = z.object({
  companyId: z.string().uuid(),
  name: z.string().min(1).max(120),
  primaryOwnerUserId: z.string().uuid(),
  backupOwnerUserId: z.string().uuid().nullable().optional(),
});

/**
 * Inferred CreateHRPodInput type.
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §4)
 */
export type CreateHRPodInput = z.infer<typeof CreateHRPodInput>;

/**
 * Input for updating an existing HRPod (rename / re-owner).
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §4)
 */
export const UpdateHRPodInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120).optional(),
  primaryOwnerUserId: z.string().uuid().optional(),
  backupOwnerUserId: z.string().uuid().nullable().optional(),
});

/**
 * Inferred UpdateHRPodInput type.
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §4)
 */
export type UpdateHRPodInput = z.infer<typeof UpdateHRPodInput>;
