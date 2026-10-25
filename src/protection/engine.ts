import { FAMILY_EVENT_KEYWORDS, MILESTONE_KEYWORDS } from '../config/schema.js';
import type {
  ActivityType,
  MediaClassification,
  Ownership,
  PersonAssociation,
  DatePrecision,
} from '../types/activity.js';
import { PERSON_ASSOCIATIONS } from '../types/activity.js';
import type { DateVerdict, TimeInterval } from '../scanner/filters.js';
import { compareIntervalToWindow, compileDateFilter } from '../scanner/filters.js';
import { matchesKeyword, namesMatch } from '../utils/text.js';
import { normalizeUrl } from '../utils/url.js';

export interface ProtectedPersonPolicy {
  id: string;
  name: string;
  relationship: string | null;
  profileUrl: string | null;
  profileId: string | null;
  protect: PersonAssociation[];
  matchAction?: 'protect' | 'review';
}

export type ProtectionRule =
  | { id: string; type: 'keyword'; action: 'protect' | 'review'; values: string[] }
  | { id: string; type: 'hashtag'; action: 'protect' | 'review'; values: string[] }
  | { id: string; type: 'person'; action: 'protect' | 'review'; value: string }
  | { id: string; type: 'album'; action: 'protect' | 'review'; value: string }
  | { id: string; type: 'post_url'; action: 'protect' | 'review'; value: string }
  | { id: string; type: 'profile_url'; action: 'protect' | 'review'; value: string }
  | { id: string; type: 'album_url'; action: 'protect' | 'review'; value: string }
  | { id: string; type: 'activity_id'; action: 'protect' | 'review'; value: string }
  | {
      id: string;
      type: 'media_classification';
      action: 'protect' | 'review';
      value: MediaClassification;
    }
  | {
      id: string;
      type: 'date_range';
      action: 'protect' | 'review';
      from: string | null;
      to: string | null;
    };

export interface FamilyMemoryPolicy {
  enabled: boolean;
  protectTaggedFamilyMembers: boolean;
  protectPhotoAlbums: boolean;
  protectRelationshipMilestones: boolean;
  protectFamilyEvents: boolean;
  keywords: string[];
}

export interface ProtectionPolicy {
  people: ProtectedPersonPolicy[];
  rules: ProtectionRule[];
  familyMemories: FamilyMemoryPolicy;
}

export interface ActivityFacts {
  id: string;
  activityType: ActivityType;
  ownership: Ownership;
  dateVerdict: DateVerdict;
  datePrecision: DatePrecision;
  occurredText: string | null;
  timeZone: string;
  interval: TimeInterval | null;
  text: string;
  hashtags: string[];
  sourceUrl: string | null;
  authorName: string | null;
  authorProfileUrl: string | null;
  authorProfileId: string | null;
  taggedNames: string[];
  taggedProfileUrls: string[];
  mentionedNames: string[];
  albumName: string | null;
  albumUrl: string | null;
  sharedFromName: string | null;
  sharedFromProfileUrl: string | null;
  parentAuthorName: string | null;
  parentAuthorProfileUrl: string | null;
  parentAuthorProfileId: string | null;
  mediaClassification: MediaClassification | null;
  explicitlyProtected: boolean;
  manualDecision: 'protect' | 'approve_deletion' | 'skip' | null;
}

export interface ProtectionReason {
  code: string;
  action: 'protect' | 'review';
  ruleId: string | null;
  detail: string;
}

export type ProtectionOutcome =
  'never_delete' | 'requires_review' | 'eligible' | 'out_of_scope' | 'not_owned' | 'user_skipped';

export interface ProtectionDecision {
  outcome: ProtectionOutcome;
  reasons: ProtectionReason[];
}

interface Identity {
  name?: string | null;
  url?: string | null;
  id?: string | null;
}

