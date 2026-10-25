import { AppError } from '../domain/errors.js';
import type { AppConfig } from '../config/schema.js';
import {
  PERSON_ASSOCIATIONS,
  type MediaClassification,
  type PersonAssociation,
} from '../types/activity.js';
import { foldText } from '../utils/text.js';
import { normalizeUrl } from '../utils/url.js';
import type {
  ProtectionRuleRecord,
  ProtectedPersonRecord,
} from '../database/repositories/protection.repository.js';
import type {
  FamilyMemoryPolicy,
  ProtectedPersonPolicy,
  ProtectionPolicy,
  ProtectionRule,
} from './engine.js';

function personKey(input: {
  name: string;
  profileUrl: string | null;
  profileId: string | null;
}): string {
  return input.profileId ?? normalizeUrl(input.profileUrl) ?? foldText(input.name);
}

function toPerson(input: {
  id: string;
  name: string;
  relationship?: string | null;
  profileUrl?: string | null;
  profileId?: string | null;
  protect?: readonly PersonAssociation[];
}): ProtectedPersonPolicy {
  return {
    id: input.id,
    name: input.name,
    relationship: input.relationship ?? null,
    profileUrl: input.profileUrl ?? null,
    profileId: input.profileId ?? null,
    protect: [...(input.protect ?? PERSON_ASSOCIATIONS)],
  };
}

function ruleFromUnknown(
  id: string,
  type: string,
  action: 'protect' | 'review',
  value: unknown,
): ProtectionRule {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const stringValue =
    typeof value === 'string' ? value : typeof record.value === 'string' ? record.value : null;
  const values = Array.isArray(record.values)
    ? record.values.filter((entry): entry is string => typeof entry === 'string')
    : typeof value === 'string'
      ? [value]
      : [];
  switch (type) {
    case 'keyword':
      return { id, type, action, values };
    case 'hashtag':
      return { id, type, action, values };
    case 'person':
    case 'album':
    case 'post_url':
    case 'profile_url':
    case 'album_url':
    case 'activity_id':
      if (!stringValue) {
        throw new AppError(`Protection rule ${id} needs a string value.`);
      }
      return { id, type, action, value: stringValue };
    case 'media_classification': {
      if (
        stringValue !== 'protected' &&
        stringValue !== 'potential_family_memory' &&
        stringValue !== 'unclassified'
      ) {
        throw new AppError(`Protection rule ${id} has an invalid media classification.`);
      }
      return { id, type, action, value: stringValue as MediaClassification };
    }
    case 'date_range':
      return {
        id,
        type,
        action,
        from: typeof record.from === 'string' ? record.from : null,
        to: typeof record.to === 'string' ? record.to : null,
      };
    default:
      throw new AppError(`Unknown protection rule type: ${type}`);
  }
}

export function assemblePolicy(
  config: AppConfig,
  storedPeople: readonly ProtectedPersonRecord[],
  storedRules: readonly ProtectionRuleRecord[],
): ProtectionPolicy {
  const people = new Map<string, ProtectedPersonPolicy>();
  config.protection.people.forEach((person, index) => {
    const policy = toPerson({
      id: `config-person-${index + 1}`,
      name: person.name,
      relationship: person.relationship ?? null,
      profileUrl: person.profile_url ?? null,
      profileId: person.profile_id ?? null,
      ...(person.protect ? { protect: person.protect } : {}),
    });
    people.set(personKey(policy), policy);
  });
  for (const person of storedPeople) {
    const policy = toPerson(person);
    people.set(personKey(policy), policy);
  }

  const rules = new Map<string, ProtectionRule>();
  for (const rule of config.protection.rules) {
    const value = rule.value ?? { values: rule.values ?? [] };
    rules.set(rule.id, ruleFromUnknown(rule.id, rule.type, rule.action, value));
  }
  for (const rule of storedRules) {
    if (!rule.enabled) {
      rules.delete(rule.ruleKey);
      continue;
    }
    rules.set(rule.ruleKey, ruleFromUnknown(rule.ruleKey, rule.ruleType, rule.action, rule.value));
  }

  const family: FamilyMemoryPolicy = {
    enabled: config.protection.family_memories.enabled,
    protectTaggedFamilyMembers: config.protection.family_memories.protect_tagged_family_members,
    protectPhotoAlbums: config.protection.family_memories.protect_photo_albums,
    protectRelationshipMilestones:
      config.protection.family_memories.protect_relationship_milestones,
    protectFamilyEvents: config.protection.family_memories.protect_family_events,
    keywords: [...config.protection.family_memories.keywords],
  };
  return { people: [...people.values()], rules: [...rules.values()], familyMemories: family };
}
