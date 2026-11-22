import type { ColumnRole, RowIssue } from '@/services/import-export/delimited';

export const ISSUE_LABEL: Record<RowIssue, string> = {
  missing_front: 'No term',
  missing_back: 'No definition',
  duplicate: 'Duplicate',
  duplicate_existing: 'Already in set',
  too_long: 'Too long',
};

export const ROLE_LABEL: Record<ColumnRole, string> = {
  front: 'Term',
  back: 'Definition',
  explanation: 'Explanation',
  accepted: 'Alt. answers',
  ignore: 'Ignore',
};