function reason(
  code: string,
  action: 'protect' | 'review',
  detail: string,
  ruleId: string | null = null,
): ProtectionReason {
  return { code, action, detail, ruleId };
}

function identityMatch(
  person: ProtectedPersonPolicy,
  candidate: Identity,
): 'confident' | 'uncertain' | 'none' {
  if (person.profileId && candidate.id) {
    return person.profileId === candidate.id ? 'confident' : 'none';
  }
  const personUrl = normalizeUrl(person.profileUrl);
  const candidateUrl = normalizeUrl(candidate.url);
  if (personUrl && candidateUrl) {
    return personUrl === candidateUrl ? 'confident' : 'none';
  }
  if (candidate.name && namesMatch(person.name, candidate.name)) {
    return 'confident';
  }
  if (candidate.name && matchesKeyword(candidate.name, person.name)) {
    return 'uncertain';
  }
  return 'none';
}

function peopleWithRules(policy: ProtectionPolicy): ProtectedPersonPolicy[] {
  const fromRules: ProtectedPersonPolicy[] = policy.rules
    .filter((rule): rule is Extract<ProtectionRule, { type: 'person' }> => rule.type === 'person')
    .map((rule) => ({
      id: rule.id,
      name: rule.value,
      relationship: null,
      profileUrl: null,
      profileId: null,
      protect: [...PERSON_ASSOCIATIONS],
      matchAction: rule.action,
    }));
  return [...policy.people, ...fromRules];
}

function enabledAssociations(
  person: ProtectedPersonPolicy,
  family: FamilyMemoryPolicy,
): Set<PersonAssociation> {
  const associations = new Set<PersonAssociation>(person.protect);
  if (family.enabled && family.protectTaggedFamilyMembers) {
    associations.add('posts_tagging');
    associations.add('photos_with');
  }
  return associations;
}

function considerPerson(
  person: ProtectedPersonPolicy,
  facts: ActivityFacts,
  family: FamilyMemoryPolicy,
  reasons: ProtectionReason[],
): void {
  const allowed = enabledAssociations(person, family);
  const action = person.matchAction ?? 'protect';
  const roles: Array<{ association: PersonAssociation; candidate: Identity }> = [];
  if (facts.authorName || facts.authorProfileUrl || facts.authorProfileId) {
    roles.push({
      association: 'posts_authored_by',
      candidate: { name: facts.authorName, url: facts.authorProfileUrl, id: facts.authorProfileId },
    });
  }
  if (facts.sharedFromName || facts.sharedFromProfileUrl) {
    roles.push({
      association: 'shared_posts_from',
      candidate: { name: facts.sharedFromName, url: facts.sharedFromProfileUrl },
    });
  }
  if (facts.parentAuthorName || facts.parentAuthorProfileUrl || facts.parentAuthorProfileId) {
    roles.push({
      association: 'comments_on_posts_by',
      candidate: {
        name: facts.parentAuthorName,
        url: facts.parentAuthorProfileUrl,
        id: facts.parentAuthorProfileId,
      },
    });
  }
  for (const name of facts.taggedNames) {
    roles.push({
      association: facts.activityType === 'media' ? 'photos_with' : 'posts_tagging',
      candidate: { name },
    });
  }
  for (const url of facts.taggedProfileUrls) {
    roles.push({
      association: facts.activityType === 'media' ? 'photos_with' : 'posts_tagging',
      candidate: { url },
    });
  }
  for (const name of facts.mentionedNames) {
    roles.push({ association: 'posts_mentioning', candidate: { name } });
  }
  if (matchesKeyword(facts.text, person.name)) {
    roles.push({ association: 'posts_mentioning', candidate: { name: person.name } });
  }

  for (const role of roles) {
    const match = identityMatch(person, role.candidate);
    if (match === 'none') {
      continue;
    }
    const covered = allowed.has(role.association);
    if (match === 'uncertain' || !covered) {
      reasons.push(
        reason(
          'uncertain_person_association',
          'review',
          `${person.name} is linked to this activity, but the association is not confident enough to classify.`,
          person.id,
        ),
      );
      continue;
    }
    reasons.push(
      reason('protected_person', action, `${person.name} matches ${role.association}.`, person.id),
    );
  }
}

