import test from 'node:test'
import assert from 'node:assert/strict'
import { canPerformWorkspaceAction } from '../api/_lib/role-permissions.js'

test('owners and admins can manage batches and workspace membership', () => {
  for (const role of ['owner','admin']) {
    for (const action of ['batches.preview','batches.approve','batches.commit','batches.rollback','members.manage','contacts.export']) {
      assert.equal(canPerformWorkspaceAction(role, action), true, `${role} should be allowed ${action}`)
    }
  }
})

test('operators can preview but cannot approve, commit, rollback or export', () => {
  assert.equal(canPerformWorkspaceAction('operator','batches.preview'), true)
  for (const action of ['batches.approve','batches.commit','batches.rollback','contacts.export','members.manage']) {
    assert.equal(canPerformWorkspaceAction('operator',action), false)
  }
})

test('reviewers can approve but cannot commit or modify membership', () => {
  assert.equal(canPerformWorkspaceAction('reviewer','batches.approve'), true)
  for (const action of ['batches.preview','batches.commit','batches.rollback','members.manage','contacts.export']) {
    assert.equal(canPerformWorkspaceAction('reviewer',action), false)
  }
})

test('unknown roles and actions are denied by default', () => {
  assert.equal(canPerformWorkspaceAction('superuser','contacts.read'), false)
  assert.equal(canPerformWorkspaceAction('operator','unknown.action'), false)
  assert.equal(canPerformWorkspaceAction(null,'contacts.read'), false)
})
