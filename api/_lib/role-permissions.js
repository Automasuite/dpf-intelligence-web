export const WORKSPACE_ROLE_PERMISSIONS = Object.freeze({
  owner: Object.freeze([
    'contacts.read','batches.preview','batches.approve','batches.commit','batches.rollback',
    'permissions.manage','suppressions.create','members.manage','contacts.export',
  ]),
  admin: Object.freeze([
    'contacts.read','batches.preview','batches.approve','batches.commit','batches.rollback',
    'permissions.manage','suppressions.create','members.manage','contacts.export',
  ]),
  operator: Object.freeze([
    'contacts.read','batches.preview','suppressions.create',
  ]),
  reviewer: Object.freeze([
    'contacts.read','batches.approve',
  ]),
})

export function canPerformWorkspaceAction(role, action) {
  return Boolean(WORKSPACE_ROLE_PERMISSIONS[role]?.includes(action))
}