function familyKeywords(family: FamilyMemoryPolicy): string[] {
  if (!family.enabled) {
    return [];
  }
  const values = [...family.keywords];
  if (family.protectRelationshipMilestones) {
    values.push(...MILESTONE_KEYWORDS);
  }
  if (family.protectFamilyEvents) {
    values.push(...FAMILY_EVENT_KEYWORDS);
  }
  return [...new Set(values)];
}

function urlsMatch(left: string | null, right: string | null): boolean {
  const a = normalizeUrl(left);
  const b = normalizeUrl(right);
  return Boolean(a && b && a === b);
}

function applyDateRange(
  rule: Extract<ProtectionRule, { type: 'date_range' }>,
  facts: ActivityFacts,
  reasons: ProtectionReason[],
): void {
  if (!rule.from && !rule.to) {
    reasons.push(
      reason(
        'invalid_date_range',
        'review',
        `Date range rule ${rule.id} has no bounds, so this activity is held for review.`,
        rule.id,
      ),
    );
    return;
  }
  if (!facts.interval || facts.dateVerdict === 'unknown') {
    reasons.push(
      reason(
        'protected_date_range_unknown',
        'review',
        `Date range rule ${rule.id} is active and this activity has no confident date.`,
        rule.id,
      ),
    );
    return;
  }
  const window = compileDateFilter(
    {
      ...(rule.from ? { from: rule.from } : {}),
      ...(rule.to ? { to: rule.to } : {}),
    },
    facts.timeZone,
  );
  const verdict = compareIntervalToWindow(facts.interval, window);
  if (verdict === 'inside') {
    reasons.push(
      reason(
        'protected_date_range',
        rule.action,
        `Activity falls inside protected range ${rule.id}.`,
        rule.id,
      ),
    );
  } else if (verdict === 'ambiguous') {
    reasons.push(
      reason(
        'protected_date_range_ambiguous',
        'review',
        `Activity overlaps protected range ${rule.id}, but not completely.`,
        rule.id,
      ),
    );
  }
}

function collectReasons(facts: ActivityFacts, policy: ProtectionPolicy): ProtectionReason[] {
  const reasons: ProtectionReason[] = [];
  if (facts.explicitlyProtected) {
    reasons.push(reason('explicit_activity', 'protect', 'This activity is explicitly protected.'));
  }
  if (facts.manualDecision === 'protect') {
    reasons.push(reason('manual_protect', 'protect', 'You marked this activity as protected.'));
  }
  if (facts.ownership === 'uncertain') {
    reasons.push(reason('uncertain_ownership', 'review', 'Ownership is not confident.'));
  }
  if (facts.activityType === 'unknown' || facts.activityType === 'other') {
    reasons.push(
      reason('unknown_type', 'review', 'The activity type is not confident enough to delete.'),
    );
  }
  if (facts.dateVerdict === 'unknown') {
    reasons.push(reason('unknown_date', 'review', 'The activity date is unknown.'));
  } else if (facts.dateVerdict === 'ambiguous') {
    reasons.push(
      reason('ambiguous_date', 'review', 'The activity date overlaps the filter boundary.'),
    );
  }
  if (facts.activityType === 'reaction') {
    reasons.push(
      reason(
        'handler_not_ready',
        'review',
        'Reaction deletion has no validated handler in this build.',
      ),
    );
  }

  for (const person of peopleWithRules(policy)) {
    considerPerson(person, facts, policy.familyMemories, reasons);
  }

  for (const keyword of familyKeywords(policy.familyMemories)) {
    if (
      matchesKeyword(facts.text, keyword) ||
      facts.hashtags.some((tag) => matchesKeyword(tag, keyword))
    ) {
      reasons.push(reason('family_keyword', 'protect', `Family keyword “${keyword}” matched.`));
    }
  }

  if (
    policy.familyMemories.enabled &&
    policy.familyMemories.protectPhotoAlbums &&
    facts.albumName &&
    familyKeywords(policy.familyMemories).some((keyword) =>
      matchesKeyword(facts.albumName ?? '', keyword),
    )
  ) {
    reasons.push(
      reason('family_album', 'protect', `Album “${facts.albumName}” looks like a family album.`),
    );
  }

  if (facts.activityType === 'media') {
    const classification = facts.mediaClassification ?? 'unclassified';
    if (classification === 'protected') {
      reasons.push(
        reason('media_protected', 'protect', 'The photo or video is classified as protected.'),
      );
    } else if (classification === 'potential_family_memory') {
      reasons.push(
        reason(
          'media_potential_family',
          'review',
          'The photo may be a family memory and needs a manual decision.',
        ),
      );
    } else {
      reasons.push(
        reason(
          'media_unclassified',
          'review',
          'The photo is unclassified. Image classification is never proof that it is safe to delete.',
        ),
      );
    }
  }

  for (const rule of policy.rules) {
    if (!ruleMatches(rule, facts, reasons)) {
      continue;
    }
  }
  return reasons;
}

