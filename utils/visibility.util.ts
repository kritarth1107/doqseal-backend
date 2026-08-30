import { FilterQuery } from 'mongoose';

/**
 * Org members can see resources that are shared with the organisation,
 * or that they themselves created. Legacy docs/projects without the flag
 * are treated as shared (previous org-wide behaviour).
 */
export function visibilityFilter(
  userId: string,
  creatorField: 'uploadedBy' | 'createdBy' = 'uploadedBy'
): FilterQuery<any> {
  return {
    $or: [
      { sharedWithOrganisation: true },
      { sharedWithOrganisation: { $exists: false } },
      { [creatorField]: userId },
    ],
  };
}

export const COMMON_PROJECT_FOLDER = '_common';
