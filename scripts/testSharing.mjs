import { importTs, check, finish } from './bundleForTest.mjs';

// Access resolution, share links and save-conflict detection.
// NOTE: the rule-mirror section below is a JS copy of firestore.rules, not the rules themselves.
// It pins the intended behaviour; the real check is the Firebase Rules Playground / emulator.

const {
  resolveRole, canEdit, canShare, canDelete, describeRole,
  buildShareUrl, parseShareParams, createShareToken,
  detectConflict, nextMembersAfterInviteClaim, nextMembersAfterRemoval,
  inviteId, normalizeEmail, isLikelyEmail,
} = await importTs('services/firebase/shareAccess.ts');

const OWNER = 'uid_owner';
const EDITOR = 'uid_editor';
const VIEWER = 'uid_viewer';
const STRANGER = 'uid_stranger';

const project = (overrides = {}) => ({
  ownerId: OWNER,
  members: { [EDITOR]: 'editor', [VIEWER]: 'viewer' },
  memberIds: [EDITOR, VIEWER],
  linkAccess: 'none',
  ...overrides,
});

// --- resolveRole truth table -----------------------------------------------------------------
check(resolveRole(project(), OWNER) === 'owner', 'Owner is owner');
check(resolveRole(project(), EDITOR) === 'editor', 'Invited editor can edit');
check(resolveRole(project(), VIEWER) === 'viewer', 'Invited viewer can view');
check(resolveRole(project(), STRANGER) === null, 'Stranger has no access to a restricted project');
check(resolveRole(project(), null) === null, 'Signed-out user has no access to a restricted project');
check(resolveRole(project({ linkAccess: 'view' }), STRANGER) === 'viewer', 'Link sharing grants viewing to anyone with the link');
check(resolveRole(project({ linkAccess: 'view' }), EDITOR) === 'editor', 'Link sharing does not downgrade an editor');
check(resolveRole(project({ linkAccess: 'view' }), OWNER) === 'owner', 'Link sharing does not downgrade the owner');
check(resolveRole(null, OWNER) === null, 'A missing project has no role');
check(resolveRole(project({ members: null, memberIds: null }), EDITOR) === null, 'A project with no members has no members');
check(resolveRole({ ownerId: OWNER }, undefined) === null, 'Undefined uid never matches the owner');

// A link must never grant editing, however it is configured.
for (const link of ['view', 'none', undefined, 'edit']) {
  check(!canEdit(resolveRole(project({ members: {}, memberIds: [], linkAccess: link }), STRANGER)), `Link access "${link}" never allows editing`);
}

// --- capability helpers -----------------------------------------------------------------------
check(canEdit('owner') && canEdit('editor') && !canEdit('viewer') && !canEdit(null), 'canEdit');
check(canShare('owner') && !canShare('editor') && !canShare('viewer'), 'Only the owner can change sharing');
check(canDelete('owner') && !canDelete('editor'), 'Only the owner can delete');
check(describeRole('editor') === 'Can edit' && describeRole(null) === 'No access', 'describeRole');

// --- share links ------------------------------------------------------------------------------
const url = buildShareUrl('https://archai.app/', 'proj123', 'tok_abc');
check(url === 'https://archai.app/?p=proj123&s=tok_abc', `Share URL shape (${url})`);
const parsed = parseShareParams(new URL(url).search);
check(parsed.projectId === 'proj123' && parsed.token === 'tok_abc', 'Share URL round-trips');
check(parseShareParams('?p=only-id').token === null, 'A link without a token still identifies the project');
check(parseShareParams('?checkout=success') === null, 'Other query strings are not share links');
check(parseShareParams('') === null, 'Empty query is not a share link');
check(createShareToken() !== createShareToken(), 'Share tokens are unique');

// --- conflicts --------------------------------------------------------------------------------
check(detectConflict(1000, 2000) === true, 'A newer stored copy is a conflict');
check(detectConflict(2000, 1000) === false, 'An older stored copy is not a conflict');
check(detectConflict(1000, 1000) === false, 'The same timestamp is not a conflict');
check(detectConflict(null, 5000) === false, 'No baseline means no conflict (first save or forced overwrite)');
check(detectConflict(1000, null) === false, 'No remote timestamp means no conflict');

// --- membership maths ---------------------------------------------------------------------------
const claimed = nextMembersAfterInviteClaim(project(), STRANGER, 'editor');
check(claimed.members[STRANGER] === 'editor' && claimed.members[EDITOR] === 'editor' && claimed.members[VIEWER] === 'viewer', 'Claiming an invite keeps the other members');
check(claimed.memberIds.length === 3 && claimed.memberIds.includes(STRANGER), 'memberIds stays in step with members');
const reclaimed = nextMembersAfterInviteClaim(claimed, STRANGER, 'editor');
check(reclaimed.memberIds.filter(id => id === STRANGER).length === 1, 'Claiming twice does not duplicate the member id');
const removed = nextMembersAfterRemoval(project(), EDITOR);
check(!removed.members[EDITOR] && !removed.memberIds.includes(EDITOR) && removed.memberIds.includes(VIEWER), 'Removing a member removes both entries');

// --- invites ------------------------------------------------------------------------------------
check(inviteId(' Person@Example.COM ', 'p1') === 'person@example.com__p1', 'Invite ids are normalised');
check(normalizeEmail('  A@B.co ') === 'a@b.co', 'Emails are trimmed and lowercased');
check(isLikelyEmail('a@b.co') && !isLikelyEmail('nope') && !isLikelyEmail('a@b') && !isLikelyEmail(''), 'Email validation');

// --- mirror of firestore.rules (see note at the top) ---------------------------------------------
const SHARING_KEYS = ['members', 'memberIds', 'linkAccess'];
const rulesAllowUpdate = (role, changedKeys) => {
  if (role === 'owner') return true;
  if (role === 'editor') return !changedKeys.some(key => SHARING_KEYS.includes(key));
  return false;
};
check(rulesAllowUpdate('owner', ['data', 'linkAccess']) === true, 'Rules mirror: owner may change sharing');
check(rulesAllowUpdate('editor', ['data', 'elementsCount']) === true, 'Rules mirror: editor may change content');
check(rulesAllowUpdate('editor', ['linkAccess']) === false, 'Rules mirror: editor may not change link access');
check(rulesAllowUpdate('editor', ['members']) === false, 'Rules mirror: editor may not add members');
check(rulesAllowUpdate('viewer', ['data']) === false, 'Rules mirror: viewer may not write at all');
check(rulesAllowUpdate(null, ['data']) === false, 'Rules mirror: a link viewer may not write');

finish();