function ruleMatches(
  rule: ProtectionRule,
  facts: ActivityFacts,
  reasons: ProtectionReason[],
): boolean {
  switch (rule.type) {
    case 'person':
      return false;
    case 'keyword': {
      const hit = rule.values.some(
        (keyword) =>
          matchesKeyword(facts.text, keyword) ||
          facts.hashtags.some((tag) => matchesKeyword(tag, keyword)),
      );
      if (hit) {
        reasons.push(reason('keyword', rule.action, `Keyword rule ${rule.id} matched.`, rule.id));
      }
      return hit;
    }
    case 'hashtag': {
      const hit = rule.values.some((tag) =>
        facts.hashtags.some((candidate) =>
          matchesKeyword(candidate.replace(/^#/, ''), tag.replace(/^#/, '')),
        ),
      );
      if (hit) {
        reasons.push(reason('hashtag', rule.action, `Hashtag rule ${rule.id} matched.`, rule.id));
      }
      return hit;
    }
    case 'album': {
      const hit = Boolean(facts.albumName && matchesKeyword(facts.albumName, rule.value));
      if (hit) {
        reasons.push(
          reason('protected_album', rule.action, `Album rule ${rule.id} matched.`, rule.id),
        );
      }
      return hit;
    }
    case 'album_url': {
      const hit = urlsMatch(facts.albumUrl, rule.value);
      if (hit) {
        reasons.push(
          reason('protected_album', rule.action, `Album URL rule ${rule.id} matched.`, rule.id),
        );
      }
      return hit;
    }
    case 'post_url': {
      const hit = urlsMatch(facts.sourceUrl, rule.value);
      if (hit) {
        reasons.push(
          reason('protected_post_url', rule.action, `Post URL rule ${rule.id} matched.`, rule.id),
        );
      }
      return hit;
    }
    case 'profile_url': {
      const hit = [
        facts.authorProfileUrl,
        facts.sharedFromProfileUrl,
        facts.parentAuthorProfileUrl,
      ].some((url) => urlsMatch(url, rule.value));
      if (hit) {
        reasons.push(
          reason(
            'protected_profile_url',
            rule.action,
            `Profile URL rule ${rule.id} matched.`,
            rule.id,
          ),
        );
      }
      return hit;
    }
    case 'activity_id': {
      const hit = facts.id === rule.value;
      if (hit) {
        reasons.push(
          reason('explicit_activity', rule.action, `Activity id rule ${rule.id} matched.`, rule.id),
        );
      }
      return hit;
    }
    case 'media_classification': {
      const classification =
        facts.mediaClassification ?? (facts.activityType === 'media' ? 'unclassified' : null);
      const hit = classification === rule.value;
      if (hit) {
        reasons.push(
          reason(
            'media_rule',
            rule.action,
            `Media classification rule ${rule.id} matched ${rule.value}.`,
            rule.id,
          ),
        );
      }
      return hit;
    }
    case 'date_range':
      applyDateRange(rule, facts, reasons);
      return false;
    default: {
      const _exhaustive: never = rule;
      return _exhaustive;
    }
  }
}

function approvalAllowed(facts: ActivityFacts): boolean {
  return (
    facts.ownership === 'owned' &&
    facts.dateVerdict === 'inside' &&
    facts.activityType !== 'unknown' &&
    facts.activityType !== 'other'
  );
}

export function evaluateProtection(
  facts: ActivityFacts,
  policy: ProtectionPolicy,
): ProtectionDecision {
  const reasons = collectReasons(facts, policy);
  const protectReasons = reasons.filter((entry) => entry.action === 'protect');
  const reviewReasons = reasons.filter((entry) => entry.action === 'review');

  if (protectReasons.length > 0) {
    const ignored =
      facts.manualDecision === 'approve_deletion'
        ? [
            reason(
              'approval_ignored_explicit_protection',
              'protect',
              'Manual approval cannot override an explicit protection rule.',
            ),
          ]
        : [];
    return { outcome: 'never_delete', reasons: [...protectReasons, ...reviewReasons, ...ignored] };
  }
  if (facts.ownership === 'not_owned') {
    return {
      outcome: 'not_owned',
      reasons: [
        reason('not_owned', 'review', 'This activity is not owned by the authenticated user.'),
        ...reviewReasons,
      ],
    };
  }
  if (facts.manualDecision === 'skip') {
    return {
      outcome: 'user_skipped',
      reasons: [
        reason('manual_skip', 'review', 'You chose to skip this activity for now.'),
        ...reviewReasons,
      ],
    };
  }
  if (facts.manualDecision === 'approve_deletion') {
    if (facts.dateVerdict === 'outside') {
      return {
        outcome: 'out_of_scope',
        reasons: [
          reason('outside_filter', 'review', 'This activity is outside the active date filter.'),
          ...reviewReasons,
        ],
      };
    }
    if (approvalAllowed(facts)) {
      return {
        outcome: 'eligible',
        reasons: [
          reason('manual_approval', 'review', 'You approved this specific activity for deletion.'),
          ...reviewReasons,
        ],
      };
    }
    return {
      outcome: 'requires_review',
      reasons: [
        reason(
          'approval_blocked',
          'review',
          'Approval cannot create a date, an owner, or a type that is still unknown.',
        ),
        ...reviewReasons,
      ],
    };
  }
  if (reviewReasons.length > 0) {
    return { outcome: 'requires_review', reasons: reviewReasons };
  }
  if (facts.dateVerdict === 'outside') {
    return { outcome: 'out_of_scope', reasons: [] };
  }
  if (
    facts.dateVerdict === 'inside' &&
    facts.ownership === 'owned' &&
    (facts.activityType === 'post' ||
      facts.activityType === 'comment' ||
      facts.activityType === 'reaction')
  ) {
    return { outcome: 'eligible', reasons: [] };
  }
  return {
    outcome: 'requires_review',
    reasons: [
      reason(
        'incomplete_metadata',
        'review',
        'The activity does not have enough confident metadata.',
      ),
    ],
  };
}

export function emptyFamilyPolicy(overrides: Partial<FamilyMemoryPolicy> = {}): FamilyMemoryPolicy {
  return {
    enabled: true,
    protectTaggedFamilyMembers: true,
    protectPhotoAlbums: true,
    protectRelationshipMilestones: true,
    protectFamilyEvents: true,
    keywords: [],
    ...overrides,
  };
}
