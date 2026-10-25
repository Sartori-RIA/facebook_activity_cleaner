import { z } from 'zod';
import { PERSON_ASSOCIATIONS } from '../types/activity.js';

export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

export const DEFAULT_FAMILY_KEYWORDS = [
  'família',
  'family',
  'esposa',
  'wife',
  'esposo',
  'husband',
  'filhos',
  'filho',
  'filha',
  'children',
  'casamento',
  'wedding',
  'aniversário',
  'birthday',
  'Natal',
  'Christmas',
] as const;

export const MILESTONE_KEYWORDS = [
  'noivado',
  'engagement',
  'aniversário de casamento',
  'anniversary',
  'bodas',
] as const;

export const FAMILY_EVENT_KEYWORDS = [
  'Natal',
  'Christmas',
  'Páscoa',
  'Easter',
  'reunião de família',
  'family reunion',
] as const;

const associationSchema = z.enum(PERSON_ASSOCIATIONS);

const personSchema = z.object({
  name: z.string().min(1),
  relationship: z.string().min(1).nullable().optional(),
  profile_url: z.string().url().nullable().optional(),
  profile_id: z.string().min(1).nullable().optional(),
  protect: z.array(associationSchema).min(1).optional(),
});

const ruleSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    'person',
    'keyword',
    'hashtag',
    'media_classification',
    'album',
    'post_url',
    'profile_url',
    'album_url',
    'date_range',
    'activity_id',
  ]),
  action: z.enum(['protect', 'review']),
  value: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
  values: z.array(z.string().min(1)).optional(),
});

export const appConfigSchema = z.object({
  timezone: z.string().min(1).default(DEFAULT_TIMEZONE),
  locale: z.enum(['pt-BR', 'en']).default('pt-BR'),
  delays: z
    .object({
      min_ms: z.number().int().min(0).max(60_000).default(2000),
      max_ms: z.number().int().min(0).max(120_000).default(5000),
    })
    .default({ min_ms: 2000, max_ms: 5000 }),
  limits: z
    .object({
      max_deletes_per_run: z.number().int().min(1).max(200).default(25),
      max_consecutive_failures: z.number().int().min(1).max(20).default(3),
      scroll_stagnation_limit: z.number().int().min(1).max(20).default(3),
      max_scrolls_per_scan: z.number().int().min(1).max(5000).default(500),
    })
    .default({
      max_deletes_per_run: 25,
      max_consecutive_failures: 3,
      scroll_stagnation_limit: 3,
      max_scrolls_per_scan: 500,
    }),
  protection: z
    .object({
      people: z.array(personSchema).default([]),
      family_memories: z
        .object({
          enabled: z.boolean().default(true),
          protect_tagged_family_members: z.boolean().default(true),
          protect_photo_albums: z.boolean().default(true),
          protect_relationship_milestones: z.boolean().default(true),
          protect_family_events: z.boolean().default(true),
          keywords: z.array(z.string().min(1)).default([...DEFAULT_FAMILY_KEYWORDS]),
        })
        .default({
          enabled: true,
          protect_tagged_family_members: true,
          protect_photo_albums: true,
          protect_relationship_milestones: true,
          protect_family_events: true,
          keywords: [...DEFAULT_FAMILY_KEYWORDS],
        }),
      rules: z.array(ruleSchema).default([]),
    })
    .default({
      people: [],
      family_memories: {
        enabled: true,
        protect_tagged_family_members: true,
        protect_photo_albums: true,
        protect_relationship_milestones: true,
        protect_family_events: true,
        keywords: [...DEFAULT_FAMILY_KEYWORDS],
      },
      rules: [],
    }),
  logging: z
    .object({
      level: z.enum(['silent', 'debug', 'info', 'warn', 'error']).default('warn'),
    })
    .default({ level: 'warn' }),
});

export type AppConfig = z.infer<typeof appConfigSchema>;

export function defaultConfig(): AppConfig {
  return appConfigSchema.parse({});
}
