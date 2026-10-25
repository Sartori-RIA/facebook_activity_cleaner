import { describe, expect, it } from 'vitest';
import { PERSON_ASSOCIATIONS } from '../../src/types/activity.js';
import { evaluateProtection } from '../../src/protection/engine.js';
import { LocalImageClassifier } from '../../src/protection/image-classifier.js';
import { previewGroup } from '../../src/protection/preview.js';
import { baseFacts, basePolicy } from '../helpers.js';

const spouse = {
  id: 'spouse',
  name: 'Natanaiah',
  relationship: 'spouse',
  profileUrl: 'https://www.facebook.com/natanaiah',
  profileId: '123',
  protect: [...PERSON_ASSOCIATIONS],
};

describe('protection priority', () => {
  it('protects a spouse comment, mention, tag, share, and authored post', () => {
    const policy = basePolicy({ people: [spouse] });
    expect(
      evaluateProtection(
        baseFacts({ activityType: 'comment', parentAuthorName: 'Natanaiah' }),
        policy,
      ).outcome,
    ).toBe('never_delete');
    expect(evaluateProtection(baseFacts({ text: 'almoço com Natanaiah' }), policy).outcome).toBe(
      'never_delete',
    );
    expect(evaluateProtection(baseFacts({ taggedNames: ['Natanaiah'] }), policy).outcome).toBe(
      'never_delete',
    );
    expect(evaluateProtection(baseFacts({ sharedFromName: 'Natanaiah' }), policy).outcome).toBe(
      'never_delete',
    );
    expect(
      evaluateProtection(baseFacts({ authorProfileId: '123', authorName: 'Someone Else' }), policy)
        .outcome,
    ).toBe('never_delete');
  });

  it('does not treat a different profile url as the protected person just because the display name matches', () => {
    const decision = evaluateProtection(
      baseFacts({
        authorName: 'Natanaiah',
        authorProfileUrl: 'https://www.facebook.com/another-natanaiah',
      }),
      basePolicy({ people: [spouse] }),
    );
    expect(decision.outcome).toBe('eligible');
  });

  it('sends an uncertain name link to review', () => {
    const decision = evaluateProtection(
      baseFacts({ taggedNames: ['Natanaiah Silva'] }),
      basePolicy({ people: [{ ...spouse, profileUrl: null, profileId: null }] }),
    );
    expect(decision.outcome).toBe('requires_review');
  });

  it('keeps family keywords even when the date is unknown', () => {
    const decision = evaluateProtection(
      baseFacts({
        text: 'Natal com a família',
        dateVerdict: 'unknown',
        datePrecision: 'unknown',
        occurredText: null,
        interval: null,
      }),
      basePolicy(),
    );
    expect(decision.outcome).toBe('never_delete');
    expect(decision.reasons.some((reason) => reason.code === 'family_keyword')).toBe(true);
  });

  it('protects albums, post urls, and explicit activity ids', () => {
    const policy = basePolicy({
      rules: [
        { id: 'album', type: 'album', action: 'protect', value: 'Family' },
        {
          id: 'post',
          type: 'post_url',
          action: 'protect',
          value: 'https://facebook.com/fixture/posts/9',
        },
        { id: 'id', type: 'activity_id', action: 'protect', value: 'keep-me' },
      ],
    });
    expect(evaluateProtection(baseFacts({ albumName: 'Family Vacation' }), policy).outcome).toBe(
      'never_delete',
    );
    expect(
      evaluateProtection(
        baseFacts({ sourceUrl: 'https://www.facebook.com/fixture/posts/9?fbclid=1' }),
        policy,
      ).outcome,
    ).toBe('never_delete');
    expect(evaluateProtection(baseFacts({ id: 'keep-me' }), policy).outcome).toBe('never_delete');
  });

  it('requires review for unclassified and potential family photos', () => {
    const classifier = new LocalImageClassifier();
    expect(classifier.uploadsPhotos).toBe(false);
    expect(classifier.classify({ activityId: 'photo' })).toBe('unclassified');
    const unclassified = evaluateProtection(
      baseFacts({
        activityType: 'media',
        mediaClassification: classifier.classify({ activityId: 'photo' }),
      }),
      basePolicy(),
    );
    expect(unclassified.outcome).toBe('requires_review');
    expect(previewGroup(unclassified)).toBe('potential_family_memories');
    const potential = evaluateProtection(
      baseFacts({ activityType: 'media', mediaClassification: 'potential_family_memory' }),
      basePolicy(),
    );
    expect(potential.outcome).toBe('requires_review');
  });

  it('does not let manual approval override explicit protection or unknown data', () => {
    const protectedDecision = evaluateProtection(
      baseFacts({ text: 'minha família', manualDecision: 'approve_deletion' }),
      basePolicy(),
    );
    expect(protectedDecision.outcome).toBe('never_delete');
    const unknownDate = evaluateProtection(
      baseFacts({
        manualDecision: 'approve_deletion',
        dateVerdict: 'unknown',
        datePrecision: 'unknown',
        occurredText: null,
        interval: null,
      }),
      basePolicy(),
    );
    expect(unknownDate.outcome).toBe('requires_review');
    const notOwned = evaluateProtection(baseFacts({ ownership: 'not_owned' }), basePolicy());
    expect(notOwned.outcome).toBe('not_owned');
  });

  it('allows approval of one unclassified photo with a known date and owner', () => {
    const decision = evaluateProtection(
      baseFacts({
        activityType: 'media',
        mediaClassification: 'unclassified',
        manualDecision: 'approve_deletion',
      }),
      basePolicy(),
    );
    expect(decision.outcome).toBe('eligible');
  });

  it('keeps reactions in review until a handler exists', () => {
    expect(evaluateProtection(baseFacts({ activityType: 'reaction' }), basePolicy()).outcome).toBe(
      'requires_review',
    );
  });

  it('turns family memories off without turning off a protected person', () => {
    const policy = basePolicy({
      people: [spouse],
      familyMemories: { ...basePolicy().familyMemories, enabled: false, keywords: [] },
    });
    expect(evaluateProtection(baseFacts({ text: 'família' }), policy).outcome).toBe('eligible');
    expect(
      evaluateProtection(
        baseFacts({ parentAuthorProfileId: '123', activityType: 'comment' }),
        policy,
      ).outcome,
    ).toBe('never_delete');
  });
});
